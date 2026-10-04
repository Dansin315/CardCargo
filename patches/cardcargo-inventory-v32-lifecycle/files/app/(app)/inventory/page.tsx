import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { createSignedImageUrl } from '@/lib/storage'
import {
  InventoryWorkspace,
  type InventoryWorkspacePendingItem,
  type InventoryWorkspaceSourceImage,
  type InventoryWorkspaceUnit,
} from '@/components/inventory-workspace'

export const metadata: Metadata = { title: 'Inventar' }
export const dynamic = 'force-dynamic'

interface InventoryUnitDbRow {
  id: string
  purchase_item_id: string | null
  item_name: string
  pokemon_name_en: string | null
  pokemon_species: string[] | null
  set_name: string | null
  set_code: string | null
  card_number: string | null
  language: string | null
  rarity: string | null
  quantity: number
  condition: string | null
  grading_company: string | null
  grade: string | null
  storage_location: string | null
  allocated_total_cost: number | string | null
  cost_currency: string
  estimated_value: number | string | null
  estimated_value_currency: string
  status: string
  sale_price: number | string | null
  sale_currency: string | null
  sold_at: string | null
  purchased_at: string | null
  arrived_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface PurchaseRelation {
  id: string
  title: string
  status: string
  purchased_at: string | null
}

interface WarehousePackageRelation {
  id: string
  external_package_id: string | null
  domestic_tracking_number: string | null
}

interface PurchaseItemDbRow {
  id: string
  purchase_id: string | null
  warehouse_package_id: string | null
  item_name: string
  pokemon_name_en: string | null
  pokemon_species: string[] | null
  set_name: string | null
  set_code: string | null
  card_number: string | null
  language: string | null
  rarity: string | null
  quantity: number
  catalog_image_url: string | null
  catalog_snapshot: Record<string, unknown> | null
  purchases: PurchaseRelation | PurchaseRelation[] | null
  warehouse_packages: WarehousePackageRelation | WarehousePackageRelation[] | null
}

interface InventoryImageDbRow {
  id: string
  inventory_unit_id: string
  storage_path: string
  original_filename: string | null
  source_type: 'manual' | 'purchase' | 'warehouse_package'
  position: number
}

interface PackageLinkDbRow {
  purchase_id: string
  warehouse_package_id: string
}

interface PurchaseImageDbRow {
  id: string
  purchase_id: string
  storage_path: string
  original_filename: string | null
  category: string | null
  position: number
}

interface PackageImageDbRow {
  id: string
  warehouse_package_id: string
  storage_path: string
  original_filename: string | null
  position: number
}

interface ShipmentPackageDbRow {
  shipment_id: string
  warehouse_package_id: string
}

interface ShipmentDbRow {
  id: string
  status: string
  delivered_at: string | null
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function snapshotRarity(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const rarity = (snapshot as Record<string, unknown>).rarity
  return typeof rarity === 'string' && rarity.trim() ? rarity.trim() : null
}

function snapshotEnglishName(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const englishName = (snapshot as Record<string, unknown>).englishName
  return typeof englishName === 'string' && englishName.trim() ? englishName.trim() : null
}

function deriveSpecies(itemName: string, pokemonNameEn: string | null) {
  const source = (pokemonNameEn || (/\p{Script=Latin}/u.test(itemName) ? itemName : '')).trim()
  if (!source) return []

  const withoutPrefix = source
    .replace(/^(Shining|Radiant|Dark|Light|Birthday|Surfing|Flying)\s+/i, '')
    .replace(/^(Rocket's|Team Rocket's)\s+/i, '')
  const withoutSuffix = withoutPrefix.replace(
    /\s+(V-UNION|VMAX|VSTAR|BREAK|LV\.X|Prime|GX|EX|ex|V)$/i,
    '',
  )

  return [
    ...new Set(
      withoutSuffix
        .split(/\s*(?:&|,|\band\b)\s*/i)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ]
}

export default async function InventoryPage() {
  const { supabase, user } = await requireUser()

  const [unitResult, itemResult, inventoryImageResult] = await Promise.all([
    supabase
      .from('inventory_units')
      .select(
        'id, purchase_item_id, item_name, pokemon_name_en, pokemon_species, set_name, set_code, card_number, language, rarity, quantity, condition, grading_company, grade, storage_location, allocated_total_cost, cost_currency, estimated_value, estimated_value_currency, status, sale_price, sale_currency, sold_at, purchased_at, arrived_at, notes, created_at, updated_at',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('purchase_items')
      .select(
        'id, purchase_id, warehouse_package_id, item_name, pokemon_name_en, pokemon_species, set_name, set_code, card_number, language, rarity, quantity, catalog_image_url, catalog_snapshot, purchases(id, title, status, purchased_at), warehouse_packages(id, external_package_id, domestic_tracking_number)',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('inventory_unit_images')
      .select('id, inventory_unit_id, storage_path, original_filename, source_type, position')
      .order('position', { ascending: true }),
  ])

  const allUnits = (unitResult.data ?? []) as unknown as InventoryUnitDbRow[]
  const allItems = (itemResult.data ?? []) as unknown as PurchaseItemDbRow[]
  const inventoryImageRows = (inventoryImageResult.data ?? []) as unknown as InventoryImageDbRow[]

  const purchaseIds = [
    ...new Set(allItems.map((item) => item.purchase_id).filter(Boolean) as string[]),
  ]
  const directPackageIds = [
    ...new Set(allItems.map((item) => item.warehouse_package_id).filter(Boolean) as string[]),
  ]

  const packageLinkResult = purchaseIds.length
    ? await supabase
        .from('warehouse_package_purchases')
        .select('purchase_id, warehouse_package_id')
        .in('purchase_id', purchaseIds)
    : { data: [], error: null }

  const packageIdByPurchaseId = new Map<string, string>(
    ((packageLinkResult.data ?? []) as unknown as PackageLinkDbRow[]).map((link) => [
      link.purchase_id,
      link.warehouse_package_id,
    ] as const),
  )

  const packageIds = [
    ...new Set([
      ...directPackageIds,
      ...Array.from(packageIdByPurchaseId.values()),
    ]),
  ]

  const [purchaseImageResult, packageImageResult, shipmentPackageResult] = await Promise.all([
    purchaseIds.length
      ? supabase
          .from('purchase_images')
          .select('id, purchase_id, storage_path, original_filename, category, position')
          .in('purchase_id', purchaseIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    packageIds.length
      ? supabase
          .from('warehouse_package_images')
          .select('id, warehouse_package_id, storage_path, original_filename, position')
          .in('warehouse_package_id', packageIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    packageIds.length
      ? supabase
          .from('shipment_packages')
          .select('shipment_id, warehouse_package_id')
          .in('warehouse_package_id', packageIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const shipmentIds = [
    ...new Set(
      ((shipmentPackageResult.data ?? []) as unknown as ShipmentPackageDbRow[])
        .map((row) => row.shipment_id)
        .filter(Boolean),
    ),
  ]

  const shipmentResult = shipmentIds.length
    ? await supabase
        .from('shipments')
        .select('id, status, delivered_at')
        .in('id', shipmentIds)
    : { data: [], error: null }

  const shipmentById = new Map<string, ShipmentDbRow>(
    ((shipmentResult.data ?? []) as unknown as ShipmentDbRow[]).map((shipment) => [shipment.id, shipment] as const),
  )
  const deliveredAtByPackageId = new Map<string, string | null>()
  for (const relation of (shipmentPackageResult.data ?? []) as unknown as ShipmentPackageDbRow[]) {
    const shipment = shipmentById.get(relation.shipment_id)
    if (shipment?.status === 'delivered') {
      deliveredAtByPackageId.set(relation.warehouse_package_id, shipment.delivered_at || null)
    }
  }

  const inventoryImagesByUnit = new Map<string, InventoryWorkspaceUnit['images']>()
  await Promise.all(
    inventoryImageRows.map(async (image) => {
      const row = {
        id: image.id as string,
        signedUrl: await createSignedImageUrl(supabase, image.storage_path),
        originalFilename: (image.original_filename as string | null) ?? null,
        sourceType: image.source_type as 'manual' | 'purchase' | 'warehouse_package',
        position: Number(image.position || 1),
      }
      const current = inventoryImagesByUnit.get(image.inventory_unit_id) ?? []
      current.push(row)
      inventoryImagesByUnit.set(image.inventory_unit_id, current)
    }),
  )

  const purchaseImagesByPurchase = new Map<string, InventoryWorkspaceSourceImage[]>()
  await Promise.all(
    ((purchaseImageResult.data ?? []) as unknown as PurchaseImageDbRow[]).map(async (image) => {
      const current = purchaseImagesByPurchase.get(image.purchase_id) ?? []
      current.push({
        sourceType: 'purchase',
        sourceImageId: image.id,
        signedUrl: await createSignedImageUrl(supabase, image.storage_path),
        label: image.original_filename || image.category || 'Einkaufsbild',
      })
      purchaseImagesByPurchase.set(image.purchase_id, current)
    }),
  )

  const packageImagesByPackage = new Map<string, InventoryWorkspaceSourceImage[]>()
  await Promise.all(
    ((packageImageResult.data ?? []) as unknown as PackageImageDbRow[]).map(async (image) => {
      const current = packageImagesByPackage.get(image.warehouse_package_id) ?? []
      current.push({
        sourceType: 'warehouse_package',
        sourceImageId: image.id,
        signedUrl: await createSignedImageUrl(supabase, image.storage_path),
        label: image.original_filename || 'OLAEET-Paketbild',
      })
      packageImagesByPackage.set(image.warehouse_package_id, current)
    }),
  )

  const createdCounts = new Map<string, number>()
  for (const unit of allUnits) {
    if (!unit.purchase_item_id) continue
    createdCounts.set(
      unit.purchase_item_id,
      (createdCounts.get(unit.purchase_item_id) ?? 0) + Number(unit.quantity || 1),
    )
  }

  const itemMeta = new Map<
    string,
    {
      imageUrl: string | null
      rarity: string | null
      sourceLabel: string
      sourceHref: string | null
      pokemonSpecies: string[]
      purchasedAt: string | null
      arrivedAt: string | null
      sourceImages: InventoryWorkspaceSourceImage[]
    }
  >()

  const pendingItems: InventoryWorkspacePendingItem[] = allItems
    .map((item) => {
      const purchase = firstRelation(item.purchases)
      const warehousePackage = firstRelation(item.warehouse_packages)
      const remaining = Math.max(0, Number(item.quantity) - (createdCounts.get(item.id) ?? 0))
      const linkedPackageId = item.warehouse_package_id || (item.purchase_id ? packageIdByPurchaseId.get(item.purchase_id) : undefined) || null

      const sourceLabel = item.purchase_id
        ? purchase?.title || 'Bunjang-Einkauf'
        : warehousePackage?.external_package_id ||
          warehousePackage?.domestic_tracking_number ||
          'OLAEET-Bonuskarte'

      const sourceHref = item.purchase_id
        ? `/purchases/${item.purchase_id}/edit#purchase-items`
        : item.warehouse_package_id
          ? `/warehouse-packages/${item.warehouse_package_id}`
          : null

      const pokemonSpecies =
        Array.isArray(item.pokemon_species) && item.pokemon_species.length
          ? item.pokemon_species
          : deriveSpecies(
              item.item_name,
              snapshotEnglishName(item.catalog_snapshot) || item.pokemon_name_en || null,
            )

      const sourceImages = [
        ...(item.purchase_id ? purchaseImagesByPurchase.get(item.purchase_id) ?? [] : []),
        ...(linkedPackageId ? packageImagesByPackage.get(linkedPackageId) ?? [] : []),
      ]

      const meta = {
        imageUrl: item.catalog_image_url || null,
        rarity: item.rarity || snapshotRarity(item.catalog_snapshot),
        sourceLabel,
        sourceHref,
        pokemonSpecies,
        purchasedAt: purchase?.purchased_at || null,
        arrivedAt: linkedPackageId ? deliveredAtByPackageId.get(linkedPackageId) || null : null,
        sourceImages,
      }

      itemMeta.set(item.id, meta)

      return {
        id: item.id,
        itemName: item.item_name,
        pokemonNameEn: item.pokemon_name_en || null,
        pokemonSpecies,
        setName: item.set_name || null,
        setCode: item.set_code || null,
        cardNumber: item.card_number || null,
        language: item.language || null,
        rarity: meta.rarity,
        remaining,
        imageUrl: meta.imageUrl,
        sourceLabel,
        sourceHref,
        purchasedAt: meta.purchasedAt,
        arrivedAt: meta.arrivedAt,
      }
    })
    .filter((item) => item.remaining > 0)

  const units: InventoryWorkspaceUnit[] = allUnits.map((unit) => {
    const meta = unit.purchase_item_id ? itemMeta.get(unit.purchase_item_id) : null
    const images = inventoryImagesByUnit.get(unit.id) ?? []
    const pokemonSpecies =
      Array.isArray(unit.pokemon_species) && unit.pokemon_species.length
        ? unit.pokemon_species
        : meta?.pokemonSpecies ?? deriveSpecies(unit.item_name, unit.pokemon_name_en || null)

    return {
      id: unit.id,
      purchaseItemId: unit.purchase_item_id || null,
      itemName: unit.item_name,
      pokemonNameEn: unit.pokemon_name_en || null,
      pokemonSpecies,
      setName: unit.set_name || null,
      setCode: unit.set_code || null,
      cardNumber: unit.card_number || null,
      language: unit.language || null,
      rarity: unit.rarity || meta?.rarity || null,
      quantity: Number(unit.quantity || 1),
      condition: unit.condition || null,
      gradingCompany: unit.grading_company || null,
      grade: unit.grade || null,
      storageLocation: unit.storage_location || null,
      allocatedTotalCost:
        unit.allocated_total_cost === null ? null : Number(unit.allocated_total_cost),
      costCurrency: unit.cost_currency || 'EUR',
      estimatedValue: unit.estimated_value === null ? null : Number(unit.estimated_value),
      estimatedValueCurrency: unit.estimated_value_currency || 'EUR',
      status: unit.status,
      salePrice: unit.sale_price === null ? null : Number(unit.sale_price),
      saleCurrency: unit.sale_currency || null,
      soldAt: unit.sold_at || null,
      purchasedAt: unit.purchased_at || meta?.purchasedAt || null,
      arrivedAt: unit.arrived_at || meta?.arrivedAt || null,
      notes: unit.notes || null,
      createdAt: unit.created_at,
      updatedAt: unit.updated_at,
      imageUrl: images[0]?.signedUrl || meta?.imageUrl || null,
      images,
      sourceImages: meta?.sourceImages ?? [],
      sourceLabel: meta?.sourceLabel ?? 'Manuell',
      sourceHref: meta?.sourceHref ?? null,
    }
  })

  return (
    <InventoryWorkspace
      userId={user.id}
      units={units}
      pendingItems={pendingItems}
      loadError={Boolean(
        unitResult.error ||
          itemResult.error ||
          inventoryImageResult.error ||
          packageLinkResult.error ||
          purchaseImageResult.error ||
          packageImageResult.error ||
          shipmentPackageResult.error ||
          shipmentResult.error
      )}
    />
  )
}
