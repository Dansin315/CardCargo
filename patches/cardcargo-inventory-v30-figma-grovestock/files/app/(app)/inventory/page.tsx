import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import {
  InventoryWorkspace,
  type InventoryWorkspacePendingItem,
  type InventoryWorkspaceUnit,
} from '@/components/inventory-workspace'

export const metadata: Metadata = { title: 'Inventar' }
export const dynamic = 'force-dynamic'

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function snapshotRarity(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const rarity = (snapshot as Record<string, unknown>).rarity
  return typeof rarity === 'string' && rarity.trim() ? rarity.trim() : null
}

export default async function InventoryPage() {
  const { supabase } = await requireUser()

  const [{ data: unitData, error: unitError }, { data: itemData, error: itemError }] =
    await Promise.all([
      supabase
        .from('inventory_units')
        .select(
          'id, purchase_item_id, item_name, pokemon_name_en, set_name, set_code, card_number, language, quantity, condition, grading_company, grade, storage_location, allocated_total_cost, cost_currency, status, sale_price, sale_currency, sold_at, notes, created_at, updated_at',
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('purchase_items')
        .select(
          'id, purchase_id, warehouse_package_id, item_name, pokemon_name_en, set_name, set_code, card_number, language, quantity, catalog_image_url, catalog_snapshot, purchases(id, title, status), warehouse_packages(id, external_package_id, domestic_tracking_number)',
        )
        .order('created_at', { ascending: false }),
    ])

  const allUnits = unitData ?? []
  const allItems = itemData ?? []

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
    }
  >()

  const pendingItems: InventoryWorkspacePendingItem[] = allItems
    .map((item) => {
      const purchase = firstRelation(item.purchases)
      const warehousePackage = firstRelation(item.warehouse_packages)
      const remaining = Math.max(
        0,
        Number(item.quantity) - (createdCounts.get(item.id) ?? 0),
      )

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

      const meta = {
        imageUrl: item.catalog_image_url || null,
        rarity: snapshotRarity(item.catalog_snapshot),
        sourceLabel,
        sourceHref,
      }

      itemMeta.set(item.id, meta)

      return {
        id: item.id,
        itemName: item.item_name,
        pokemonNameEn: item.pokemon_name_en || null,
        setName: item.set_name || null,
        setCode: item.set_code || null,
        cardNumber: item.card_number || null,
        language: item.language || null,
        remaining,
        imageUrl: meta.imageUrl,
        sourceLabel,
        sourceHref,
      }
    })
    .filter((item) => item.remaining > 0)

  const units: InventoryWorkspaceUnit[] = allUnits.map((unit) => {
    const meta = unit.purchase_item_id ? itemMeta.get(unit.purchase_item_id) : null

    return {
      id: unit.id,
      purchaseItemId: unit.purchase_item_id || null,
      itemName: unit.item_name,
      pokemonNameEn: unit.pokemon_name_en || null,
      setName: unit.set_name || null,
      setCode: unit.set_code || null,
      cardNumber: unit.card_number || null,
      language: unit.language || null,
      quantity: Number(unit.quantity || 1),
      condition: unit.condition || null,
      gradingCompany: unit.grading_company || null,
      grade: unit.grade || null,
      storageLocation: unit.storage_location || null,
      allocatedTotalCost:
        unit.allocated_total_cost === null
          ? null
          : Number(unit.allocated_total_cost),
      costCurrency: unit.cost_currency || 'EUR',
      status: unit.status,
      salePrice: unit.sale_price === null ? null : Number(unit.sale_price),
      saleCurrency: unit.sale_currency || null,
      soldAt: unit.sold_at || null,
      notes: unit.notes || null,
      createdAt: unit.created_at,
      updatedAt: unit.updated_at,
      imageUrl: meta?.imageUrl ?? null,
      rarity: meta?.rarity ?? null,
      sourceLabel: meta?.sourceLabel ?? 'Manueller Inventareintrag',
      sourceHref: meta?.sourceHref ?? null,
    }
  })

  return (
    <InventoryWorkspace
      units={units}
      pendingItems={pendingItems}
      loadError={Boolean(unitError || itemError)}
    />
  )
}
