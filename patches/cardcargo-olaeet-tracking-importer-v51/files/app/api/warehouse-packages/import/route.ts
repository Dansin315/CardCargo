import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { normalizeDomesticTrackingNumber } from '@/lib/domestic-tracking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const nullableText = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().default(null).transform((value) => value || null)
const nullableNumber = z.number().finite().min(0).nullable().default(null)
const nullableTimestamp = z.string().datetime({ offset: true }).nullable().default(null)

const importRecordSchema = z
  .object({
    externalPackageId: nullableText(200),
    packageDescription: nullableText(2_000),
    senderName: nullableText(200),
    domesticCarrier: nullableText(120),
    domesticTrackingNumber: nullableText(200),
    providerStatus: nullableText(200),
    arrivedAt: nullableTimestamp,
    inspectedAt: nullableTimestamp,
    weightGrams: nullableNumber,
    lengthCm: nullableNumber,
    widthCm: nullableNumber,
    heightCm: nullableNumber,
    rawBlock: z.string().max(20_000).default(''),
  })
  .refine(
    (value) => Boolean(value.externalPackageId || value.domesticTrackingNumber),
    'OLAEET-Paket-ID oder Trackingnummer fehlt.',
  )

const inputSchema = z.object({
  records: z.array(importRecordSchema).min(1).max(500),
  autoAssign: z.boolean().default(true),
  updatePurchaseStatus: z.boolean().default(true),
})

type PurchaseCandidate = {
  id: string
  title: string
  status: string
  domestic_tracking_number: string | null
}

function mapPackageStatus(providerStatus: string | null, arrivedAt: string | null) {
  const status = String(providerStatus ?? '').toLowerCase()
  if (/return|refund/.test(status)) return 'returned'
  if (/consolidat|packed|completed/.test(status)) return 'consolidated'
  if (/packing requested|packing request|ready.*pack/.test(status)) return 'ready_for_consolidation'
  if (/inspect/.test(status)) return 'inspected'
  if (/received|arrived|stored|storage/.test(status)) return 'received'
  return arrivedAt ? 'received' : 'expected'
}

