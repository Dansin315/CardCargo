import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { inventoryUnitColumns as generatedInventoryColumns } from '@/lib/inventory-shipment-schema.generated'
import { packagePurchaseRelationTableCandidates } from '@/lib/olaeet-image-schema.generated'

type GenericRow = Record<string, unknown>
type SupabaseClient = Awaited<ReturnType<typeof getApiUser>>['supabase']

type Candidate = {
  item: GenericRow
  sourceType: 'bunjang_purchase' | 'olaeet_package'
  sourceParentId: string
  storageNumber: string | null
}

function objectRow(value: unknown): GenericRow | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GenericRow)
    : null
}

function rows(value: unknown): GenericRow[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is GenericRow =>
          Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
      )
    : []
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function quantity(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(100, Math.floor(parsed)))
}

async function dynamicRows(
  supabase: SupabaseClient,
  table: string,
  relationColumn: string,
  ids: string[],
) {
  if (!ids.length) return []
  const response = await supabase
    .from(table as never)
    .select('*')
    .in(relationColumn as never, ids as never)
  const typed = response as unknown as {
    data: unknown
    error: { message: string } | null
  }
  return typed.error ? [] : rows(typed.data)
}

async function resolveShipment(
  supabase: SupabaseClient,
  userId: string,
  shipmentRef: string,
) {
  const byId = await supabase
    .from('shipments' as never)
    .select('*')
    .eq('user_id' as never, userId as never)
    .eq('id' as never, shipmentRef as never)
    .maybeSingle()
  const typedById = byId as unknown as {
    data: unknown
    error: { message: string } | null
  }

  let shipment = !typedById.error ? objectRow(typedById.data) : null

  if (!shipment && /^SHP-/i.test(shipmentRef)) {
    for (const column of ['external_shipment_id', 'shipment_number', 'provider_shipment_id']) {
      const response = await supabase
        .from('shipments' as never)
        .select('*')
        .eq('user_id' as never, userId as never)
        .eq(column as never, shipmentRef.toUpperCase() as never)
        .maybeSingle()
      const typed = response as unknown as {
        data: unknown
        error: { message: string } | null
      }
      if (!typed.error && typed.data) {
        shipment = objectRow(typed.data)
        if (shipment) break
      }
    }
  }

  if (!shipment) throw new Error('Internationale Sendung wurde nicht gefunden.')

  const shipmentId = text(shipment.id)
  const externalShipmentId =
    text(
      shipment.external_shipment_id ||
        shipment.shipment_number ||
        shipment.provider_shipment_id,
    ) || shipmentRef

  return { shipment, shipmentId, externalShipmentId: externalShipmentId.toUpperCase() }
}

async function resolveShipmentPackages(
  supabase: SupabaseClient,
  userId: string,
  shipmentId: string,
  externalShipmentId: string,
) {
  const found = new Map<string, GenericRow>()

  const direct = await supabase
    .from('warehouse_packages')
    .select('*')
    .eq('user_id', userId)
    .eq('shipment_id' as never, shipmentId as never)
  if (!direct.error) {
    for (const row of rows(direct.data)) found.set(text(row.id), row)
  }

  for (const relationColumn of ['shipment_id', 'external_shipment_id']) {
    const relationValue = relationColumn === 'shipment_id' ? shipmentId : externalShipmentId
    const links = await supabase
      .from('olaeet_shipment_package_links' as never)
      .select('*')
      .eq('user_id' as never, userId as never)
      .eq(relationColumn as never, relationValue as never)
    const typed = links as unknown as { data: unknown; error: { message: string } | null }
    if (typed.error) continue
    const ids = rows(typed.data).map((row) => text(row.warehouse_package_id)).filter(Boolean)
    if (!ids.length) continue
    const packages = await supabase
      .from('warehouse_packages')
      .select('*')
      .eq('user_id', userId)
      .in('id', ids)
    if (!packages.error) {
      for (const row of rows(packages.data)) found.set(text(row.id), row)
    }
  }

  if (!found.size) {
    const extraction = await supabase
      .from('olaeet_shipment_extractions' as never)
      .select('packages')
      .eq('user_id' as never, userId as never)
      .eq('external_shipment_id' as never, externalShipmentId as never)
      .maybeSingle()
    const typed = extraction as unknown as { data: unknown; error: { message: string } | null }
    const extractionRow = !typed.error ? objectRow(typed.data) : null
    const externalIds = rows(extractionRow?.packages)
      .map((row) => text(row.externalPackageId || row.external_package_id).toUpperCase())
      .filter(Boolean)
    if (externalIds.length) {
      const packages = await supabase
        .from('warehouse_packages')
        .select('*')
        .eq('user_id', userId)
        .in('external_package_id', externalIds)
      if (!packages.error) {
        for (const row of rows(packages.data)) found.set(text(row.id), row)
      }
    }
  }

  return [...found.values()]
}

