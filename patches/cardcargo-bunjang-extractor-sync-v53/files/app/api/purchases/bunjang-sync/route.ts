import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { normalizeDomesticTrackingNumber } from '@/lib/domestic-tracking'
import { hasTrustedRequestOrigin } from '@/lib/request-security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const nullableText = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().default(null).transform((value) => value || null)

const recordSchema = z.object({
  listingId: z.string().trim().min(1).max(200),
  listingUrl: nullableText(2000),
  title: nullableText(1000),
  sellerName: nullableText(300),
  purchasedAt: nullableText(100),
  priceAmount: z.number().finite().min(0).nullable().default(null),
  priceCurrency: z.string().trim().min(1).max(10).default('KRW'),
  domesticCarrier: nullableText(120),
  domesticTrackingNumber: nullableText(200),
  imageUrls: z.array(z.string().url()).max(12).default([]),
  rawText: z.string().max(20000).default(''),
  warnings: z.array(z.string().max(500)).max(20).default([]),
})

const inputSchema = z.object({
  records: z.array(recordSchema).min(1).max(500),
  createMissing: z.boolean().default(false),
  updateShippingStatus: z.boolean().default(true),
  autoAssignOlaeet: z.boolean().default(true),
})

type ExistingPurchase = {
  id: string
  source_listing_id: string | null
  title: string
  seller_name: string | null
  price_amount: number | null
  purchased_at: string | null
  status: string
  domestic_carrier: string | null
  domestic_tracking_number: string | null
  raw_metadata: unknown
}

function buildMetadata(existing: unknown, record: z.infer<typeof recordSchema>) {
  const current = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {}
  return {
    ...current,
    bunjang_extractor: {
      synced_at: new Date().toISOString(),
      listing_id: record.listingId,
      listing_url: record.listingUrl,
      carrier: record.domesticCarrier,
      tracking_number: record.domesticTrackingNumber,
      detected_image_urls: record.imageUrls,
      parser_warnings: record.warnings,
      raw_text: record.rawText || null,
    },
  }
}

