import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import {
  olaeetShipmentPayloadSchema,
  validateCompleteShipment,
  type OlaeetShipment,
} from '@/lib/olaeet-shipment-import'
import {
  shipmentPackageTableCandidates,
  shipmentTableCandidates,
} from '@/lib/olaeet-shipment-schema.generated'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type GenericRow = Record<string, unknown>
type SupabaseClient = Awaited<ReturnType<typeof getApiUser>>['supabase']

type MatchedPackage = {
  id: string
  externalPackageId: string
  source: 'external-id' | 'tracking'
}

function asRows(value: unknown): GenericRow[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is GenericRow =>
          Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
      )
    : []
}

function findColumn(columns: Set<string>, candidates: string[]) {
  return candidates.find((candidate) => columns.has(candidate)) ?? null
}

function mapFirst(
  payload: GenericRow,
  columns: Set<string>,
  candidates: string[],
  value: unknown,
) {
  if (value === undefined) return
  const key = findColumn(columns, candidates)
  if (key) payload[key] = value
}

function mergeRawMetadata(
  current: unknown,
  shipment: OlaeetShipment,
  rawPayload: unknown,
) {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as GenericRow)
      : {}

  return {
    ...base,
    olaeet_shipment: shipment,
    olaeet_extraction: rawPayload,
    olaeet_imported_at: new Date().toISOString(),
  }
}

const shipmentColumnProbeCandidates = [
  'id',
  'user_id',
  'external_shipment_id',
  'provider_shipment_id',
  'olaeet_shipment_id',
  'external_id',
  'shipment_number',
  'shipment_code',
  'provider',
  'source',
  'provider_status',
  'status',
  'courier',
  'carrier',
  'shipping_provider',
  'tracking_number',
  'tracking_code',
  'international_tracking_number',
  'international_tracking',
  'total_payment',
  'total_amount',
  'total_cost_amount',
  'shipping_cost_amount',
  'shipping_amount',
  'cost_amount',
  'currency',
  'shipping_currency',
  'price_currency',
  'payment_transaction_id',
  'payment_id',
  'package_count',
  'item_count',
  'box_count',
  'destination_country',
  'country',
  'recipient_name',
  'provider_created_at',
  'provider_completed_at',
  'shipped_at',
  'raw_metadata',
] as const

const shipmentRelationColumnProbeCandidates = [
  'id',
  'user_id',
  'shipment_id',
  'international_shipment_id',
  'outbound_shipment_id',
  'warehouse_package_id',
  'package_id',
] as const

async function tableExists(
  supabase: SupabaseClient,
  table: string,
) {
  const response = await supabase
    .from(table as never)
    .select('id' as never)
    .limit(0)

  return !response.error
}

async function discoverColumns(
  supabase: SupabaseClient,
  table: string,
  candidates: readonly string[],
) {
  if (!(await tableExists(supabase, table))) {
    return null
  }

  const columns = new Set<string>()

  for (const column of candidates) {
    const response = await supabase
      .from(table as never)
      .select(column as never)
      .limit(0)

    if (!response.error) {
      columns.add(column)
    }
  }

  return columns
}

function inferRequiredColumnValue(
  column: string,
  userId: string,
  shipment: OlaeetShipment,
) {
  const key = column.toLowerCase()

  if (key === 'user_id' || /owner.*_id$/.test(key)) return userId
  if (/provider|source/.test(key) && !/status/.test(key)) return 'OLAEET'
  if (/status/.test(key)) return shipment.providerStatus || 'Transferring'
  if (/courier|carrier|shipping_provider/.test(key)) return shipment.courier || 'ems'
  if (/tracking/.test(key)) return shipment.trackingNumber
  if (/currency/.test(key)) return shipment.currency || 'KRW'
  if (/payment.*id/.test(key)) return shipment.paymentTransactionId
  if (/package_count|item_count/.test(key)) return shipment.packages.length
  if (/box_count/.test(key)) return shipment.boxes.length
  if (/country/.test(key)) return shipment.address.country
  if (/recipient.*name/.test(key)) return shipment.address.name
  if (/shipment.*(number|code|external|provider).*id|external.*shipment|external_id/.test(key)) {
    return shipment.externalShipmentId
  }
  if (/total|cost|amount|fee/.test(key)) return shipment.totalPayment
  if (/created|shipped|date|timestamp/.test(key)) return shipment.createdAt
  if (/title|name|label|description/.test(key)) return shipment.externalShipmentId

  return undefined
}