async function resolvePurchaseIdsByPackages(
  supabase: SupabaseClient,
  packages: GenericRow[],
) {
  const packageIds = packages.map((row) => text(row.id)).filter(Boolean)
  const purchaseIds = new Set<string>()
  const packageByPurchase = new Map<string, string>()

  for (const pkg of packages) {
    const packageId = text(pkg.id)
    const purchaseId = text(pkg.purchase_id)
    if (purchaseId) {
      purchaseIds.add(purchaseId)
      packageByPurchase.set(purchaseId, packageId)
    }
    if (Array.isArray(pkg.purchase_ids)) {
      for (const value of pkg.purchase_ids) {
        const id = text(value)
        if (id) {
          purchaseIds.add(id)
          packageByPurchase.set(id, packageId)
        }
      }
    }
  }

  for (const table of packagePurchaseRelationTableCandidates) {
    for (const packageColumn of ['warehouse_package_id', 'package_id']) {
      const relationRows = await dynamicRows(supabase, table, packageColumn, packageIds)
      if (!relationRows.length) continue
      for (const row of relationRows) {
        const purchaseId = text(row.purchase_id || row.purchaseId)
        const packageId = text(row[packageColumn])
        if (purchaseId) {
          purchaseIds.add(purchaseId)
          if (packageId) packageByPurchase.set(purchaseId, packageId)
        }
      }
      break
    }
  }

  for (const directColumn of ['warehouse_package_id', 'package_id']) {
    const purchaseRows = await dynamicRows(supabase, 'purchases', directColumn, packageIds)
    for (const row of purchaseRows) {
      const purchaseId = text(row.id)
      const packageId = text(row[directColumn])
      if (purchaseId) {
        purchaseIds.add(purchaseId)
        if (packageId) packageByPurchase.set(purchaseId, packageId)
      }
    }
  }

  return { purchaseIds: [...purchaseIds], packageByPurchase }
}

async function resolveManualShipmentPurchaseIds(
  supabase: SupabaseClient,
  userId: string,
  shipmentId: string,
) {
  const response = await supabase
    .from('shipment_bunjang_purchases' as never)
    .select('purchase_id' as never)
    .eq('user_id' as never, userId as never)
    .eq('shipment_id' as never, shipmentId as never)

  const typed = response as unknown as { data: unknown; error: { message: string } | null }
  if (typed.error) return []
  return [...new Set(rows(typed.data).map((row) => text(row.purchase_id)).filter(Boolean))]
}

async function loadCandidates(
  supabase: SupabaseClient,
  packages: GenericRow[],
  manualPurchaseIds: string[] = [],
) {
  const packageIds = packages.map((row) => text(row.id)).filter(Boolean)
  const packageMap = new Map(packages.map((row) => [text(row.id), row]))
  const { purchaseIds: packagePurchaseIds, packageByPurchase } = await resolvePurchaseIdsByPackages(supabase, packages)
  const purchaseIds = [...new Set([...packagePurchaseIds, ...manualPurchaseIds])]
  const candidates = new Map<string, Candidate>()

  if (packageIds.length) {
    const response = await supabase
      .from('purchase_items')
      .select('*')
      .in('warehouse_package_id', packageIds)
    if (!response.error) {
      for (const item of rows(response.data)) {
        const itemId = text(item.id)
        const packageId = text(item.warehouse_package_id)
        if (!itemId) continue
        candidates.set(itemId, {
          item,
          sourceType: 'olaeet_package',
          sourceParentId: packageId,
          storageNumber: text(packageMap.get(packageId)?.external_package_id) || null,
        })
      }
    }
  }

  if (purchaseIds.length) {
    const response = await supabase
      .from('purchase_items')
      .select('*')
      .in('purchase_id', purchaseIds)
    if (!response.error) {
      for (const item of rows(response.data)) {
        const itemId = text(item.id)
        const purchaseId = text(item.purchase_id)
        if (!itemId || candidates.has(itemId)) continue
        const packageId = packageByPurchase.get(purchaseId) || ''
        candidates.set(itemId, {
          item,
          sourceType: 'bunjang_purchase',
          sourceParentId: purchaseId,
          storageNumber: text(packageMap.get(packageId)?.external_package_id) || null,
        })
      }
    }
  }

  return [...candidates.values()]
}

