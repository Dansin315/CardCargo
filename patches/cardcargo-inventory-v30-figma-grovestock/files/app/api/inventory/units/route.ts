import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function DELETE(request: Request) {
  const { supabase } = await requireUser()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Ungültige Anfrage.' },
      { status: 400 },
    )
  }

  const ids =
    body && typeof body === 'object' && Array.isArray((body as { ids?: unknown }).ids)
      ? [...new Set((body as { ids: unknown[] }).ids)]
          .filter((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id))
          .slice(0, 500)
      : []

  if (!ids.length) {
    return NextResponse.json(
      { error: 'Keine gültigen Inventareinträge ausgewählt.' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('inventory_units')
    .delete()
    .in('id', ids)
    .select('id')

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    )
  }

  return NextResponse.json({
    deleted: data?.length ?? 0,
  })
}
