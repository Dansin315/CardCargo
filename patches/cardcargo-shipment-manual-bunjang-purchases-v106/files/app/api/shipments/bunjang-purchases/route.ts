import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'

type GenericRow = Record<string, unknown>
type SupabaseClient = Awaited<ReturnType<typeof getApiUser>>['supabase']

function rows(value: unknown): GenericRow[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is GenericRow =>
          Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
      )
    : []
}

function objectRow(value: unknown): GenericRow | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GenericRow)
    : null
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function dynamicMaybeSingle(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  column: string,
  value: string,
) {
  const response = await supabase
    .from(table as never)
    .select('*' as never)
    .eq('user_id' as never, userId as never)
    .eq(column as never, value as never)
    .maybeSingle()

  const typed = response as unknown as {
    data: unknown
    error: { message: string } | null
  }
  if (typed.error) return null
  return objectRow(typed.data)
}

async function resolveShipment(
  supabase: SupabaseClient,
  userId: string,
  shipmentRef: string,
) {
  let shipment: GenericRow | null = null

  if (isUuid(shipmentRef)) {
    shipment = await dynamicMaybeSingle(supabase, 'shipments', userId, 'id', shipmentRef)
  }

  if (!shipment) {
    for (const column of [
      'external_shipment_id',
      'shipment_number',
      'provider_shipment_id',
      'tracking_number',
    ]) {
      shipment = await dynamicMaybeSingle(supabase, 'shipments', userId, column, shipmentRef)
      if (shipment) break
    }
  }

  if (!shipment) throw new Error('Internationale Sendung wurde nicht gefunden.')

  const shipmentId = text(shipment.id)
  if (!shipmentId) throw new Error('Internationale Sendung besitzt keine CardCargo-ID.')

  const externalShipmentId =
    text(
      shipment.external_shipment_id ||
        shipment.shipment_number ||
        shipment.provider_shipment_id,
    ) || shipmentRef

  return { shipment, shipmentId, externalShipmentId }
}

async function assignedPurchaseIds(
  supabase: SupabaseClient,
  userId: string,
  shipmentId: string,
) {
  const response = await supabase
    .from('shipment_bunjang_purchases' as never)
    .select('*' as never)
    .eq('user_id' as never, userId as never)
    .eq('shipment_id' as never, shipmentId as never)

  const typed = response as unknown as {
    data: unknown
    error: { message: string } | null
  }

  if (typed.error) {
    throw new Error(
      'Die Tabelle shipment_bunjang_purchases fehlt oder ist nicht erreichbar. ' +
        'Führe supabase/manual/v106_shipment_bunjang_purchases.sql aus. ' +
        typed.error.message,
    )
  }

  return rows(typed.data)
}

async function fetchPurchasesByIds(
  supabase: SupabaseClient,
  userId: string,
  ids: string[],
) {
  if (!ids.length) return []
  const output: GenericRow[] = []

  for (let index = 0; index < ids.length; index += 150) {
    const chunk = ids.slice(index, index + 150)
    const response = await supabase
      .from('purchases')
      .select('*')
      .eq('user_id', userId)
      .in('id', chunk)

    if (!response.error) output.push(...rows(response.data))
  }

  return output
}

async function fetchItemCounts(
  supabase: SupabaseClient,
  purchaseIds: string[],
) {
  const counts = new Map<string, number>()
  if (!purchaseIds.length) return counts

  for (let index = 0; index < purchaseIds.length; index += 150) {
    const chunk = purchaseIds.slice(index, index + 150)
    const response = await supabase
      .from('purchase_items')
      .select('*')
      .in('purchase_id', chunk)

    if (response.error) continue
    for (const item of rows(response.data)) {
      const purchaseId = text(item.purchase_id)
      if (!purchaseId) continue
      const quantity = Math.max(1, Math.floor(numberOrNull(item.quantity) ?? 1))
      counts.set(purchaseId, (counts.get(purchaseId) ?? 0) + quantity)
    }
  }

  return counts
}

function purchaseDate(row: GenericRow) {
  return text(row.purchased_at || row.purchase_date || row.created_at)
}

function purchaseSearchBlob(row: GenericRow) {
  return [
    row.id,
    row.bunjang_order_id,
    row.title,
    row.seller_name,
    row.domestic_tracking_number,
    row.source_listing_id,
    row.listing_url,
    row.canonical_url,
    row.raw_metadata ? JSON.stringify(row.raw_metadata) : '',
  ]
    .map(text)
    .join(' ')
    .toLocaleLowerCase('de')
}

