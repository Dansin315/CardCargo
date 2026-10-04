import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'

const INVENTORY_STATUSES = new Set([
  'expected',
  'in_warehouse',
  'in_transit',
  'in_collection',
  'listed_for_sale',
  'sold',
  'lost',
  'returned',
])

function text(value: unknown, max = 500) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized ? normalized.slice(0, max) : null
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN
}

function dateOrNull(value: unknown) {
  const normalized = text(value, 10)
  if (!normalized) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : 'INVALID'
}

function currency(value: unknown, fallback = 'EUR') {
  const normalized = text(value, 3)?.toUpperCase() || fallback
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null
}

function species(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((entry) => text(entry, 100)).filter(Boolean) as string[])].slice(0, 8)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { supabase } = await requireUser()

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const itemName = text(body.itemName, 200)
  const allocatedTotalCost = numberOrNull(body.allocatedTotalCost)
  const estimatedValue = numberOrNull(body.estimatedValue)
  const salePrice = numberOrNull(body.salePrice)
  const purchasedAt = dateOrNull(body.purchasedAt)
  const arrivedAt = dateOrNull(body.arrivedAt)
  const costCurrency = currency(body.costCurrency, 'EUR')
  const estimatedValueCurrency = currency(body.estimatedValueCurrency, 'EUR')
  const saleCurrency = body.saleCurrency ? currency(body.saleCurrency, 'EUR') : null
  const status = text(body.status, 40) || 'in_collection'

  if (
    !itemName ||
    Number.isNaN(allocatedTotalCost) ||
    Number.isNaN(estimatedValue) ||
    Number.isNaN(salePrice) ||
    purchasedAt === 'INVALID' ||
    arrivedAt === 'INVALID' ||
    !costCurrency ||
    !estimatedValueCurrency ||
    !INVENTORY_STATUSES.has(status)
  ) {
    return NextResponse.json({ error: 'Mindestens ein Inventarfeld ist ungültig.' }, { status: 400 })
  }

  const updateQuery = supabase
    .from('inventory_units')
    .update({
      item_name: itemName,
      pokemon_name_en: text(body.pokemonNameEn, 200),
      pokemon_species: species(body.pokemonSpecies),
      set_name: text(body.setName, 200),
      set_code: text(body.setCode, 80),
      card_number: text(body.cardNumber, 80),
      language: text(body.language, 80),
      rarity: text(body.rarity, 120),
      condition: text(body.condition, 120),
      grading_company: text(body.gradingCompany, 80),
      grade: text(body.grade, 80),
      storage_location: text(body.storageLocation, 200),
      allocated_total_cost: allocatedTotalCost,
      cost_currency: costCurrency,
      estimated_value: estimatedValue,
      estimated_value_currency: estimatedValueCurrency,
      status,
      purchased_at: purchasedAt,
      arrived_at: arrivedAt,
      notes: text(body.notes, 4000),
      sale_price: salePrice,
      sale_currency: salePrice === null ? null : saleCurrency,
      sold_at:
        status === 'sold'
          ? text(body.soldAt, 40) || new Date().toISOString()
          : null,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()

  const { data, error } = await updateQuery

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Inventareintrag wurde nicht gefunden.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
