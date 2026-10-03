import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import {
  olaeetShipmentPayloadSchema,
  validateCompleteShipment,
  type OlaeetShipment,
} from '@/lib/olaeet-shipment-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type GenericRow = Record<string, unknown>
type SupabaseClient = Awaited<ReturnType<typeof getApiUser>>['supabase']

type WarehousePackageRow = {
  id: string
  external_package_id: string | null
  domestic_tracking_number: string | null
}

type MatchedPackage = {
  id: string
  externalPackageId: string
  source: 'external-id' | 'tracking'
  extracted: OlaeetShipment['packages'][number]
}

const SHIPMENT_COLUMNS = [
  'id',
  'user_id',
  'external_shipment_id',
  'provider_shipment_id',
  'olaeet_shipment_id',
  'external_id',
  'shipment_number',
  'shipment_code',
  'reference',
  'reference_number',
  'external_reference',
  'provider',
  'source',
  'provider_status',
  'status',
  'shipment_status',
  'courier',
  'carrier',
  'shipping_provider',
  'tracking_number',
  'tracking_code',
  'international_tracking_number',
  'international_tracking',
  'payment_transaction_id',
  'payment_id',
  'shipping_amount',
  'shipping_fee',
  'additional_fee',
  'insurance_fee',
  'total_payment',
  'total_amount',
  'total_cost_amount',
  'shipping_cost_amount',
  'shipping_cost',
  'cost_amount',
  'currency',
  'shipping_currency',
  'price_currency',
  'recipient_name',
  'recipient_address',
  'destination_country',
  'country',
  'package_count',
  'item_count',
  'box_count',
  'package_info',
  'provider_created_at',
  'provider_completed_at',
  'shipped_at',
  'completed_at',
  'raw_metadata',
] as const

function asRows(value: unknown): GenericRow[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is GenericRow =>
          Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
      )
    : []
}

