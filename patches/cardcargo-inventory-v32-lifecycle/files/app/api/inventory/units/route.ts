import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export async function POST(request: Request) {
  const { supabase, user } = await requireUser()

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const itemName = text(body.itemName, 200)
  if (!itemName) {
    return NextResponse.json({ error: 'Kartenname ist erforderlich.' }, { status: 400 })
  }

  const allocatedTotalCost = numberOrNull(body.allocatedTotalCost)
  const estimatedValue = numberOrNull(body.estimatedValue)
  const purchasedAt = dateOrNull(body.purchasedAt)
  const arrivedAt = dateOrNull(body.arrivedAt)
  const costCurrency = currency(body.costCurrency, 'EUR')
  const estimatedValueCurrency = currency(body.estimatedValueCurrency, 'EUR')
  const status = text(body.status, 40) || 'in_collection'

  if (
    Number.isNaN(allocatedTotalCost) ||
    Number.isNaN(estimatedValue) ||
    purchasedAt === 'INVALID' ||
    arrivedAt === 'INVALID' ||
    !costCurrency ||
    !estimatedValueCurrency ||
    !INVENTORY_STATUSES.has(status)
  ) {
    return NextResponse.json({ error: 'Mindestens ein Inventarfeld ist ungültig.' }, { status: 400 })
  }

  const row = {
    user_id: user.id,
    purchase_item_id: null,
    item_name: itemName,
    pokemon_name_en: text(body.pokemonNameEn, 200),
    pokemon_species: species(body.pokemonSpecies),
    set_name: text(body.setName, 200),
    set_code: text(body.setCode, 80),
    card_number: text(body.cardNumber, 80),
    language: text(body.language, 80),
    rarity: text(body.rarity, 120),
    quantity: 1,
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
    arrived_at: arrivedAt || (status === 'in_collection' ? new Date().toISOString().slice(0, 10) : null),
    notes: text(body.notes, 4000),
  }

  const { data, error } = await supabase
    .from('inventory_units')
    .insert(row)
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Inventareintrag konnte nicht angelegt werden.' }, { status: 400 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { supabase } = await requireUser()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const ids =
    body && typeof body === 'object' && Array.isArray((body as { ids?: unknown }).ids)
      ? [...new Set((body as { ids: unknown[] }).ids)]
          .filter((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id))
          .slice(0, 500)
      : []

  if (!ids.length) {
    return NextResponse.json({ error: 'Keine gültigen Inventareinträge ausgewählt.' }, { status: 400 })
  }

  const { data: imageRows, error: imageReadError } = await supabase
    .from('inventory_unit_images')
    .select('storage_path')
    .in('inventory_unit_id', ids)

  if (imageReadError) {
    return NextResponse.json({ error: imageReadError.message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('inventory_units')
    .delete()
    .in('id', ids)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const storagePaths = (imageRows ?? []).map((row) => row.storage_path).filter(Boolean)
  if (storagePaths.length) {
    const admin = createAdminClient()
    await admin.storage.from('listing-images').remove(storagePaths)
  }

  return NextResponse.json({ deleted: data?.length ?? 0 })
}