function itemQuantity(item: GenericRow) {
  return quantity(item.quantity ?? item.qty ?? item.count ?? 1)
}

function itemName(item: GenericRow) {
  return (
    text(
      item.item_name ||
        item.card_name ||
        item.name ||
        item.title ||
        item.pokemon_name ||
        item.product_name ||
        item.display_name,
    ) || 'Einzelkarte'
  )
}

async function loadExistingInventory(
  supabase: SupabaseClient,
  userId: string,
  purchaseItemIds: string[],
) {
  if (!purchaseItemIds.length) return []
  const response = await supabase
    .from('inventory_units' as never)
    .select('*')
    .eq('user_id' as never, userId as never)
    .in('purchase_item_id' as never, purchaseItemIds as never)
  const typed = response as unknown as { data: unknown; error: { message: string } | null }
  if (typed.error) throw new Error(typed.error.message)
  return rows(typed.data)
}

async function probeInventory(
  supabase: SupabaseClient,
  userId: string,
) {
  const response = await supabase
    .from('inventory_units' as never)
    .select('*')
    .eq('user_id' as never, userId as never)
    .limit(1)
  const typed = response as unknown as { data: unknown; error: { message: string } | null }
  if (typed.error) throw new Error(typed.error.message)
  const sample = rows(typed.data)[0] ?? null
  return {
    sample,
    columns: new Set([
      ...generatedInventoryColumns,
      ...(sample ? Object.keys(sample) : []),
    ]),
  }
}

const ignoredColumns = new Set([
  'id',
  'created_at',
  'updated_at',
  'purchase_id',
  'warehouse_package_id',
  'shipment_id',
])

const aliases: Record<string, string[]> = {
  item_name: ['item_name', 'card_name', 'name', 'title', 'pokemon_name', 'product_name'],
  name: ['name', 'item_name', 'card_name', 'title', 'pokemon_name', 'product_name'],
  card_name: ['card_name', 'item_name', 'name', 'title', 'pokemon_name', 'product_name'],
  pokemon_name: ['pokemon_name', 'item_name', 'card_name', 'name'],
  title: ['title', 'item_name', 'card_name', 'name'],
  catalog_card_id: ['catalog_card_id', 'card_id', 'catalog_id'],
  card_id: ['card_id', 'catalog_card_id', 'catalog_id'],
  printing_id: ['printing_id', 'card_printing_id'],
  set_id: ['set_id', 'card_set_id'],
  set_name: ['set_name', 'card_set_name'],
  card_number: ['card_number', 'collector_number', 'number'],
  collector_number: ['collector_number', 'card_number', 'number'],
  language: ['language', 'card_language'],
  condition: ['condition', 'card_condition'],
  rarity: ['rarity'],
  variant: ['variant', 'finish'],
  finish: ['finish', 'variant'],
  image_url: ['image_url', 'card_image_url', 'thumbnail_url'],
  purchase_price: ['purchase_price', 'unit_price', 'price_amount', 'price'],
  price_amount: ['price_amount', 'unit_price', 'purchase_price', 'price'],
  currency: ['currency', 'price_currency'],
  price_currency: ['price_currency', 'currency'],
}

function sourceValue(item: GenericRow, target: string) {
  if (item[target] !== undefined && item[target] !== null) return item[target]
  for (const candidate of aliases[target] ?? []) {
    if (item[candidate] !== undefined && item[candidate] !== null) return item[candidate]
  }
  return undefined
}

function shipmentTag(externalShipmentId: string) {
  return `Internationale Sendung ${externalShipmentId}`
}

function appendNote(current: unknown, tag: string) {
  const existing = text(current)
  if (!existing) return tag
  if (existing.toLowerCase().includes(tag.toLowerCase())) return existing
  return `${existing}\n${tag}`
}

function appendTagValue(current: unknown, externalShipmentId: string) {
  if (Array.isArray(current)) {
    const values = current.map((value) => text(value)).filter(Boolean)
    return values.includes(externalShipmentId) ? values : [...values, externalShipmentId]
  }
  const existing = text(current)
  if (!existing) return externalShipmentId
  if (existing.includes(externalShipmentId)) return existing
  return `${existing}, ${externalShipmentId}`
}

