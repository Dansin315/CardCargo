import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { purchaseItemPayloadSchema } from '@/lib/purchase-item-schema'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireUser()
  const parsed = purchaseItemPayloadSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Ungültige Einzelkartendaten.' }, { status: 400 })
  }

  const { data: existingUnits } = await supabase
    .from('inventory_units')
    .select('quantity')
    .eq('purchase_item_id', id)
  const createdQuantity = (existingUnits ?? []).reduce(
    (sum, unit) => sum + Number(unit.quantity || 1),
    0,
  )
  if (createdQuantity > parsed.data.quantity) {
    return NextResponse.json(
      { error: `Die Menge kann nicht unter ${createdQuantity} bereits erzeugte Inventarexemplare reduziert werden.` },
      { status: 409 },
    )
  }

  const input = parsed.data
  const { data, error } = await supabase
    .from('purchase_items')
    .update({
      item_name: input.itemName,
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
    .eq('id', id)
    .select('id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Einzelkarte nicht gefunden.' }, { status: 400 })

  const { error: inventorySyncError } = await supabase
    .from('inventory_units')
    .update({
      item_name: input.itemName,
      set_name: input.setName,
      set_code: input.setCode,
      pokemon_name_en: input.pokemonNameEn,
      card_number: input.cardNumber,
      language: input.language,
    })
    .eq('purchase_item_id', id)

  if (inventorySyncError) {
    return NextResponse.json(
      { error: `Einzelkarte gespeichert, Inventarmetadaten konnten aber nicht synchronisiert werden: ${inventorySyncError.message}` },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireUser()
  const { count } = await supabase
    .from('inventory_units')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_item_id', id)
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Diese Position besitzt bereits Inventareinträge und kann deshalb nicht mehr gelöscht werden.' },
      { status: 409 },
    )
  }
  const { error } = await supabase.from('purchase_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