function missingColumnFromError(message: string) {
  return (
    message.match(/Could not find the '([^']+)' column/i)?.[1] ||
    message.match(/column [^.]*(?:\.)?"?([a-zA-Z0-9_]+)"? does not exist/i)?.[1] ||
    null
  )
}

function notNullColumnFromError(message: string) {
  return (
    message.match(/null value in column "([^"]+)" violates not-null constraint/i)?.[1] ||
    null
  )
}

async function writeShipmentWithRepair(
  supabase: SupabaseClient,
  table: string,
  existingId: unknown,
  initialPayload: GenericRow,
  userId: string,
  shipment: OlaeetShipment,
) {
  const payload: GenericRow = { ...initialPayload }
  const repairs: string[] = []

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const response = existingId
      ? await supabase
          .from(table as never)
          .update(payload as never)
          .eq('id' as never, existingId as never)
          .select('*')
          .single()
      : await supabase
          .from(table as never)
          .insert(payload as never)
          .select('*')
          .single()

    if (!response.error) {
      return {
        row:
          response.data && typeof response.data === 'object'
            ? (response.data as unknown as GenericRow)
            : null,
        repairs,
        error: null as string | null,
      }
    }

    const message = response.error.message
    const missing = missingColumnFromError(message)

    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete payload[missing]
      repairs.push(`nicht vorhandene Spalte entfernt: ${missing}`)
      continue
    }

    const required = notNullColumnFromError(message)
    if (required && !Object.prototype.hasOwnProperty.call(payload, required)) {
      const inferred = inferRequiredColumnValue(required, userId, shipment)
      if (inferred !== undefined && inferred !== null) {
        payload[required] = inferred
        repairs.push(`Pflichtfeld automatisch ergänzt: ${required}`)
        continue
      }
    }

    return { row: null, repairs, error: message }
  }

  return {
    row: null,
    repairs,
    error: 'Zu viele Schema-Reparaturversuche beim Speichern der Sendung.',
  }
}

async function findExistingShipment(
  supabase: SupabaseClient,
  table: string,
  columns: Set<string>,
  shipment: OlaeetShipment,
) {
  const identityCandidates = [
    ['external_shipment_id', shipment.externalShipmentId],
    ['provider_shipment_id', shipment.externalShipmentId],
    ['olaeet_shipment_id', shipment.externalShipmentId],
    ['external_id', shipment.externalShipmentId],
    ['shipment_number', shipment.externalShipmentId],
    ['shipment_code', shipment.externalShipmentId],
    ['tracking_number', shipment.trackingNumber],
    ['international_tracking_number', shipment.trackingNumber],
    ['international_tracking', shipment.trackingNumber],
  ] as const

  for (const [column, value] of identityCandidates) {
    if (!value || !columns.has(column)) continue

    const response = await supabase
      .from(table as never)
      .select('*')
      .eq(column as never, value as never)
      .limit(1)

    if (!response.error) {
      const row = asRows(response.data)[0] ?? null
      if (row) return row
    }
  }

  return null
}