function normalizeProviderStatus(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cardCargoStatusCandidates(providerStatus: string | null | undefined) {
  const status = normalizeProviderStatus(providerStatus)

  if (/cancel|refund|void/.test(status)) {
    return ['cancelled', 'canceled', 'closed', 'draft']
  }

  if (/deliver|complete|received|arrived/.test(status)) {
    return ['delivered', 'completed', 'received', 'arrived', 'closed']
  }

  if (/transfer|in transit|transit|shipping|shipped|dispatch|sent/.test(status)) {
    return [
      'in_transit',
      'shipped',
      'shipping',
      'transit',
      'dispatched',
      'sent',
      'active',
      'processing',
    ]
  }

  if (/ready|pack|prepare|processing/.test(status)) {
    return ['preparing', 'processing', 'ready', 'packed', 'planned', 'pending']
  }

  return ['planned', 'pending', 'draft', 'created', 'processing']
}

function invalidEnumValueFromError(message: string) {
  return (
    message.match(/invalid input value for enum [^:]+:\s*[\"']([^\"']+)[\"']/i)?.[1] ||
    null
  )
}

function missingColumnFromError(message: string) {
  return (
    message.match(/Could not find the '([^']+)' column/i)?.[1] ||
    message.match(/column [^.]*(?:\.)?\"?([a-zA-Z0-9_]+)\"? does not exist/i)?.[1] ||
    null
  )
}

function notNullColumnFromError(message: string) {
  return message.match(/null value in column \"([^\"]+)\" violates not-null constraint/i)?.[1] || null
}

async function columnExists(
  supabase: SupabaseClient,
  table: string,
  column: string,
) {
  const response = await supabase
    .from(table as never)
    .select(column as never)
    .limit(0)

  return !response.error
}

async function discoverShipmentColumns(supabase: SupabaseClient) {
  const columns = new Set<string>()

  for (const column of SHIPMENT_COLUMNS) {
    if (await columnExists(supabase, 'shipments', column)) {
      columns.add(column)
    }
  }

  return columns
}

function mapAll(
  payload: GenericRow,
  columns: Set<string>,
  candidates: readonly string[],
  value: unknown,
) {
  if (value === undefined) return
  for (const column of candidates) {
    if (columns.has(column)) payload[column] = value
  }
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

function inferRequiredColumnValue(
  column: string,
  userId: string,
  shipment: OlaeetShipment,
) {
  const key = column.toLowerCase()

  if (key === 'user_id' || /owner.*_id$/.test(key)) return userId
  if (key === 'provider_status') return shipment.providerStatus
  if (key === 'status' || key === 'shipment_status') {
    return cardCargoStatusCandidates(shipment.providerStatus)[0]
  }
  if (/provider|source/.test(key) && !/status/.test(key)) return 'OLAEET'
  if (/courier|carrier|shipping_provider/.test(key)) return shipment.courier || 'ems'
  if (/tracking/.test(key)) return shipment.trackingNumber
  if (/currency/.test(key)) return shipment.currency || 'KRW'
  if (/payment.*id/.test(key)) return shipment.paymentTransactionId
  if (/package_count|item_count/.test(key)) return shipment.packages.length
  if (/box_count/.test(key)) return shipment.boxes.length
  if (/country/.test(key)) return shipment.address.country
  if (/recipient.*name/.test(key)) return shipment.address.name
  if (/shipment.*(number|code|external|provider).*id|external.*shipment|external_id|reference/.test(key)) {
    return shipment.externalShipmentId
  }
  if (/total|cost|amount|fee/.test(key)) return shipment.totalPayment
  if (/created|shipped|date|timestamp/.test(key)) return shipment.createdAt
  if (/title|name|label|description/.test(key)) return shipment.externalShipmentId

  return undefined
}

function buildShipmentPayload(
  columns: Set<string>,
  userId: string,
  shipment: OlaeetShipment,
  rawPayload: unknown,
  existing: GenericRow | null,
) {
  const payload: GenericRow = {}

  mapAll(payload, columns, ['user_id'], userId)
  mapAll(
    payload,
    columns,
    [
      'external_shipment_id',
      'provider_shipment_id',
      'olaeet_shipment_id',
      'external_id',
      'shipment_number',
      'shipment_code',
      'reference',
      'reference_number',
      'external_reference',
    ],
    shipment.externalShipmentId,
  )
  mapAll(payload, columns, ['provider', 'source'], 'OLAEET')
  mapAll(payload, columns, ['provider_status'], shipment.providerStatus)
  mapAll(
    payload,
    columns,
    ['status', 'shipment_status'],
    cardCargoStatusCandidates(shipment.providerStatus)[0],
  )
  mapAll(payload, columns, ['courier', 'carrier', 'shipping_provider'], shipment.courier)
  mapAll(
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
  mapAll(payload, columns, ['payment_transaction_id', 'payment_id'], shipment.paymentTransactionId)
  mapAll(payload, columns, ['shipping_amount'], shipment.shippingAmount)
  mapAll(payload, columns, ['shipping_fee'], shipment.shippingFee)
  mapAll(payload, columns, ['additional_fee'], shipment.additionalFee)
  mapAll(payload, columns, ['insurance_fee'], shipment.insuranceFee)
  mapAll(
    payload,
    columns,
    [
      'total_payment',
      'total_amount',
      'total_cost_amount',
      'shipping_cost_amount',
      'shipping_cost',
      'cost_amount',
    ],
    shipment.totalPayment,
  )
  mapAll(payload, columns, ['currency', 'shipping_currency', 'price_currency'], shipment.currency || 'KRW')
  mapAll(payload, columns, ['recipient_name'], shipment.address.name)
  mapAll(payload, columns, ['destination_country', 'country'], shipment.address.country)
  mapAll(payload, columns, ['recipient_address'], shipment.address)
  mapAll(payload, columns, ['package_count', 'item_count'], shipment.packages.length)
  mapAll(payload, columns, ['box_count'], shipment.boxes.length)
  mapAll(payload, columns, ['package_info'], {
    packages: shipment.packages,
    boxes: shipment.boxes,
  })
  mapAll(payload, columns, ['provider_created_at', 'shipped_at'], shipment.createdAt)
  mapAll(payload, columns, ['provider_completed_at', 'completed_at'], shipment.completedAt)

  if (columns.has('raw_metadata')) {
    payload.raw_metadata = mergeRawMetadata(existing?.raw_metadata, shipment, rawPayload)
  }

  return payload
}

async function findExistingShipment(
  supabase: SupabaseClient,
  columns: Set<string>,
  userId: string,
  shipment: OlaeetShipment,
) {
  const candidates: Array<[string, string | null]> = [
    ['external_shipment_id', shipment.externalShipmentId],
    ['provider_shipment_id', shipment.externalShipmentId],
    ['olaeet_shipment_id', shipment.externalShipmentId],
    ['external_id', shipment.externalShipmentId],
    ['shipment_number', shipment.externalShipmentId],
    ['shipment_code', shipment.externalShipmentId],
    ['reference', shipment.externalShipmentId],
    ['reference_number', shipment.externalShipmentId],
    ['external_reference', shipment.externalShipmentId],
    ['tracking_number', shipment.trackingNumber],
    ['tracking_code', shipment.trackingNumber],
    ['international_tracking_number', shipment.trackingNumber],
    ['international_tracking', shipment.trackingNumber],
  ]

  for (const [column, value] of candidates) {
    if (!value || !columns.has(column)) continue

    let query = supabase
      .from('shipments')
      .select('*')
      .eq(column as never, value as never)
      .limit(1)

    if (columns.has('user_id')) {
      query = query.eq('user_id', userId)
    }

    const response = await query
    if (!response.error) {
      const row = asRows(response.data)[0] ?? null
      if (row) return row
    }
  }

  return null
}

async function writeShipmentWithRepair(
  supabase: SupabaseClient,
  columns: Set<string>,
  existing: GenericRow | null,
  initialPayload: GenericRow,
  userId: string,
  shipment: OlaeetShipment,
) {
  const payload: GenericRow = { ...initialPayload }
  const repairs: string[] = []
  const triedStatuses = new Set<string>()

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const response = existing?.id
      ? await supabase
          .from('shipments')
          .update(payload as never)
          .eq('id', existing.id as never)
          .select('*')
          .single()
      : await supabase
          .from('shipments')
          .insert(payload as never)
          .select('*')
          .single()

    const typed = response as unknown as {
      data: unknown
      error: { message: string } | null
    }

    if (!typed.error) {
      const row =
        typed.data && typeof typed.data === 'object' && !Array.isArray(typed.data)
          ? (typed.data as GenericRow)
          : null
      return { row, repairs, error: null as string | null }
    }

    const message = typed.error.message
    const invalidEnum = invalidEnumValueFromError(message)
    const statusColumn = ['status', 'shipment_status'].find((key) =>
      Object.prototype.hasOwnProperty.call(payload, key),
    )

    if (invalidEnum && statusColumn) {
      triedStatuses.add(String(payload[statusColumn] ?? ''))
      triedStatuses.add(invalidEnum)
      const next = cardCargoStatusCandidates(shipment.providerStatus).find(
        (candidate) => !triedStatuses.has(candidate),
      )
      if (next) {
        payload[statusColumn] = next
        for (const other of ['status', 'shipment_status']) {
          if (other !== statusColumn && columns.has(other)) payload[other] = next
        }
        repairs.push(`CardCargo-Status angepasst: ${invalidEnum} -> ${next}`)
        continue
      }
    }

    const missing = missingColumnFromError(message)
    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete payload[missing]
      repairs.push(`nicht vorhandene Spalte entfernt: ${missing}`)
      continue
    }

    const required = notNullColumnFromError(message)
    if (required && !Object.prototype.hasOwnProperty.call(payload, required)) {
      const value = inferRequiredColumnValue(required, userId, shipment)
      if (value !== undefined && value !== null) {
        payload[required] = value
        repairs.push(`Pflichtfeld ergänzt: ${required}`)
        continue
      }
    }

    return { row: null, repairs, error: message }
  }

  return {
    row: null,
    repairs,
    error: 'Zu viele Reparaturversuche beim Speichern der Sendung.',
  }
}

async function storeFullExtraction(
  supabase: SupabaseClient,
  userId: string,
  shipmentId: string,
  shipment: OlaeetShipment,
  rawPayload: unknown,
  extractedAt: string | undefined,
) {
  const row = {
    user_id: userId,
    shipment_id: shipmentId,
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

  const response = await supabase
    .from('olaeet_shipment_extractions' as never)
    .upsert(row as never, { onConflict: 'user_id,external_shipment_id' })

  if (response.error) throw new Error(response.error.message)
}

async function syncPackageLinks(
  supabase: SupabaseClient,
  userId: string,
  shipmentId: string,
  shipment: OlaeetShipment,
  warehousePackages: WarehousePackageRow[],
) {
  const byExternal = new Map<string, WarehousePackageRow>()
  const byTracking = new Map<string, WarehousePackageRow[]>()

  for (const pkg of warehousePackages) {
    const external = String(pkg.external_package_id || '').trim().toUpperCase()
    if (external) byExternal.set(external, pkg)

    const tracking = String(pkg.domestic_tracking_number || '').replace(/\D/g, '')
    if (tracking) {
      const current = byTracking.get(tracking) ?? []
      current.push(pkg)
      byTracking.set(tracking, current)
    }
  }

  const matched: MatchedPackage[] = []
  const missing: string[] = []

  for (const extracted of shipment.packages) {
    const exact = byExternal.get(extracted.externalPackageId.toUpperCase())
    if (exact) {
      matched.push({
        id: exact.id,
        externalPackageId: extracted.externalPackageId,
        source: 'external-id',
        extracted,
      })
      continue
    }

    const tracking = String(extracted.domesticTrackingNumber || '').replace(/\D/g, '')
    const trackingMatches = tracking ? byTracking.get(tracking) ?? [] : []
    if (trackingMatches.length === 1) {
      matched.push({
        id: trackingMatches[0].id,
        externalPackageId: extracted.externalPackageId,
        source: 'tracking',
        extracted,
      })
    } else {
      missing.push(extracted.externalPackageId)
    }
  }

  // v94 makes this relation explicit and canonical. A package included in an
  // international shipment now directly references that shipment.
  const matchedIds = matched.map((entry) => entry.id)
  if (matchedIds.length) {
    const update = await supabase
      .from('warehouse_packages')
      .update({ shipment_id: shipmentId } as never)
      .eq('user_id', userId)
      .in('id', matchedIds)

    if (update.error) throw new Error(update.error.message)
  }

  const clear = await supabase
    .from('olaeet_shipment_package_links' as never)
    .delete()
    .eq('user_id' as never, userId as never)
    .eq('shipment_id' as never, shipmentId as never)

  if (clear.error) throw new Error(clear.error.message)

  if (matched.length) {
    const rows = matched.map((entry) => ({
      user_id: userId,
      shipment_id: shipmentId,
      external_shipment_id: shipment.externalShipmentId,
      warehouse_package_id: entry.id,
      external_package_id: entry.extracted.externalPackageId,
      domestic_tracking_number: entry.extracted.domesticTrackingNumber,
      item_category: entry.extracted.itemCategory,
      recipient_masked: entry.extracted.recipientMasked,
      match_method: entry.source,
    }))

    const insert = await supabase
      .from('olaeet_shipment_package_links' as never)
      .insert(rows as never)

    if (insert.error) throw new Error(insert.error.message)
  }

  return { matched, missing }
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
    const rawPayload = await request.json()
    const parsed = olaeetShipmentPayloadSchema.parse(rawPayload)
    const shipment = parsed.shipments[0]
    validateCompleteShipment(shipment)

    // v94 deliberately requires the canonical persistence columns. Without
    // them CardCargo could create a record that looked empty in the normal UI.
    if (!(await columnExists(auth.supabase, 'shipments', 'external_shipment_id'))) {
      return NextResponse.json(
        {
          error:
            'CardCargo v94 Datenbankerweiterung fehlt. Führe zuerst ' +
            'supabase/manual/v94_olaeet_shipment_persistence.sql im Supabase SQL Editor aus.',
        },
        { status: 409 },
      )
    }

    if (!(await columnExists(auth.supabase, 'warehouse_packages', 'shipment_id'))) {
      return NextResponse.json(
        {
          error:
            'CardCargo v94 Paketzuordnung fehlt. Führe zuerst ' +
            'supabase/manual/v94_olaeet_shipment_persistence.sql im Supabase SQL Editor aus.',
        },
        { status: 409 },
      )
    }

    const columns = await discoverShipmentColumns(auth.supabase)
    const existing = await findExistingShipment(
      auth.supabase,
      columns,
      auth.user.id,
      shipment,
    )

    const payload = buildShipmentPayload(
      columns,
      auth.user.id,
      shipment,
      rawPayload,
      existing,
    )

    const write = await writeShipmentWithRepair(
      auth.supabase,
      columns,
      existing,
      payload,
      auth.user.id,
      shipment,
    )

    if (!write.row?.id) {
      throw new Error(
        'Die CardCargo-Sendung konnte nicht gespeichert werden. ' +
          (write.error || 'Unbekannter Fehler.'),
      )
    }

    const shipmentId = String(write.row.id)

    const { data: warehouseData, error: warehouseError } = await auth.supabase
      .from('warehouse_packages')
      .select('id, external_package_id, domestic_tracking_number')
      .eq('user_id', auth.user.id)
      .eq('provider', 'OLAEET')

    if (warehouseError) throw new Error(warehouseError.message)

    const warehousePackages = (warehouseData ?? []) as WarehousePackageRow[]
    const packageSync = await syncPackageLinks(
      auth.supabase,
      auth.user.id,
      shipmentId,
      shipment,
      warehousePackages,
    )

    await storeFullExtraction(
      auth.supabase,
      auth.user.id,
      shipmentId,
      shipment,
      rawPayload,
      parsed.extractedAt,
    )

    return NextResponse.json({
      shipmentId,
      shipment: {
        externalShipmentId: shipment.externalShipmentId,
        trackingNumber: shipment.trackingNumber,
        totalPayment: shipment.totalPayment,
        currency: shipment.currency || 'KRW',
        packageCount: shipment.packages.length,
        boxCount: shipment.boxes.length,
      },
      matchedPackages: packageSync.matched.length,
      packageLinksStored: packageSync.matched.length,
      missingPackages: packageSync.missing,
      baseShipmentTable: 'shipments',
      directPackageLinkColumn: 'shipment_id',
      directPackageLinks: packageSync.matched.length,
      fullDetailsStored: true,
      detailsUrl: `/shipments/${encodeURIComponent(shipmentId)}`,
      warnings: write.repairs,
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
