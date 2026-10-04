import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'

type GenericRow = Record<string, unknown>
type SupabaseClient = Awaited<ReturnType<typeof getApiUser>>['supabase']

type FxSnapshot = {
  requestedDate: string
  rateDate: string
  krwPerEur: number
  source: string
}

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

function numberValue(value: unknown) {
  return numberOrNull(value) ?? 0
}

function dateOnly(value: unknown) {
  const raw = text(value)
  if (!raw) return ''
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

function metadataOrders(value: unknown) {
  const metadata = objectRow(value)
  const candidate = metadata?.bunjang_orders
  return rows(candidate)
}

function orderId(row: GenericRow) {
  return text(row.order_id || row.orderId || row.id)
}

function cardName(inventory: GenericRow | null, item: GenericRow | null) {
  const inventoryCatalog = objectRow(inventory?.catalog_snapshot)
  const itemCatalog = objectRow(item?.catalog_snapshot)
  const values = [
    // Keep the Umsatz workspace aligned with the Inventory workspace: item_name
    // is the canonical visible card title on inventory_units/purchase_items.
    inventory?.item_name,
    item?.item_name,
    inventory?.card_name,
    inventory?.name,
    inventory?.title,
    inventory?.pokemon_name,
    inventory?.product_name,
    inventory?.display_name,
    item?.card_name,
    item?.name,
    item?.title,
    item?.pokemon_name,
    item?.product_name,
    item?.display_name,
    inventoryCatalog?.englishName,
    inventoryCatalog?.name,
    itemCatalog?.englishName,
    itemCatalog?.name,
  ]
  for (const value of values) {
    const normalized = text(value)
    if (normalized) return normalized
  }
  return 'Einzelkarte'
}

function cardSubtitle(inventory: GenericRow | null, item: GenericRow | null) {
  const inventoryCatalog = objectRow(inventory?.catalog_snapshot)
  const itemCatalog = objectRow(item?.catalog_snapshot)
  const setName = text(
    inventory?.set_name ||
      inventory?.card_set_name ||
      item?.set_name ||
      item?.card_set_name ||
      inventoryCatalog?.setName ||
      inventoryCatalog?.set_name ||
      itemCatalog?.setName ||
      itemCatalog?.set_name,
  )
  const setNumber = text(
    inventory?.set_number ||
      inventory?.set_code ||
      inventory?.set_id ||
      inventory?.card_set_id ||
      item?.set_number ||
      item?.set_code ||
      item?.set_id ||
      item?.card_set_id ||
      inventoryCatalog?.setNumber ||
      inventoryCatalog?.set_number ||
      inventoryCatalog?.setCode ||
      inventoryCatalog?.set_code ||
      inventoryCatalog?.setId ||
      inventoryCatalog?.set_id ||
      itemCatalog?.setNumber ||
      itemCatalog?.set_number ||
      itemCatalog?.setCode ||
      itemCatalog?.set_code ||
      itemCatalog?.setId ||
      itemCatalog?.set_id,
  )
  const number = text(
    inventory?.card_number ||
      inventory?.collector_number ||
      item?.card_number ||
      item?.collector_number ||
      inventoryCatalog?.cardNumber ||
      inventoryCatalog?.number ||
      itemCatalog?.cardNumber ||
      itemCatalog?.number,
  )
  const language = text(inventory?.language || item?.language)
  return [
    number ? `Kartennr. ${number}` : '',
    setNumber ? `Set ${setNumber}` : '',
    setName,
    language,
  ].filter(Boolean).join(' · ')
}

function shipmentDate(shipment: GenericRow) {
  return (
    dateOnly(
      shipment.provider_created_at ||
        shipment.shipped_at ||
        shipment.shipment_date ||
        shipment.created_at,
    ) || new Date().toISOString().slice(0, 10)
  )
}

async function loadStoredFx(
  supabase: SupabaseClient,
  userId: string,
  shipmentId: string,
): Promise<FxSnapshot | null> {
  const response = await supabase
    .from('shipment_revenue_fx' as never)
    .select('*')
    .eq('user_id' as never, userId as never)
    .eq('shipment_id' as never, shipmentId as never)
    .maybeSingle()
  const typed = response as unknown as { data: unknown; error: { message: string } | null }
  if (typed.error || !typed.data) return null
  const row = objectRow(typed.data)
  const rate = numberOrNull(row?.krw_per_eur)
  if (!row || !rate || rate <= 0) return null
  return {
    requestedDate: text(row.requested_date),
    rateDate: text(row.rate_date),
    krwPerEur: rate,
    source: text(row.source) || 'Frankfurter / ECB',
  }
}

function minusDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() - days)
  return parsed.toISOString().slice(0, 10)
}