function fallbackUrl(listingId: string) {
  return `https://m.bunjang.co.kr/products/${encodeURIComponent(listingId)}`
}

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const input = inputSchema.parse(await request.json())
    const [purchaseResult, packageResult, linkResult] = await Promise.all([
      auth.supabase
        .from('purchases')
        .select('id, source_listing_id, title, seller_name, price_amount, purchased_at, status, domestic_carrier, domestic_tracking_number, raw_metadata')
        .eq('user_id', auth.user.id)
        .eq('source', 'bunjang'),
      auth.supabase
        .from('warehouse_packages')
        .select('id, external_package_id, domestic_tracking_number')
        .eq('user_id', auth.user.id)
        .eq('provider', 'OLAEET'),
      auth.supabase
        .from('warehouse_package_purchases')
        .select('purchase_id, warehouse_package_id')
        .eq('user_id', auth.user.id),
    ])

    if (purchaseResult.error) throw new Error(purchaseResult.error.message)
    if (packageResult.error) throw new Error(packageResult.error.message)
    if (linkResult.error) throw new Error(linkResult.error.message)

    const existingByListingId = new Map<string, ExistingPurchase>()
    for (const purchase of (purchaseResult.data ?? []) as ExistingPurchase[]) {
      if (purchase.source_listing_id) existingByListingId.set(purchase.source_listing_id, purchase)
    }

    const packagesByTracking = new Map<string, Array<{ id: string; externalId: string | null }>>()
    for (const pkg of packageResult.data ?? []) {
      const key = normalizeDomesticTrackingNumber(pkg.domestic_tracking_number)
      if (!key) continue
      packagesByTracking.set(key, [...(packagesByTracking.get(key) ?? []), { id: pkg.id, externalId: pkg.external_package_id }])
    }

    const linkedPackageByPurchase = new Map<string, string>()
    const purchaseIdsByPackage = new Map<string, string[]>()
    for (const link of linkResult.data ?? []) {
      linkedPackageByPurchase.set(link.purchase_id, link.warehouse_package_id)
      purchaseIdsByPackage.set(link.warehouse_package_id, [...(purchaseIdsByPackage.get(link.warehouse_package_id) ?? []), link.purchase_id])
    }

    const results: Array<{
      listingId: string
      purchaseId: string | null
      title: string | null
      action: 'updated' | 'created' | 'skipped'
      trackingNumber: string | null
      olaeetMatch: 'exact' | 'pending' | 'conflict' | 'disabled'
      olaeetExternalId: string | null
      message: string
    }> = []

    for (const record of input.records) {
      let purchase = existingByListingId.get(record.listingId) ?? null
      let action: 'updated' | 'created' | 'skipped'

      if (purchase) {
        let status = purchase.status
        if (input.updateShippingStatus && record.domesticTrackingNumber && ['planned', 'ordered', 'paid'].includes(status)) {
          status = 'shipped_domestic'
        }

        const { data, error } = await auth.supabase
          .from('purchases')
          .update({
            seller_name: purchase.seller_name || record.sellerName,
            price_amount: purchase.price_amount ?? record.priceAmount,
            purchased_at: purchase.purchased_at || record.purchasedAt,
            domestic_carrier: record.domesticCarrier || purchase.domestic_carrier,
            domestic_tracking_number: record.domesticTrackingNumber || purchase.domestic_tracking_number,
            status,
            raw_metadata: buildMetadata(purchase.raw_metadata, record),
          })
          .eq('id', purchase.id)
          .eq('user_id', auth.user.id)
          .select('id, source_listing_id, title, seller_name, price_amount, purchased_at, status, domestic_carrier, domestic_tracking_number, raw_metadata')
          .single()
        if (error) throw new Error(error.message)
        purchase = data as ExistingPurchase
        existingByListingId.set(record.listingId, purchase)
        action = 'updated'
      } else if (input.createMissing) {
        const { data, error } = await auth.supabase
          .from('purchases')
          .insert({
            user_id: auth.user.id,
            source: 'bunjang',
            source_listing_id: record.listingId,
            listing_url: record.listingUrl || fallbackUrl(record.listingId),
            canonical_url: record.listingUrl,
            title: record.title || `Bunjang #${record.listingId}`,
            description: null,
            seller_name: record.sellerName,
            price_amount: record.priceAmount,
            price_currency: record.priceCurrency || 'KRW',
            domestic_shipping_amount: null,
            service_fee_amount: null,
            purchased_at: record.purchasedAt,
            status: input.updateShippingStatus && record.domesticTrackingNumber ? 'shipped_domestic' : 'ordered',
            domestic_carrier: record.domesticCarrier,
            domestic_tracking_number: record.domesticTrackingNumber,
            raw_metadata: buildMetadata(null, record),
          })
          .select('id, source_listing_id, title, seller_name, price_amount, purchased_at, status, domestic_carrier, domestic_tracking_number, raw_metadata')
          .single()
        if (error) throw new Error(error.message)
        purchase = data as ExistingPurchase
        existingByListingId.set(record.listingId, purchase)
        action = 'created'
      } else {
        results.push({
          listingId: record.listingId,
          purchaseId: null,
          title: record.title,
          action: 'skipped',
          trackingNumber: record.domesticTrackingNumber,
          olaeetMatch: 'disabled',
          olaeetExternalId: null,
          message: 'Einkauf ist noch nicht in CardCargo. Optional „Fehlende Einkäufe anlegen“ aktivieren.',
        })
        continue
      }

      const trackingNumber = record.domesticTrackingNumber || purchase.domestic_tracking_number
      const trackingKey = normalizeDomesticTrackingNumber(trackingNumber)

      if (!input.autoAssignOlaeet) {
        results.push({ listingId: record.listingId, purchaseId: purchase.id, title: purchase.title, action, trackingNumber, olaeetMatch: 'disabled', olaeetExternalId: null, message: 'Bunjang-Daten synchronisiert. OLAEET-Automatching ist deaktiviert.' })
        continue
      }

      if (!trackingKey) {
        results.push({ listingId: record.listingId, purchaseId: purchase.id, title: purchase.title, action, trackingNumber: null, olaeetMatch: 'pending', olaeetExternalId: null, message: 'Synchronisiert; noch keine Trackingnummer für OLAEET-Matching.' })
        continue
      }

      const matches = packagesByTracking.get(trackingKey) ?? []
      if (!matches.length) {
        results.push({ listingId: record.listingId, purchaseId: purchase.id, title: purchase.title, action, trackingNumber, olaeetMatch: 'pending', olaeetExternalId: null, message: 'Tracking gespeichert; passendes OLAEET-Paket wurde noch nicht importiert.' })
        continue
      }

      if (matches.length > 1) {
        results.push({ listingId: record.listingId, purchaseId: purchase.id, title: purchase.title, action, trackingNumber, olaeetMatch: 'conflict', olaeetExternalId: null, message: 'Mehrere OLAEET-Pakete besitzen dieselbe Trackingnummer.' })
        continue
      }

      const packageMatch = matches[0]
      const currentPackage = linkedPackageByPurchase.get(purchase.id)
      if (currentPackage && currentPackage !== packageMatch.id) {
        results.push({ listingId: record.listingId, purchaseId: purchase.id, title: purchase.title, action, trackingNumber, olaeetMatch: 'conflict', olaeetExternalId: packageMatch.externalId, message: 'Der Einkauf ist bereits einem anderen OLAEET-Paket zugeordnet.' })
        continue
      }

      const combined = [...new Set([...(purchaseIdsByPackage.get(packageMatch.id) ?? []), purchase.id])]
      const { error: assignError } = await auth.supabase.rpc('replace_warehouse_package_purchases', {
        p_package_id: packageMatch.id,
        p_purchase_ids: combined,
      })
      if (assignError) throw new Error(assignError.message)

      linkedPackageByPurchase.set(purchase.id, packageMatch.id)
      purchaseIdsByPackage.set(packageMatch.id, combined)

      if (input.updateShippingStatus && ['planned', 'ordered', 'paid', 'shipped_domestic'].includes(purchase.status)) {
        const { error } = await auth.supabase
          .from('purchases')
          .update({ status: 'warehouse_received' })
          .eq('id', purchase.id)
          .eq('user_id', auth.user.id)
        if (error) throw new Error(error.message)
      }

      results.push({ listingId: record.listingId, purchaseId: purchase.id, title: purchase.title, action, trackingNumber, olaeetMatch: 'exact', olaeetExternalId: packageMatch.externalId, message: 'Exakte Tracking-Übereinstimmung: automatisch OLAEET zugeordnet.' })
    }

    revalidatePath('/purchases')
    revalidatePath('/warehouse-packages')

    return NextResponse.json({
      summary: {
        total: results.length,
        updated: results.filter((item) => item.action === 'updated').length,
        created: results.filter((item) => item.action === 'created').length,
        skipped: results.filter((item) => item.action === 'skipped').length,
        exact: results.filter((item) => item.olaeetMatch === 'exact').length,
        pending: results.filter((item) => item.olaeetMatch === 'pending').length,
        conflicts: results.filter((item) => item.olaeetMatch === 'conflict').length,
      },
      purchases: results,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Bunjang-Importdaten sind ungültig.' }, { status: 422 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bunjang-Daten konnten nicht synchronisiert werden.' }, { status: 400 })
  }
}