async function syncBaseShipment(
  supabase: SupabaseClient,
  userId: string,
  shipment: OlaeetShipment,
  rawPayload: unknown,
) {
  const warnings: string[] = []

  for (const table of shipmentTableCandidates) {
    const columns = await discoverColumns(
      supabase,
      table,
      shipmentColumnProbeCandidates,
    )
    if (!columns) continue

    const existing = await findExistingShipment(
      supabase,
      table,
      columns,
      shipment,
    )

    const payload: GenericRow = {}

    mapFirst(payload, columns, ['user_id'], userId)
    mapFirst(
      payload,
      columns,
      [
        'external_shipment_id',
        'provider_shipment_id',
        'olaeet_shipment_id',
        'external_id',
        'shipment_number',
        'shipment_code',
      ],
      shipment.externalShipmentId,
    )
    mapFirst(payload, columns, ['provider', 'source'], 'OLAEET')
    mapFirst(payload, columns, ['provider_status', 'status'], shipment.providerStatus)
    mapFirst(payload, columns, ['courier', 'carrier', 'shipping_provider'], shipment.courier)
    mapFirst(
      payload,
      columns,
      [
        'tracking_number',
        'tracking_code',
        'international_tracking_number',
        'international_tracking',
      ],
      shipment.trackingNumber,
    )
    mapFirst(
      payload,
      columns,
      [
        'total_payment',
        'total_amount',
        'total_cost_amount',
        'shipping_cost_amount',
        'shipping_amount',
        'cost_amount',
      ],
      shipment.totalPayment,
    )
    mapFirst(
      payload,
      columns,
      ['currency', 'shipping_currency', 'price_currency'],
      shipment.currency || 'KRW',
    )
    mapFirst(
      payload,
      columns,
      ['payment_transaction_id', 'payment_id'],
      shipment.paymentTransactionId,
    )
    mapFirst(payload, columns, ['package_count', 'item_count'], shipment.packages.length)
    mapFirst(payload, columns, ['box_count'], shipment.boxes.length)
    mapFirst(payload, columns, ['destination_country', 'country'], shipment.address.country)
    mapFirst(payload, columns, ['recipient_name'], shipment.address.name)
    mapFirst(payload, columns, ['provider_created_at', 'shipped_at'], shipment.createdAt)
    mapFirst(payload, columns, ['provider_completed_at'], shipment.completedAt)

    if (columns.has('raw_metadata')) {
      payload.raw_metadata = mergeRawMetadata(existing?.raw_metadata, shipment, rawPayload)
    }

    const write = await writeShipmentWithRepair(
      supabase,
      table,
      existing?.id,
      payload,
      userId,
      shipment,
    )

    if (write.row) {
      if (write.repairs.length) {
        warnings.push(`${table}: ${write.repairs.join(', ')}`)
      }
      return { table, row: write.row, warnings }
    }

    if (write.error) {
      warnings.push(`${table}: ${write.error}`)
    }
  }

  return {
    table: null,
    row: null,
    warnings: [
      ...warnings,
      'Keine bestehende CardCargo-Sendungstabelle konnte beschrieben werden.',
    ],
  }
}

async function replaceExistingPackageLinks(
  supabase: SupabaseClient,
  userId: string,
  shipmentRow: GenericRow | null,
  matchedPackages: MatchedPackage[],
) {
  if (!shipmentRow?.id || !matchedPackages.length) {
    return { table: null, linked: 0, warning: null as string | null }
  }

  for (const table of shipmentPackageTableCandidates) {
    const columns = await discoverColumns(
      supabase,
      table,
      shipmentRelationColumnProbeCandidates,
    )
    if (!columns) continue

    const shipmentColumn = findColumn(columns, [
      'shipment_id',
      'international_shipment_id',
      'outbound_shipment_id',
    ])
    const packageColumn = findColumn(columns, [
      'warehouse_package_id',
      'package_id',
    ])

    if (!shipmentColumn || !packageColumn) continue

    const deleteResponse = await supabase
      .from(table as never)
      .delete()
      .eq(shipmentColumn as never, shipmentRow.id as never)

    if (deleteResponse.error) continue

    const rows = matchedPackages.map(
      (pkg) =>
        ({
          ...(columns.has('user_id') ? { user_id: userId } : {}),
          [shipmentColumn]: shipmentRow.id,
          [packageColumn]: pkg.id,
        }) as GenericRow,
    )

    const insertResponse = await supabase
      .from(table as never)
      .insert(rows as never)

    if (!insertResponse.error) {
      return { table, linked: rows.length, warning: null }
    }
  }

  return {
    table: null,
    linked: 0,
    warning: 'Keine separate Shipment↔Package-Zwischentabelle konnte verwendet werden.',
  }
}

async function linkPackagesDirectly(
  supabase: SupabaseClient,
  userId: string,
  shipmentRow: GenericRow | null,
  matchedPackages: MatchedPackage[],
) {
  if (!shipmentRow?.id || !matchedPackages.length) {
    return { column: null, linked: 0 }
  }

  const packageIds = matchedPackages.map((entry) => entry.id)
  const candidates = ['shipment_id', 'international_shipment_id', 'outbound_shipment_id']

  for (const column of candidates) {
    const probe = await supabase
      .from('warehouse_packages')
      .select(column as never)
      .limit(0)

    if (probe.error) continue

    const response = await supabase
      .from('warehouse_packages')
      .update({ [column]: shipmentRow.id } as never)
      .eq('user_id', userId)
      .in('id', packageIds)

    if (!response.error) {
      return { column, linked: packageIds.length }
    }
  }

  return { column: null, linked: 0 }
}