function mergeMetadata(
  current: unknown,
  source: Candidate,
  shipmentId: string,
  externalShipmentId: string,
) {
  const base = objectRow(current) ?? {}
  return {
    ...base,
    cardcargo_shipment_source: {
      shipment_id: shipmentId,
      external_shipment_id: externalShipmentId,
      purchase_item_id: text(source.item.id),
      source_type: source.sourceType,
      source_parent_id: source.sourceParentId,
      source_storage_number: source.storageNumber,
      imported_at: new Date().toISOString(),
    },
  }
}

function buildInventoryPayload(
  candidate: Candidate,
  columns: Set<string>,
  sample: GenericRow | null,
  userId: string,
  shipmentId: string,
  externalShipmentId: string,
) {
  const payload: GenericRow = {}
  const tag = shipmentTag(externalShipmentId)

  for (const column of columns) {
    if (ignoredColumns.has(column)) continue
    const value = sourceValue(candidate.item, column)
    if (value !== undefined) payload[column] = value
  }

  if (columns.has('user_id')) payload.user_id = userId
  if (columns.has('purchase_item_id')) payload.purchase_item_id = text(candidate.item.id)

  if (columns.has('quantity')) payload.quantity = itemQuantity(candidate.item)

  for (const noteColumn of ['note', 'notes', 'comment', 'comments', 'memo']) {
    if (columns.has(noteColumn)) {
      payload[noteColumn] = appendNote(payload[noteColumn], tag)
      break
    }
  }

  for (const tagColumn of ['tags', 'labels']) {
    if (columns.has(tagColumn)) {
      payload[tagColumn] = appendTagValue(payload[tagColumn], externalShipmentId)
      break
    }
  }

  for (const metadataColumn of ['raw_metadata', 'metadata']) {
    if (columns.has(metadataColumn)) {
      payload[metadataColumn] = mergeMetadata(
        payload[metadataColumn],
        candidate,
        shipmentId,
        externalShipmentId,
      )
      break
    }
  }

  for (const defaultColumn of ['status', 'inventory_status', 'location', 'storage_location']) {
    if (
      columns.has(defaultColumn) &&
      (payload[defaultColumn] === undefined || payload[defaultColumn] === null || payload[defaultColumn] === '') &&
      sample?.[defaultColumn] !== undefined &&
      sample?.[defaultColumn] !== null
    ) {
      payload[defaultColumn] = sample[defaultColumn]
    }
  }

  return payload
}

function deriveRequiredFallback(
  column: string,
  candidate: Candidate,
  sample: GenericRow | null,
) {
  const direct = sourceValue(candidate.item, column)
  if (direct !== undefined && direct !== null && direct !== '') return direct
  if (sample?.[column] !== undefined && sample[column] !== null && sample[column] !== '') {
    if (/status|condition|language|location|currency/i.test(column)) return sample[column]
  }
  if (/quantity|count/i.test(column)) return 1
  if (/created_at|updated_at|acquired_at|added_at|received_at/i.test(column)) {
    return new Date().toISOString()
  }
  return undefined
}

async function insertInventoryWithRepair(
  supabase: SupabaseClient,
  payloadInput: GenericRow,
  candidate: Candidate,
  sample: GenericRow | null,
) {
  const payload = { ...payloadInput }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await supabase
      .from('inventory_units' as never)
      .insert(payload as never)
      .select('*')
      .single()
    const typed = response as unknown as {
      data: unknown
      error: { message: string; code?: string } | null
    }

    if (!typed.error && typed.data) return objectRow(typed.data)

    const message = typed.error?.message || 'Inventory Unit konnte nicht gespeichert werden.'
    const missingColumn =
      message.match(/Could not find the '([^']+)' column/i)?.[1] ||
      message.match(/column ["']([^"']+)["'] .*does not exist/i)?.[1]
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      delete payload[missingColumn]
      continue
    }

    const notNullColumn = message.match(/null value in column ["']([^"']+)["'] violates not-null constraint/i)?.[1]
    if (notNullColumn && !Object.prototype.hasOwnProperty.call(payload, notNullColumn)) {
      const fallback = deriveRequiredFallback(notNullColumn, candidate, sample)
      if (fallback !== undefined) {
        payload[notNullColumn] = fallback
        continue
      }
    }

    throw new Error(message)
  }

  throw new Error('Inventory Unit konnte nach mehreren Schema-Anpassungen nicht gespeichert werden.')
}