async function fetchHistoricalFx(requestedDate: string): Promise<FxSnapshot | null> {
  // ECB reference rates are not published on every calendar day. Try the
  // shipment date first, then the most recent previous publishing day.
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = minusDays(requestedDate, offset)
    try {
      const response = await fetch(
        `https://api.frankfurter.dev/v2/rate/eur/krw?date=${encodeURIComponent(candidate)}&providers=ecb`,
        { cache: 'no-store', signal: AbortSignal.timeout(6000) },
      )
      if (!response.ok) continue
      const payload = (await response.json()) as Record<string, unknown>
      const rate = numberOrNull(payload.rate)
      const rateDate = text(payload.date) || candidate
      if (rate && rate > 0) {
        return {
          requestedDate,
          rateDate,
          krwPerEur: rate,
          source: 'Frankfurter / ECB',
        }
      }
    } catch {
      // Try the previous publishing day. If the service is unreachable all
      // attempts fail and the UI remains usable in KRW with an FX warning.
    }
  }
  return null
}

async function resolveFx(
  supabase: SupabaseClient,
  userId: string,
  shipmentId: string,
  externalShipmentId: string,
  requestedDate: string,
) {
  const stored = await loadStoredFx(supabase, userId, shipmentId)
  if (stored) return stored

  const fetched = await fetchHistoricalFx(requestedDate)
  if (!fetched) return null

  const upsert = await supabase
    .from('shipment_revenue_fx' as never)
    .upsert(
      {
        user_id: userId,
        shipment_id: shipmentId,
        external_shipment_id: externalShipmentId,
        requested_date: fetched.requestedDate,
        rate_date: fetched.rateDate,
        krw_per_eur: fetched.krwPerEur,
        source: fetched.source,
      } as never,
      { onConflict: 'user_id,shipment_id' } as never,
    )
  const typed = upsert as unknown as { error: { message: string } | null }
  // A missing v102 SQL table should not make the whole revenue page unusable.
  // The rate is still returned for the current request, but the API also tells
  // the UI that it could not be persisted.
  return {
    ...fetched,
    persistenceWarning: typed.error?.message || null,
  }
}

async function shipmentOptions(supabase: SupabaseClient, userId: string) {
  const response = await supabase
    .from('inventory_shipment_sources' as never)
    .select('shipment_id, external_shipment_id, inventory_unit_id, created_at')
    .eq('user_id' as never, userId as never)
  const typed = response as unknown as { data: unknown; error: { message: string } | null }
  if (typed.error) throw new Error(
    'Sendungszuordnungen fehlen. Führe zuerst v99_inventory_shipment_sources.sql aus. ' +
      typed.error.message,
  )

  const grouped = new Map<string, { shipmentId: string; externalShipmentId: string; cardCount: number }>()
  for (const row of rows(typed.data)) {
    const externalShipmentId = text(row.external_shipment_id)
    const shipmentId = text(row.shipment_id)
    if (!externalShipmentId || !shipmentId) continue
    const current = grouped.get(externalShipmentId) ?? {
      shipmentId,
      externalShipmentId,
      cardCount: 0,
    }
    current.cardCount += 1
    grouped.set(externalShipmentId, current)
  }
  return [...grouped.values()].sort((a, b) => b.externalShipmentId.localeCompare(a.externalShipmentId))
}