function buildRawMetadata(existing: unknown, rawBlock: string) {
  const current =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {}
  return {
    ...current,
    olaeet_browser_import: {
      imported_at: new Date().toISOString(),
      raw_block: rawBlock || null,
    },
  }
}

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const input = inputSchema.parse(await request.json())
    const [
      { data: purchasesData, error: purchasesError },
      { data: linksData, error: linksError },
    ] = await Promise.all([
      auth.supabase
        .from('purchases')
        .select('id, title, status, domestic_tracking_number')
        .eq('user_id', auth.user.id),
      auth.supabase
        .from('warehouse_package_purchases')
        .select('purchase_id, warehouse_package_id')
        .eq('user_id', auth.user.id),
    ])

    if (purchasesError) throw new Error(purchasesError.message)
    if (linksError) throw new Error(linksError.message)

    const purchases = (purchasesData ?? []) as PurchaseCandidate[]
    const purchasesByTracking = new Map<string, PurchaseCandidate[]>()
    for (const purchase of purchases) {
      const key = normalizeDomesticTrackingNumber(purchase.domestic_tracking_number)
      if (!key) continue
      purchasesByTracking.set(key, [...(purchasesByTracking.get(key) ?? []), purchase])
    }

    const linkedPackageByPurchase = new Map<string, string>()
    const purchaseIdsByPackage = new Map<string, string[]>()
    for (const link of linksData ?? []) {
      linkedPackageByPurchase.set(link.purchase_id, link.warehouse_package_id)
      purchaseIdsByPackage.set(link.warehouse_package_id, [
        ...(purchaseIdsByPackage.get(link.warehouse_package_id) ?? []),
        link.purchase_id,
      ])
    }

    const importedTrackingCounts = new Map<string, number>()
    for (const record of input.records) {
      const key = normalizeDomesticTrackingNumber(record.domesticTrackingNumber)
      if (key) importedTrackingCounts.set(key, (importedTrackingCounts.get(key) ?? 0) + 1)
    }

    const results: Array<{
      packageId: string
      externalPackageId: string | null
      domesticTrackingNumber: string | null
      action: 'created' | 'updated'
      match: 'exact' | 'unmatched' | 'conflict'
      matchedPurchases: Array<{ id: string; title: string }>
      message: string
    }> = []

    for (const record of input.records) {
      let existing: { id: string; raw_metadata: unknown } | null = null

      if (record.externalPackageId) {
        const { data, error } = await auth.supabase
          .from('warehouse_packages')
          .select('id, raw_metadata')
          .eq('user_id', auth.user.id)
          .eq('provider', 'OLAEET')
          .eq('external_package_id', record.externalPackageId)
          .maybeSingle()
        if (error) throw new Error(error.message)
        existing = data
      }

      if (!existing && record.domesticTrackingNumber) {
        const { data, error } = await auth.supabase
          .from('warehouse_packages')
          .select('id, raw_metadata')
          .eq('user_id', auth.user.id)
          .eq('provider', 'OLAEET')
          .eq('domestic_tracking_number', record.domesticTrackingNumber)
          .limit(2)
        if (error) throw new Error(error.message)
        if ((data ?? []).length === 1) existing = data?.[0] ?? null
      }

      const values = {
        user_id: auth.user.id,
        provider: 'OLAEET',
        external_package_id: record.externalPackageId,
        domestic_tracking_number: record.domesticTrackingNumber,
        domestic_carrier: record.domesticCarrier,
        sender_name: record.senderName,
        package_description: record.packageDescription,
        provider_status: record.providerStatus,
        status: mapPackageStatus(record.providerStatus, record.arrivedAt),
        arrived_at: record.arrivedAt,
        inspected_at: record.inspectedAt,
        weight_grams: record.weightGrams,
        length_cm: record.lengthCm,
        width_cm: record.widthCm,
        height_cm: record.heightCm,
        record_source: 'api',
        raw_metadata: buildRawMetadata(existing?.raw_metadata, record.rawBlock),
      }

      let packageId: string
      let action: 'created' | 'updated'

      if (existing) {
        const { data, error } = await auth.supabase
          .from('warehouse_packages')
          .update(values)
          .eq('id', existing.id)
          .eq('user_id', auth.user.id)
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        packageId = data.id
        action = 'updated'
      } else {
        const { data, error } = await auth.supabase
          .from('warehouse_packages')
          .insert(values)
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        packageId = data.id
        action = 'created'
      }

      const trackingKey = normalizeDomesticTrackingNumber(record.domesticTrackingNumber)
      const matches = trackingKey ? purchasesByTracking.get(trackingKey) ?? [] : []
      const duplicateImportedTracking =
        Boolean(trackingKey) && (importedTrackingCounts.get(trackingKey) ?? 0) > 1

      if (!input.autoAssign || !trackingKey || !matches.length) {
        results.push({
          packageId,
          externalPackageId: record.externalPackageId,
          domesticTrackingNumber: record.domesticTrackingNumber,
          action,
          match: 'unmatched',
          matchedPurchases: [],
          message: !trackingKey
            ? 'Keine Trackingnummer für automatisches Matching vorhanden.'
            : 'Kein Einkauf mit derselben Trackingnummer gefunden.',
        })
        continue
      }

      const conflictingMatches = matches.filter((purchase) => {
        const linkedPackage = linkedPackageByPurchase.get(purchase.id)
        return Boolean(linkedPackage && linkedPackage !== packageId)
      })

      if (duplicateImportedTracking || conflictingMatches.length) {
        results.push({
          packageId,
          externalPackageId: record.externalPackageId,
          domesticTrackingNumber: record.domesticTrackingNumber,
          action,
          match: 'conflict',
          matchedPurchases: matches.map((purchase) => ({ id: purchase.id, title: purchase.title })),
          message: duplicateImportedTracking
            ? 'Dieselbe Trackingnummer kommt bei mehreren importierten OLAEET-Paketen vor.'
            : 'Mindestens ein passender Einkauf ist bereits einem anderen OLAEET-Paket zugeordnet.',
        })
        continue
      }

      const combinedPurchaseIds = [
        ...new Set([
          ...(purchaseIdsByPackage.get(packageId) ?? []),
          ...matches.map((purchase) => purchase.id),
        ]),
      ]

      const { error: assignError } = await auth.supabase.rpc(
        'replace_warehouse_package_purchases',
        { p_package_id: packageId, p_purchase_ids: combinedPurchaseIds },
      )
      if (assignError) throw new Error(assignError.message)

      purchaseIdsByPackage.set(packageId, combinedPurchaseIds)
      for (const purchase of matches) linkedPackageByPurchase.set(purchase.id, packageId)

      if (input.updatePurchaseStatus) {
        const updatableIds = matches
          .filter((purchase) =>
            ['planned', 'ordered', 'paid', 'shipped_domestic'].includes(purchase.status),
          )
          .map((purchase) => purchase.id)

        if (updatableIds.length) {
          const { error: statusError } = await auth.supabase
            .from('purchases')
            .update({ status: 'warehouse_received' })
            .eq('user_id', auth.user.id)
            .in('id', updatableIds)
          if (statusError) throw new Error(statusError.message)
        }
      }

      results.push({
        packageId,
        externalPackageId: record.externalPackageId,
        domesticTrackingNumber: record.domesticTrackingNumber,
        action,
        match: 'exact',
        matchedPurchases: matches.map((purchase) => ({ id: purchase.id, title: purchase.title })),
        message:
          matches.length === 1
            ? 'Exakte Tracking-Übereinstimmung automatisch zugeordnet.'
            : `${matches.length} Einkäufe mit derselben Trackingnummer automatisch zugeordnet.`,
      })
    }

    revalidatePath('/warehouse-packages')
    revalidatePath('/purchases')

    return NextResponse.json({
      summary: {
        total: results.length,
        created: results.filter((result) => result.action === 'created').length,
        updated: results.filter((result) => result.action === 'updated').length,
        exact: results.filter((result) => result.match === 'exact').length,
        unmatched: results.filter((result) => result.match === 'unmatched').length,
        conflicts: results.filter((result) => result.match === 'conflict').length,
      },
      packages: results,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Importdaten sind ungültig.' },
        { status: 422 },
      )
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'OLAEET-Daten konnten nicht importiert werden.',
      },
      { status: 400 },
    )
  }
}
