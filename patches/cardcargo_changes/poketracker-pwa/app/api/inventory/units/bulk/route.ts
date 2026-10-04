import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { inventoryLanguageValues } from '@/lib/inventory-languages'

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
  if (value === null) return null
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized ? normalized.slice(0, max) : null
}

function dateOrNull(value: unknown) {
  if (value === null || value === '') return null
  const normalized = text(value, 10)
  if (!normalized) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : 'INVALID'
}

export async function PATCH(request: Request) {
  const { supabase } = await requireUser()

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Ungueltige Anfrage.' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids)]
        .filter((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id))
        .slice(0, 500)
    : []

  if (!ids.length) {
    return NextResponse.json({ error: 'Keine gueltigen Inventareintraege ausgewaehlt.' }, { status: 400 })
  }

  const changes =
    body.changes && typeof body.changes === 'object'
      ? (body.changes as Record<string, unknown>)
      : {}

  const update: Record<string, string | null> = {}

  if (Object.prototype.hasOwnProperty.call(changes, 'notes')) {
    update.notes = text(changes.notes, 4000)
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'purchasedAt')) {
    const purchasedAt = dateOrNull(changes.purchasedAt)
    if (purchasedAt === 'INVALID') {
      return NextResponse.json({ error: 'Das Kaufdatum ist ungueltig.' }, { status: 400 })
    }
    update.purchased_at = purchasedAt
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'arrivedAt')) {
    const arrivedAt = dateOrNull(changes.arrivedAt)
    if (arrivedAt === 'INVALID') {
      return NextResponse.json({ error: 'Das Ankunftsdatum ist ungueltig.' }, { status: 400 })
    }
    update.arrived_at = arrivedAt
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'language')) {
    const language = text(changes.language, 80)
    if (!language || !inventoryLanguageValues.has(language)) {
      return NextResponse.json({ error: 'Die Sprache ist ungueltig.' }, { status: 400 })
    }
    update.language = language
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'status')) {
    const status = text(changes.status, 40)
    if (!status || !INVENTORY_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Der Status ist ungueltig.' }, { status: 400 })
    }
    update.status = status
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Waehle mindestens ein Feld fuer die Massenbearbeitung aus.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('inventory_units')
    .update(update)
    .in('id', ids)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ updated: data?.length ?? 0 })
}