async function resolveShipment(
  supabase: SupabaseClient,
  userId: string,
  shipmentRef: string,
) {
  let sourceQuery = supabase
    .from('inventory_shipment_sources' as never)
    .select('shipment_id, external_shipment_id')
    .eq('user_id' as never, userId as never)
    .limit(1)

  sourceQuery = /^SHP-/i.test(shipmentRef)
    ? sourceQuery.eq('external_shipment_id' as never, shipmentRef.toUpperCase() as never)
    : sourceQuery.eq('shipment_id' as never, shipmentRef as never)

  const sourceResponse = await sourceQuery.maybeSingle()
  const typedSource = sourceResponse as unknown as {
    data: unknown
    error: { message: string } | null
  }
  const source = !typedSource.error ? objectRow(typedSource.data) : null
  const shipmentId = text(source?.shipment_id || (!/^SHP-/i.test(shipmentRef) ? shipmentRef : ''))
  if (!shipmentId) throw new Error('Internationale Sendung wurde nicht gefunden.')

  const response = await supabase
    .from('shipments' as never)
    .select('*')
    .eq('user_id' as never, userId as never)
    .eq('id' as never, shipmentId as never)
    .maybeSingle()
  const typed = response as unknown as { data: unknown; error: { message: string } | null }
  if (typed.error || !typed.data) throw new Error(typed.error?.message || 'Sendung wurde nicht gefunden.')
  const shipment = objectRow(typed.data)
  if (!shipment) throw new Error('Sendung wurde nicht gefunden.')

  const externalShipmentId = (
    text(
      source?.external_shipment_id ||
        shipment.external_shipment_id ||
        shipment.shipment_number ||
        shipment.provider_shipment_id,
    ) || shipmentRef
  ).toUpperCase()

  return { shipment, shipmentId, externalShipmentId }
}

async function fetchRowsByIds(
  supabase: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
) {
  if (!ids.length) return []
  const response = await supabase
    .from(table as never)
    .select('*')
    .in(column as never, ids as never)
  const typed = response as unknown as { data: unknown; error: { message: string } | null }
  if (typed.error) throw new Error(typed.error.message)
  return rows(typed.data)
}

function calculatePurchaseCostKrw(purchase: GenericRow, fx: FxSnapshot | null) {
  const amount =
    numberValue(purchase.price_amount) +
    numberValue(purchase.domestic_shipping_amount) +
    numberValue(purchase.service_fee_amount)
  const currency = text(purchase.price_currency || 'KRW').toUpperCase() || 'KRW'
  if (currency === 'KRW') return amount
  if (currency === 'EUR' && fx) return amount * fx.krwPerEur
  return null
}


type InventoryMutationResult = {
  data: unknown
  error: { message: string } | null
}

async function updateInventoryField(
  supabase: SupabaseClient,
  userId: string,
  inventoryUnitId: string,
  field: string,
  value: unknown,
) {
  const response = await supabase
    .from('inventory_units' as never)
    .update({ [field]: value } as never)
    .eq('user_id' as never, userId as never)
    .eq('id' as never, inventoryUnitId as never)
    .select('id')
    .maybeSingle()
  const typed = response as unknown as InventoryMutationResult
  return { ok: !typed.error, error: typed.error?.message || null }
}

async function discoverSoldStatusValues(
  supabase: SupabaseClient,
  userId: string,
  column: string,
) {
  const response = await supabase
    .from('inventory_units' as never)
    .select(column as never)
    .eq('user_id' as never, userId as never)
    .limit(500)
  const typed = response as unknown as InventoryMutationResult
  if (typed.error) return []
  const existing = rows(typed.data)
    .map((row) => text(row[column]))
    .filter(Boolean)
  const soldLike = existing.filter((value) => /sold|verkauft|sold_out|completed/i.test(value))
  return [...new Set([...soldLike, 'sold', 'verkauft', 'sold_out', 'completed'])]
}