function purchaseView(row: GenericRow, itemCount: number, assigned: boolean) {
  return {
    id: text(row.id),
    orderId: text(row.bunjang_order_id) || null,
    title: text(row.title) || 'Bunjang-Einkauf',
    sellerName: text(row.seller_name) || null,
    purchasedAt: purchaseDate(row) || null,
    priceAmount: numberOrNull(row.price_amount),
    priceCurrency: text(row.price_currency || 'KRW') || 'KRW',
    domesticShippingAmount: numberOrNull(row.domestic_shipping_amount),
    domesticTrackingNumber: text(row.domestic_tracking_number) || null,
    status: text(row.status || row.purchase_status) || null,
    itemCount,
    assigned,
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getApiUser()
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const url = new URL(request.url)
    const shipmentRef = text(url.searchParams.get('shipmentRef'))
    const q = text(url.searchParams.get('q')).toLocaleLowerCase('de')
    const from = text(url.searchParams.get('from'))
    const to = text(url.searchParams.get('to'))

    if (!shipmentRef) {
      return NextResponse.json({ error: 'shipmentRef fehlt.' }, { status: 400 })
    }

    const resolved = await resolveShipment(auth.supabase, auth.user.id, shipmentRef)
    const links = await assignedPurchaseIds(auth.supabase, auth.user.id, resolved.shipmentId)
    const assignedIds = [...new Set(links.map((row) => text(row.purchase_id)).filter(Boolean))]
    const assignedSet = new Set(assignedIds)

    let query = auth.supabase
      .from('purchases')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('purchased_at', { ascending: false })
      .limit(from || to ? 1000 : q ? 1000 : 150)

    if (from) query = query.gte('purchased_at', `${from}T00:00:00`)
    if (to) {
      const end = new Date(`${to}T00:00:00Z`)
      if (!Number.isNaN(end.getTime())) {
        end.setUTCDate(end.getUTCDate() + 1)
        query = query.lt('purchased_at', end.toISOString())
      }
    }

    const candidateResponse = await query
    if (candidateResponse.error) throw new Error(candidateResponse.error.message)

    let candidates = rows(candidateResponse.data)
    if (q) candidates = candidates.filter((row) => purchaseSearchBlob(row).includes(q))

    const assignedRows = await fetchPurchasesByIds(auth.supabase, auth.user.id, assignedIds)
    const combinedById = new Map<string, GenericRow>()
    for (const row of [...assignedRows, ...candidates]) {
      const id = text(row.id)
      if (id) combinedById.set(id, row)
    }

    const itemCounts = await fetchItemCounts(auth.supabase, [...combinedById.keys()])

    const assigned = assignedRows
      .map((row) => purchaseView(row, itemCounts.get(text(row.id)) ?? 0, true))
      .sort((a, b) => String(b.purchasedAt || '').localeCompare(String(a.purchasedAt || '')))

    const candidateViews = candidates
      .map((row) => purchaseView(row, itemCounts.get(text(row.id)) ?? 0, assignedSet.has(text(row.id))))
      .sort((a, b) => String(b.purchasedAt || '').localeCompare(String(a.purchasedAt || '')))

    return NextResponse.json({
      shipment: {
        id: resolved.shipmentId,
        externalShipmentId: resolved.externalShipmentId,
      },
      assigned,
      candidates: candidateViews,
      filters: { q, from, to },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bunjang-Einkäufe konnten nicht geladen werden.' },
      { status: 400 },
    )
  }
}

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  try {
    const auth = await getApiUser()
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json()) as Record<string, unknown>
    const shipmentRef = text(body.shipmentRef)
    const action = text(body.action || 'add')
    const addedVia = text(body.addedVia || 'manual') || 'manual'
    const purchaseIds = Array.isArray(body.purchaseIds)
      ? [...new Set(body.purchaseIds.map(text).filter(Boolean))]
      : []

    if (!shipmentRef) {
      return NextResponse.json({ error: 'shipmentRef fehlt.' }, { status: 400 })
    }
    if (!purchaseIds.length) {
      return NextResponse.json({ error: 'Keine Bunjang-Einkäufe ausgewählt.' }, { status: 400 })
    }

    const resolved = await resolveShipment(auth.supabase, auth.user.id, shipmentRef)

    if (action === 'remove') {
      const response = await auth.supabase
        .from('shipment_bunjang_purchases' as never)
        .delete()
        .eq('user_id' as never, auth.user.id as never)
        .eq('shipment_id' as never, resolved.shipmentId as never)
        .in('purchase_id' as never, purchaseIds as never)
      const typed = response as unknown as { error: { message: string } | null }
      if (typed.error) throw new Error(typed.error.message)
      return NextResponse.json({ ok: true, removed: purchaseIds.length })
    }

    const owned = await fetchPurchasesByIds(auth.supabase, auth.user.id, purchaseIds)
    const ownedIds = new Set(owned.map((row) => text(row.id)).filter(Boolean))
    const invalid = purchaseIds.filter((id) => !ownedIds.has(id))
    if (invalid.length) {
      return NextResponse.json(
        { error: `${invalid.length} ausgewählte Einkäufe gehören nicht zum aktuellen Benutzer.` },
        { status: 400 },
      )
    }

    const payload = purchaseIds.map((purchaseId) => ({
      user_id: auth.user.id,
      shipment_id: resolved.shipmentId,
      external_shipment_id: resolved.externalShipmentId,
      purchase_id: purchaseId,
      added_via: addedVia,
      updated_at: new Date().toISOString(),
    }))

    const response = await auth.supabase
      .from('shipment_bunjang_purchases' as never)
      .upsert(payload as never, { onConflict: 'user_id,shipment_id,purchase_id' })
    const typed = response as unknown as { error: { message: string } | null }
    if (typed.error) {
      throw new Error(
        'Bunjang-Zuordnung konnte nicht gespeichert werden. ' +
          'Führe supabase/manual/v106_shipment_bunjang_purchases.sql aus. ' +
          typed.error.message,
      )
    }

    return NextResponse.json({ ok: true, added: purchaseIds.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bunjang-Zuordnung konnte nicht gespeichert werden.' },
      { status: 400 },
    )
  }
}
