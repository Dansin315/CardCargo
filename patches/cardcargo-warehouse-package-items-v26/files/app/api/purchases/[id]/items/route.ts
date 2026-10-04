import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { purchaseItemPayloadSchema } from '@/lib/purchase-item-schema'
import type { PurchaseItemRow } from '@/lib/purchase-items'

const itemSelect = 'id, purchase_id, warehouse_package_id, item_name, franchise, set_name, set_code, pokemon_name_en, card_number, language, rarity, variant, quantity, grading_company, grade, seller_condition, allocated_unit_cost, notes, catalog_provider, catalog_card_id, catalog_language, catalog_match_type, catalog_image_url, catalog_snapshot, created_at, updated_at'

function sortItems(items: PurchaseItemRow[]) {
  return [...items].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  )
}

async function addInventoryCounts(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  items: PurchaseItemRow[],
) {
  const ids = items.map((item) => item.id)
  const { data: units, error } = ids.length
    ? await supabase
        .from('inventory_units')
        .select('purchase_item_id, quantity')
        .in('purchase_item_id', ids)
    : { data: [] as Array<{ purchase_item_id: string | null; quantity: number }>, error: null }

  if (error) throw new Error(error.message)

  const counts = new Map<string, number>()
  for (const unit of units ?? []) {
    if (!unit.purchase_item_id) continue
    counts.set(
      unit.purchase_item_id,
      (counts.get(unit.purchase_item_id) ?? 0) + Number(unit.quantity || 1),
    )
  }

  return items.map((item) => ({
    ...item,
    inventory_created_count: counts.get(item.id) ?? 0,
  }))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: purchaseId } = await params
  const { supabase } = await requireUser()

  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .select('id, title')
    .eq('id', purchaseId)
    .single()

  if (purchaseError || !purchase) {
    return NextResponse.json({ error: 'Einkauf nicht gefunden.' }, { status: 404 })
  }

  const { data: link, error: linkError } = await supabase
    .from('warehouse_package_purchases')
    .select('warehouse_package_id')
    .eq('purchase_id', purchaseId)
    .maybeSingle()

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 400 })
  }

  const ownItemsResult = await supabase
    .from('purchase_items')
    .select(itemSelect)
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: true })

  if (ownItemsResult.error) {
    return NextResponse.json({ error: ownItemsResult.error.message }, { status: 400 })
  }

  const ownItems = ((ownItemsResult.data ?? []) as unknown as PurchaseItemRow[]).map(
    (item) => ({
      ...item,
      source_scope: 'purchase' as const,
      source_purchase_id: purchaseId,
      source_purchase_title: purchase.title,
      source_package_id: link?.warehouse_package_id ?? null,
      source_package_label: null,
    }),
  )

  let packageItems: PurchaseItemRow[] = []
  let packageLabel: string | null = null

  if (link?.warehouse_package_id) {
    const [packageResult, packageItemsResult] = await Promise.all([
      supabase
        .from('warehouse_packages')
        .select('id, external_package_id, domestic_tracking_number')
        .eq('id', link.warehouse_package_id)
        .maybeSingle(),
      supabase
        .from('purchase_items')
        .select(itemSelect)
        .eq('warehouse_package_id', link.warehouse_package_id)
        .order('created_at', { ascending: true }),
    ])

    if (packageResult.error) {
      return NextResponse.json({ error: packageResult.error.message }, { status: 400 })
    }
    if (packageItemsResult.error) {
      return NextResponse.json({ error: packageItemsResult.error.message }, { status: 400 })
    }

    packageLabel =
      packageResult.data?.external_package_id ||
      packageResult.data?.domestic_tracking_number ||
      'OLAEET-Paket'

    packageItems = ((packageItemsResult.data ?? []) as unknown as PurchaseItemRow[]).map(
      (item) => ({
        ...item,
        source_scope: 'warehouse_package' as const,
        source_purchase_id: null,
        source_purchase_title: null,
        source_package_id: link.warehouse_package_id,
        source_package_label: packageLabel,
      }),
    )
  }

  try {
    const items = await addInventoryCounts(
      supabase,
      sortItems([...ownItems, ...packageItems]),
    )
    return NextResponse.json({ items })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Inventarstatus konnte nicht geladen werden.' },
      { status: 400 },
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: purchaseId } = await params
  const { user, supabase } = await requireUser()
  const parsed = purchaseItemPayloadSchema.safeParse(await request.json())

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Ungültige Einzelkartendaten.' },
      { status: 400 },
    )
  }

  const { data: purchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('id', purchaseId)
    .single()

  if (!purchase) {
    return NextResponse.json({ error: 'Einkauf nicht gefunden.' }, { status: 404 })
  }

  const input = parsed.data
  const { data, error } = await supabase
    .from('purchase_items')
    .insert({
      user_id: user.id,
      purchase_id: purchaseId,
      warehouse_package_id: null,
      item_name: input.itemName,
      franchise: 'Pokémon',
      set_name: input.setName,
      set_code: input.setCode,
      pokemon_name_en: input.pokemonNameEn,
      card_number: input.cardNumber,
      language: input.language,
      rarity: input.rarity,
      variant: input.variant,
      quantity: input.quantity,
      grading_company: input.gradingCompany,
      grade: input.grade,
      seller_condition: input.sellerCondition,
      allocated_unit_cost: input.allocatedUnitCost,
      notes: input.notes,
      catalog_provider: input.catalogProvider,
      catalog_card_id: input.catalogCardId,
      catalog_language: input.catalogLanguage,
      catalog_match_type: input.catalogMatchType,
      catalog_image_url: input.catalogImageUrl,
      catalog_snapshot: input.catalogSnapshot,
    })
    .select(itemSelect)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