async function attachShipmentMetadata(
  supabase: SupabaseClient,
  unit: GenericRow,
  candidate: Candidate,
  columns: Set<string>,
  shipmentId: string,
  externalShipmentId: string,
) {
  const unitId = text(unit.id)
  if (!unitId) return
  const update: GenericRow = {}
  const tag = shipmentTag(externalShipmentId)

  for (const noteColumn of ['note', 'notes', 'comment', 'comments', 'memo']) {
    if (columns.has(noteColumn) || Object.prototype.hasOwnProperty.call(unit, noteColumn)) {
      update[noteColumn] = appendNote(unit[noteColumn], tag)
      break
    }
  }

  for (const tagColumn of ['tags', 'labels']) {
    if (columns.has(tagColumn) || Object.prototype.hasOwnProperty.call(unit, tagColumn)) {
      update[tagColumn] = appendTagValue(unit[tagColumn], externalShipmentId)
      break
    }
  }

  for (const metadataColumn of ['raw_metadata', 'metadata']) {
    if (columns.has(metadataColumn) || Object.prototype.hasOwnProperty.call(unit, metadataColumn)) {
      update[metadataColumn] = mergeMetadata(
        unit[metadataColumn],
        candidate,
        shipmentId,
        externalShipmentId,
      )
      break
    }
  }

  if (Object.keys(update).length) {
    await supabase
      .from('inventory_units' as never)
      .update(update as never)
      .eq('id' as never, unitId as never)
  }
}

async function linkInventoryUnit(
  supabase: SupabaseClient,
  userId: string,
  unitId: string,
  candidate: Candidate,
  shipmentId: string,
  externalShipmentId: string,
) {
  const response = await supabase
    .from('inventory_shipment_sources' as never)
    .upsert(
      {
        user_id: userId,
        inventory_unit_id: unitId,
        shipment_id: shipmentId,
        external_shipment_id: externalShipmentId,
        purchase_item_id: text(candidate.item.id) || null,
        source_type: candidate.sourceType,
        source_parent_id: candidate.sourceParentId || null,
        source_storage_number: candidate.storageNumber,
        note: shipmentTag(externalShipmentId),
      } as never,
      { onConflict: 'user_id,inventory_unit_id,shipment_id' },
    )
  const typed = response as unknown as { error: { message: string } | null }
  if (typed.error) {
    throw new Error(
      'Sendungs-Tag konnte nicht gespeichert werden. Führe supabase/manual/v99_inventory_shipment_sources.sql aus. ' +
        typed.error.message,
    )
  }
}

async function prepare(request: Request) {
  const auth = await getApiUser()
  if (!auth.user) {
    return { errorResponse: NextResponse.json({ error: auth.error }, { status: auth.status }) }
  }

  const url = new URL(request.url)
  let shipmentRef = text(url.searchParams.get('shipmentRef'))
  if (!shipmentRef && request.method !== 'GET') {
    const body = (await request.json()) as Record<string, unknown>
    shipmentRef = text(body.shipmentRef)
  }
  if (!shipmentRef) {
    return { errorResponse: NextResponse.json({ error: 'shipmentRef fehlt.' }, { status: 400 }) }
  }

  const shipment = await resolveShipment(auth.supabase, auth.user.id, shipmentRef)
  const packages = await resolveShipmentPackages(
    auth.supabase,
    auth.user.id,
    shipment.shipmentId,
    shipment.externalShipmentId,
  )
  const manualPurchaseIds = await resolveManualShipmentPurchaseIds(
    auth.supabase,
    auth.user.id,
    shipment.shipmentId,
  )
  const candidates = await loadCandidates(auth.supabase, packages, manualPurchaseIds)
  const purchaseItemIds = candidates.map((entry) => text(entry.item.id)).filter(Boolean)
  const existing = await loadExistingInventory(auth.supabase, auth.user.id, purchaseItemIds)
  const existingByItem = new Map<string, GenericRow[]>()
  for (const unit of existing) {
    const itemId = text(unit.purchase_item_id)
    if (!itemId) continue
    const current = existingByItem.get(itemId) ?? []
    current.push(unit)
    existingByItem.set(itemId, current)
  }

  const probe = await probeInventory(auth.supabase, auth.user.id)
  const quantityColumn = probe.columns.has('quantity')

  const cards = candidates.reduce((sum, entry) => sum + itemQuantity(entry.item), 0)
  const existingCards = candidates.reduce((sum, entry) => {
    const current = existingByItem.get(text(entry.item.id)) ?? []
    if (!current.length) return sum
    if (quantityColumn) {
      return sum + current.reduce((inner, unit) => inner + quantity(unit.quantity), 0)
    }
    return sum + Math.min(current.length, itemQuantity(entry.item))
  }, 0)

  return {
    auth,
    userId: auth.user.id,
    shipment,
    packages,
    candidates,
    existingByItem,
    probe,
    quantityColumn,
    cards,
    existingCards,
  }
}