async function syncInventorySaleState(
  supabase: SupabaseClient,
  userId: string,
  inventoryUnitId: string,
  shipmentId: string,
  salePriceKrw: number | null,
) {
  const rowResponse = await supabase
    .from('inventory_units' as never)
    .select('*')
    .eq('user_id' as never, userId as never)
    .eq('id' as never, inventoryUnitId as never)
    .maybeSingle()
  const typedRow = rowResponse as unknown as InventoryMutationResult
  const inventory = !typedRow.error ? objectRow(typedRow.data) : null
  if (!inventory) {
    return 'Verkaufspreis wurde gespeichert, aber die Inventory Unit konnte für die Status-Synchronisierung nicht geladen werden.'
  }

  const keys = new Set(Object.keys(inventory))
  const fx = shipmentId ? await loadStoredFx(supabase, userId, shipmentId) : null
  const salePriceEur = salePriceKrw !== null && fx?.krwPerEur
    ? salePriceKrw / fx.krwPerEur
    : null
  const warnings: string[] = []

  const krwFields = [
    'sale_price_krw',
    'sold_price_krw',
    'selling_price_krw',
    'sale_amount_krw',
    'sold_amount_krw',
    'actual_sale_price_krw',
  ]
  const eurFields = [
    'sale_price_eur',
    'sold_price_eur',
    'selling_price_eur',
    'sale_amount_eur',
    'sold_amount_eur',
    'actual_sale_price_eur',
  ]
  const genericFields = [
    'sale_price',
    'sold_price',
    'selling_price',
    'sale_amount',
    'sold_amount',
    'actual_sale_price',
  ]

  for (const field of krwFields) {
    if (!keys.has(field)) continue
    const result = await updateInventoryField(supabase, userId, inventoryUnitId, field, salePriceKrw)
    if (!result.ok) warnings.push(`${field}: ${result.error}`)
  }
  if (salePriceEur !== null || salePriceKrw === null) {
    for (const field of eurFields) {
      if (!keys.has(field)) continue
      const result = await updateInventoryField(supabase, userId, inventoryUnitId, field, salePriceEur)
      if (!result.ok) warnings.push(`${field}: ${result.error}`)
    }
  }

  // Generic sales-price fields are treated as EUR in v105 because Umsatz is
  // edited in EUR. A dedicated sales currency is synchronized when present.
  for (const field of genericFields) {
    if (!keys.has(field)) continue
    const value = salePriceKrw === null ? null : (salePriceEur ?? salePriceKrw)
    const result = await updateInventoryField(supabase, userId, inventoryUnitId, field, value)
    if (!result.ok) warnings.push(`${field}: ${result.error}`)
  }
  for (const currencyField of ['sale_currency', 'sold_currency', 'selling_currency', 'sale_price_currency']) {
    if (!keys.has(currencyField)) continue
    const result = await updateInventoryField(
      supabase,
      userId,
      inventoryUnitId,
      currencyField,
      salePriceKrw === null ? null : 'EUR',
    )
    if (!result.ok) warnings.push(`${currencyField}: ${result.error}`)
  }

  for (const metadataField of ['raw_metadata', 'metadata']) {
    if (!keys.has(metadataField)) continue
    const current = objectRow(inventory[metadataField]) ?? {}
    const currentRevenue = objectRow(current.revenue) ?? {}
    const nextMetadata = {
      ...current,
      revenue: {
        ...currentRevenue,
        sale_price_krw: salePriceKrw,
        sale_price_eur: salePriceEur,
        sale_currency: 'EUR',
        updated_at: new Date().toISOString(),
      },
    }
    const result = await updateInventoryField(
      supabase,
      userId,
      inventoryUnitId,
      metadataField,
      nextMetadata,
    )
    if (!result.ok) warnings.push(`${metadataField}: ${result.error}`)
    break
  }

  // A non-empty Verkaufspreis makes the Inventory Unit sold. Clearing a price
  // does not guess a previous status and therefore intentionally does not
  // auto-revert an already sold card.
  if (salePriceKrw !== null) {
    let statusUpdated = false
    for (const statusColumn of ['status', 'inventory_status']) {
      if (!keys.has(statusColumn)) continue
      const statusCandidates = await discoverSoldStatusValues(supabase, userId, statusColumn)
      for (const status of statusCandidates) {
        const result = await updateInventoryField(
          supabase,
          userId,
          inventoryUnitId,
          statusColumn,
          status,
        )
        if (result.ok) {
          statusUpdated = true
          break
        }
      }
    }

    for (const soldAtField of ['sold_at', 'sold_date', 'sale_date']) {
      if (!keys.has(soldAtField)) continue
      const result = await updateInventoryField(
        supabase,
        userId,
        inventoryUnitId,
        soldAtField,
        new Date().toISOString(),
      )
      if (!result.ok) warnings.push(`${soldAtField}: ${result.error}`)
    }

    if (!statusUpdated) {
      warnings.push('Kein kompatibler Inventar-Status für „verkauft“ konnte gesetzt werden.')
    }
  }

  return warnings.length ? warnings.join(' · ') : null
}