async function storeOptionalSidecar(
  supabase: SupabaseClient,
  userId: string,
  shipment: OlaeetShipment,
  matchedPackages: MatchedPackage[],
  warehousePackages: Array<{
    id: string
    external_package_id: string | null
    domestic_tracking_number: string | null
  }>,
  rawPayload: unknown,
  extractedAt: string | undefined,
) {
  const warnings: string[] = []

  const sidecarPayload = {
    user_id: userId,
    external_shipment_id: shipment.externalShipmentId,
    provider_status: shipment.providerStatus,
    provider_created_at: shipment.createdAt,
    provider_completed_at: shipment.completedAt,
    courier: shipment.courier,
    tracking_number: shipment.trackingNumber,
    payment_transaction_id: shipment.paymentTransactionId,
    shipping_amount: shipment.shippingAmount,
    shipping_fee: shipment.shippingFee,
    additional_fee: shipment.additionalFee,
    insurance_fee: shipment.insuranceFee,
    total_payment: shipment.totalPayment,
    currency: shipment.currency || 'KRW',
    address: shipment.address,
    boxes: shipment.boxes,
    packages: shipment.packages,
    expected_item_count: shipment.expectedItemCount,
    expected_box_count: shipment.expectedBoxCount,
    extraction_complete: shipment.extractionComplete,
    page_url: shipment.pageUrl,
    raw_text: shipment.rawText,
    diagnostics: shipment.diagnostics,
    extracted_at: extractedAt || null,
    raw_payload: rawPayload,
    imported_at: new Date().toISOString(),
  }

  const sidecarWrite = await supabase
    .from('olaeet_shipment_extractions' as never)
    .upsert(sidecarPayload as never, {
      onConflict: 'user_id,external_shipment_id',
    })
    .select('id')
    .single()

  if (sidecarWrite.error) {
    warnings.push(
      'Optionales vollständiges OLAEET-Detailarchiv ist nicht installiert. ' +
        'Die normale CardCargo-Sendung wurde trotzdem gespeichert.',
    )
    return { stored: false, warnings }
  }

  const deleteResponse = await supabase
    .from('olaeet_shipment_package_links' as never)
    .delete()
    .eq('user_id' as never, userId as never)
    .eq('external_shipment_id' as never, shipment.externalShipmentId as never)

  if (deleteResponse.error) {
    warnings.push('Detailarchiv gespeichert, Paket-Linkarchiv konnte aber nicht aktualisiert werden.')
    return { stored: true, warnings }
  }

  if (matchedPackages.length) {
    const byId = new Map(shipment.packages.map((entry) => [entry.externalPackageId.toUpperCase(), entry]))

    const rows = matchedPackages.map((matched) => {
      const warehouse = warehousePackages.find((entry) => entry.id === matched.id)
      const warehouseTracking = String(warehouse?.domestic_tracking_number || '').replace(/\D/g, '')
      const extracted =
        byId.get(matched.externalPackageId.toUpperCase()) ||
        shipment.packages.find(
          (entry) =>
            warehouseTracking &&
            String(entry.domesticTrackingNumber || '').replace(/\D/g, '') === warehouseTracking,
        ) ||
        null

      return {
        user_id: userId,
        external_shipment_id: shipment.externalShipmentId,
        warehouse_package_id: matched.id,
        external_package_id: extracted?.externalPackageId || matched.externalPackageId,
        domestic_tracking_number: extracted?.domesticTrackingNumber || null,
        item_category: extracted?.itemCategory || null,
        recipient_masked: extracted?.recipientMasked || null,
        match_method: matched.source,
      }
    })

    const insertResponse = await supabase
      .from('olaeet_shipment_package_links' as never)
      .insert(rows as never)

    if (insertResponse.error) {
      warnings.push('Detailarchiv gespeichert, Paket-Linkarchiv konnte aber nicht geschrieben werden.')
    }
  }

  return { stored: true, warnings }
}

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json(
      { error: 'Anfrage von fremder Origin blockiert.' },
      { status: 403 },
    )
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const rawPayload = await request.json()
    const parsed = olaeetShipmentPayloadSchema.parse(rawPayload)
    const shipment = parsed.shipments[0]

    validateCompleteShipment(shipment)

    const { data: warehousePackages, error: packageError } = await auth.supabase
      .from('warehouse_packages')
      .select('id, external_package_id, domestic_tracking_number')
      .eq('user_id', auth.user.id)
      .eq('provider', 'OLAEET')

    if (packageError) throw new Error(packageError.message)

    const byExternal = new Map<string, { id: string; externalPackageId: string }>()
    const byTracking = new Map<
      string,
      Array<{ id: string; externalPackageId: string }>
    >()

    for (const pkg of warehousePackages ?? []) {
      const externalPackageId = String(pkg.external_package_id || '').trim()
      if (externalPackageId) {
        byExternal.set(externalPackageId.toUpperCase(), {
          id: pkg.id,
          externalPackageId,
        })
      }

      const tracking = String(pkg.domestic_tracking_number || '').replace(/\D/g, '').trim()
      if (tracking) {
        const current = byTracking.get(tracking) ?? []
        current.push({ id: pkg.id, externalPackageId })
        byTracking.set(tracking, current)
      }
    }

    const matchedPackages: MatchedPackage[] = []
    const missingPackages: string[] = []

    for (const extracted of shipment.packages) {
      const exact = byExternal.get(extracted.externalPackageId.toUpperCase())
      if (exact) {
        matchedPackages.push({ ...exact, source: 'external-id' })
        continue
      }

      const tracking = String(extracted.domesticTrackingNumber || '').replace(/\D/g, '')
      const trackingMatches = tracking ? byTracking.get(tracking) ?? [] : []

      if (trackingMatches.length === 1) {
        matchedPackages.push({ ...trackingMatches[0], source: 'tracking' })
      } else {
        missingPackages.push(extracted.externalPackageId)
      }
    }

    // Save the existing CardCargo shipment first. Optional detail tables must
    // never block the normal shipment workflow.
    const baseSync = await syncBaseShipment(
      auth.supabase,
      auth.user.id,
      shipment,
      rawPayload,
    )

    const relationSync = baseSync.row
      ? await replaceExistingPackageLinks(
          auth.supabase,
          auth.user.id,
          baseSync.row,
          matchedPackages,
        )
      : { table: null, linked: 0, warning: null as string | null }

    const directSync =
      baseSync.row && relationSync.linked === 0
        ? await linkPackagesDirectly(
            auth.supabase,
            auth.user.id,
            baseSync.row,
            matchedPackages,
          )
        : { column: null, linked: 0 }

    const sidecar = await storeOptionalSidecar(
      auth.supabase,
      auth.user.id,
      shipment,
      matchedPackages,
      (warehousePackages ?? []) as Array<{
        id: string
        external_package_id: string | null
        domestic_tracking_number: string | null
      }>,
      rawPayload,
      parsed.extractedAt,
    )

    if (!baseSync.row && !sidecar.stored) {
      throw new Error(
        'Die Sendung konnte weder im bestehenden CardCargo-Sendungsmodell noch im optionalen OLAEET-Detailarchiv gespeichert werden. ' +
          baseSync.warnings.join(' '),
      )
    }

    const warnings = [
      ...baseSync.warnings,
      ...(!baseSync.row && sidecar.stored
        ? ['Die vollständige OLAEET-Sendung wurde gespeichert, aber das historische CardCargo-Sendungsmodell konnte nicht aktualisiert werden.']
        : []),
      ...(relationSync.warning && directSync.linked === 0 ? [relationSync.warning] : []),
      ...sidecar.warnings,
    ]

    return NextResponse.json({
      shipment: {
        externalShipmentId: shipment.externalShipmentId,
        trackingNumber: shipment.trackingNumber,
        totalPayment: shipment.totalPayment,
        currency: shipment.currency || 'KRW',
        packageCount: shipment.packages.length,
        boxCount: shipment.boxes.length,
      },
      matchedPackages: matchedPackages.length,
      missingPackages,
      baseShipmentTable: baseSync.table,
      existingPackageLinkTable: relationSync.table,
      existingPackageLinks: relationSync.linked,
      directPackageLinkColumn: directSync.column,
      directPackageLinks: directSync.linked,
      fullDetailsStored: sidecar.stored,
      detailsUrl: sidecar.stored
        ? `/shipments/olaeet/${encodeURIComponent(shipment.externalShipmentId)}`
        : null,
      warnings,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Ungültige OLAEET-Extraction.' },
        { status: 422 },
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'OLAEET-Sendung konnte nicht gespeichert werden.',
      },
      { status: 400 },
    )
  }
}