export async function GET(request: Request) {
  try {
    const data = await prepare(request)
    if ('errorResponse' in data) return data.errorResponse

    const bunjangItems = data.candidates.filter((entry) => entry.sourceType === 'bunjang_purchase')
    const packageItems = data.candidates.filter((entry) => entry.sourceType === 'olaeet_package')

    return NextResponse.json({
      shipmentId: data.shipment.shipmentId,
      externalShipmentId: data.shipment.externalShipmentId,
      packageCount: data.packages.length,
      purchaseItemCount: data.candidates.length,
      cardCount: data.cards,
      existingCardCount: data.existingCards,
      newCardCount: Math.max(0, data.cards - data.existingCards),
      bunjangItemCount: bunjangItems.length,
      packageItemCount: packageItems.length,
      preview: data.candidates.slice(0, 12).map((entry) => ({
        id: text(entry.item.id),
        name: itemName(entry.item),
        quantity: itemQuantity(entry.item),
        sourceType: entry.sourceType,
        storageNumber: entry.storageNumber,
        alreadyInInventory: (data.existingByItem.get(text(entry.item.id)) ?? []).length > 0,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Inventar-Kandidaten konnten nicht geladen werden.' },
      { status: 400 },
    )
  }
}

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  try {
    const data = await prepare(request)
    if ('errorResponse' in data) return data.errorResponse

    let created = 0
    let linkedExisting = 0
    let linkedTotal = 0
    const errors: string[] = []

    for (const candidate of data.candidates) {
      const itemId = text(candidate.item.id)
      const requiredQuantity = itemQuantity(candidate.item)
      const currentUnits = [...(data.existingByItem.get(itemId) ?? [])]

      const existingPhysicalCount = data.quantityColumn
        ? currentUnits.reduce((sum, unit) => sum + quantity(unit.quantity), 0)
        : currentUnits.length

      for (const unit of currentUnits) {
        try {
          await attachShipmentMetadata(
            data.auth.supabase,
            unit,
            candidate,
            data.probe.columns,
            data.shipment.shipmentId,
            data.shipment.externalShipmentId,
          )
          await linkInventoryUnit(
            data.auth.supabase,
            data.userId,
            text(unit.id),
            candidate,
            data.shipment.shipmentId,
            data.shipment.externalShipmentId,
          )
          linkedExisting += 1
          linkedTotal += 1
        } catch (error) {
          errors.push(`${itemName(candidate.item)}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      const rowsToCreate = data.quantityColumn
        ? existingPhysicalCount >= requiredQuantity ? 0 : currentUnits.length ? 0 : 1
        : Math.max(0, requiredQuantity - currentUnits.length)

      for (let index = 0; index < rowsToCreate; index += 1) {
        try {
          const payload = buildInventoryPayload(
            candidate,
            data.probe.columns,
            data.probe.sample,
            data.userId,
            data.shipment.shipmentId,
            data.shipment.externalShipmentId,
          )
          if (data.quantityColumn) payload.quantity = requiredQuantity
          else if (Object.prototype.hasOwnProperty.call(payload, 'quantity')) payload.quantity = 1

          const unit = await insertInventoryWithRepair(
            data.auth.supabase,
            payload,
            candidate,
            data.probe.sample,
          )
          if (!unit?.id) throw new Error('Neue Inventory Unit hat keine ID zurückgegeben.')

          await linkInventoryUnit(
            data.auth.supabase,
            data.userId,
            text(unit.id),
            candidate,
            data.shipment.shipmentId,
            data.shipment.externalShipmentId,
          )
          created += data.quantityColumn ? requiredQuantity : 1
          linkedTotal += 1
        } catch (error) {
          errors.push(`${itemName(candidate.item)}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }

    return NextResponse.json({
      shipmentId: data.shipment.shipmentId,
      externalShipmentId: data.shipment.externalShipmentId,
      created,
      linkedExisting,
      linkedTotal,
      candidateCards: data.cards,
      errors,
      inventoryUrl: `/inventory?shipment=${encodeURIComponent(data.shipment.externalShipmentId)}`,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Karten konnten nicht ins Inventar übernommen werden.' },
      { status: 400 },
    )
  }
}