export async function GET(request: Request) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const options = await shipmentOptions(auth.supabase, auth.user.id)
    const url = new URL(request.url)
    const shipmentRef = text(url.searchParams.get('shipmentRef'))

    if (!shipmentRef) {
      return NextResponse.json({ shipments: options })
    }

    const { shipment, shipmentId, externalShipmentId } = await resolveShipment(
      auth.supabase,
      auth.user.id,
      shipmentRef,
    )

    const sourceResponse = await auth.supabase
      .from('inventory_shipment_sources' as never)
      .select('*')
      .eq('user_id' as never, auth.user.id as never)
      .eq('shipment_id' as never, shipmentId as never)
    const typedSources = sourceResponse as unknown as {
      data: unknown
      error: { message: string } | null
    }
    if (typedSources.error) throw new Error(typedSources.error.message)
    const sources = rows(typedSources.data)

    const inventoryIds = [...new Set(sources.map((row) => text(row.inventory_unit_id)).filter(Boolean))]
    const inventoryRows = await fetchRowsByIds(auth.supabase, 'inventory_units', 'id', inventoryIds)
    const inventoryById = new Map(inventoryRows.map((row) => [text(row.id), row]))

    const purchaseItemIds = [...new Set(
      sources
        .map((source) => {
          const inventory = inventoryById.get(text(source.inventory_unit_id))
          return text(source.purchase_item_id || inventory?.purchase_item_id)
        })
        .filter(Boolean),
    )]
    const purchaseItems = await fetchRowsByIds(auth.supabase, 'purchase_items', 'id', purchaseItemIds)
    const itemById = new Map(purchaseItems.map((row) => [text(row.id), row]))

    const purchaseIds = [...new Set(
      sources
        .map((source) => {
          const itemId = text(source.purchase_item_id || inventoryById.get(text(source.inventory_unit_id))?.purchase_item_id)
          const item = itemById.get(itemId)
          const fromItem = text(item?.purchase_id)
          if (fromItem) return fromItem
          return text(source.source_type) === 'bunjang_purchase' ? text(source.source_parent_id) : ''
        })
        .filter(Boolean),
    )]
    const purchases = await fetchRowsByIds(auth.supabase, 'purchases', 'id', purchaseIds)
    const purchaseById = new Map(purchases.map((row) => [text(row.id), row]))

    const salesResponse = inventoryIds.length
      ? await auth.supabase
          .from('inventory_sales_values' as never)
          .select('*')
          .eq('user_id' as never, auth.user.id as never)
          .in('inventory_unit_id' as never, inventoryIds as never)
      : { data: [], error: null }
    const typedSales = salesResponse as unknown as {
      data: unknown
      error: { message: string } | null
    }
    const salesRows = typedSales.error ? [] : rows(typedSales.data)
    const salesByInventory = new Map(salesRows.map((row) => [text(row.inventory_unit_id), row]))

    const requestedDate = shipmentDate(shipment)
    const fx = await resolveFx(
      auth.supabase,
      auth.user.id,
      shipmentId,
      externalShipmentId,
      requestedDate,
    )

    type CardOutput = {
      inventoryUnitId: string
      purchaseItemId: string | null
      name: string
      subtitle: string
      status: string
      sourceType: string
      storageNumber: string | null
      minSalePriceKrw: number | null
      salePriceKrw: number | null
    }

    type GroupOutput = {
      key: string
      type: 'purchase' | 'package'
      label: string
      subtitle: string
      purchaseId: string | null
      purchaseCostKrw: number | null
      cards: CardOutput[]
    }

    const groups = new Map<string, GroupOutput>()

    for (const source of sources) {
      const inventoryId = text(source.inventory_unit_id)
      if (!inventoryId) continue
      const inventory = inventoryById.get(inventoryId) ?? null
      const purchaseItemId = text(source.purchase_item_id || inventory?.purchase_item_id)
      const item = purchaseItemId ? itemById.get(purchaseItemId) ?? null : null
      const purchaseId = text(item?.purchase_id) ||
        (text(source.source_type) === 'bunjang_purchase' ? text(source.source_parent_id) : '')
      const purchase = purchaseId ? purchaseById.get(purchaseId) ?? null : null
      const storageNumber = text(source.source_storage_number) || null
      const sale = salesByInventory.get(inventoryId)

      const card: CardOutput = {
        inventoryUnitId: inventoryId,
        purchaseItemId: purchaseItemId || null,
        name: cardName(inventory, item),
        subtitle: cardSubtitle(inventory, item),
        status: text(inventory?.status || inventory?.inventory_status),
        sourceType: text(source.source_type),
        storageNumber,
        minSalePriceKrw: numberOrNull(sale?.min_sale_price_krw),
        salePriceKrw: numberOrNull(sale?.sale_price_krw),
      }

      if (purchase) {
        const groupedOrders = metadataOrders(purchase.raw_metadata)
        const primaryOrderId = text(purchase.bunjang_order_id) || orderId(groupedOrders[0] ?? {})
        const allOrderIds = groupedOrders.map(orderId).filter(Boolean)
        const label = groupedOrders.length > 1
          ? `Bestellungen ${primaryOrderId || text(purchase.id).slice(0, 8)} +${groupedOrders.length - 1}`
          : `Bestellung ${primaryOrderId || text(purchase.id).slice(0, 8)}`
        const key = `purchase:${text(purchase.id)}`
        const current: GroupOutput = groups.get(key) ?? {
          key,
          type: 'purchase' as const,
          label,
          subtitle: allOrderIds.length > 1 ? allOrderIds.join(' · ') : text(purchase.title),
          purchaseId: text(purchase.id),
          purchaseCostKrw: calculatePurchaseCostKrw(purchase, fx),
          cards: [],
        }
        current.cards.push(card)
        groups.set(key, current)
      } else {
        const packageLabel = storageNumber || text(source.source_parent_id).slice(0, 8) || 'ohne Zuordnung'
        const key = `package:${storageNumber || text(source.source_parent_id) || 'unknown'}`
        const current: GroupOutput = groups.get(key) ?? {
          key,
          type: 'package' as const,
          label: `OLAEET-Paket ${packageLabel}`,
          subtitle: 'Direkt im OLAEET-Paket erfasste Einzelkarten',
          purchaseId: null,
          purchaseCostKrw: 0,
          cards: [],
        }
        current.cards.push(card)
        groups.set(key, current)
      }
    }

    const sortedGroups = [...groups.values()]
      .map((group) => ({
        ...group,
        cards: group.cards.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'))

    const flatCards = sortedGroups.flatMap((group) => group.cards)
    const purchaseCostKrw = sortedGroups.reduce(
      (sum, group) => sum + (group.purchaseCostKrw ?? 0),
      0,
    )
    const minimumRevenueKrw = flatCards.reduce(
      (sum, card) => sum + (card.minSalePriceKrw ?? 0),
      0,
    )
    const actualRevenueKrw = flatCards.reduce(
      (sum, card) => sum + (card.salePriceKrw ?? 0),
      0,
    )
    const soldCardCount = flatCards.filter((card) => card.salePriceKrw !== null).length

    return NextResponse.json({
      shipments: options,
      shipment: {
        id: shipmentId,
        externalShipmentId,
        createdDate: requestedDate,
        providerCreatedAt: text(shipment.provider_created_at) || null,
      },
      fx,
      groups: sortedGroups,
      totals: {
        cardCount: flatCards.length,
        orderGroupCount: sortedGroups.filter((group) => group.type === 'purchase').length,
        purchaseCostKrw,
        minimumRevenueKrw,
        actualRevenueKrw,
        soldCardCount,
      },
      warnings: [
        ...(typedSales.error
          ? ['v102-Datenbanktabelle inventory_sales_values fehlt oder ist noch nicht im Schema-Cache verfügbar.']
          : []),
        ...(!fx ? ['Historischer EUR/KRW-Kurs konnte nicht geladen werden.'] : []),
      ],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    )
  }
}

export async function PATCH(request: Request) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Nicht vertrauenswürdige Anfrage.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    const inventoryUnitId = text(body.inventoryUnitId)
    const field = text(body.field)
    const value = numberOrNull(body.value)

    if (!inventoryUnitId) throw new Error('Inventory Unit fehlt.')
    if (!['minSalePriceKrw', 'salePriceKrw'].includes(field)) {
      throw new Error('Unbekanntes Umsatzfeld.')
    }
    if (value !== null && value < 0) throw new Error('Betrag darf nicht negativ sein.')

    const sourceResponse = await auth.supabase
      .from('inventory_shipment_sources' as never)
      .select('shipment_id, external_shipment_id')
      .eq('user_id' as never, auth.user.id as never)
      .eq('inventory_unit_id' as never, inventoryUnitId as never)
      .limit(1)
      .maybeSingle()
    const typedSource = sourceResponse as unknown as {
      data: unknown
      error: { message: string } | null
    }
    const source = !typedSource.error ? objectRow(typedSource.data) : null
    if (!source) throw new Error('Diese Karte ist keiner internationalen Sendung zugeordnet.')

    const dbColumn = field === 'minSalePriceKrw' ? 'min_sale_price_krw' : 'sale_price_krw'
    const payload: GenericRow = {
      user_id: auth.user.id,
      inventory_unit_id: inventoryUnitId,
      shipment_id: text(source.shipment_id),
      external_shipment_id: text(source.external_shipment_id),
      [dbColumn]: value,
      updated_at: new Date().toISOString(),
    }

    const response = await auth.supabase
      .from('inventory_sales_values' as never)
      .upsert(payload as never, { onConflict: 'user_id,inventory_unit_id' } as never)
      .select('*')
      .single()
    const typed = response as unknown as {
      data: unknown
      error: { message: string } | null
    }
    if (typed.error) {
      throw new Error(
        'Umsatzwert konnte nicht gespeichert werden. Führe supabase/manual/v102_revenue_workspace.sql aus. ' +
          typed.error.message,
      )
    }
    const saved = objectRow(typed.data)
    const savedSalePriceKrw = numberOrNull(saved?.sale_price_krw)
    const inventorySyncWarning = field === 'salePriceKrw'
      ? await syncInventorySaleState(
          auth.supabase,
          auth.user.id,
          inventoryUnitId,
          text(source.shipment_id),
          savedSalePriceKrw,
        )
      : null

    return NextResponse.json({
      inventoryUnitId,
      minSalePriceKrw: numberOrNull(saved?.min_sale_price_krw),
      salePriceKrw: savedSalePriceKrw,
      inventorySyncWarning,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    )
  }
}
