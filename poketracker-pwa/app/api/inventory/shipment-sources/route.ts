import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'

type GenericRow = Record<string, unknown>

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

export async function GET(request: Request) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const shipmentRef = text(url.searchParams.get('shipmentRef'))

  let query = auth.supabase
    .from('inventory_shipment_sources' as never)
    .select('inventory_unit_id, shipment_id, external_shipment_id, note, created_at')
    .eq('user_id' as never, auth.user.id as never)

  if (shipmentRef) {
    query = /^SHP-/i.test(shipmentRef)
      ? query.eq('external_shipment_id' as never, shipmentRef.toUpperCase() as never)
      : query.eq('shipment_id' as never, shipmentRef as never)
  }

  const response = await query.order('created_at' as never, { ascending: false } as never)
  const typed = response as unknown as {
    data: unknown
    error: { message: string } | null
  }

  if (typed.error) {
    return NextResponse.json(
      {
        error:
          'Sendungsfilter ist noch nicht installiert. Führe supabase/manual/v99_inventory_shipment_sources.sql aus. ' +
          typed.error.message,
      },
      { status: 400 },
    )
  }

  const sourceRows = rows(typed.data)
  const grouped = new Map<string, { externalShipmentId: string; shipmentId: string; count: number }>()

  for (const row of sourceRows) {
    const externalShipmentId = text(row.external_shipment_id)
    if (!externalShipmentId) continue
    const current = grouped.get(externalShipmentId) ?? {
      externalShipmentId,
      shipmentId: text(row.shipment_id),
      count: 0,
    }
    current.count += 1
    grouped.set(externalShipmentId, current)
  }

  return NextResponse.json({
    sources: sourceRows.map((row) => ({
      inventoryUnitId: text(row.inventory_unit_id),
      shipmentId: text(row.shipment_id),
      externalShipmentId: text(row.external_shipment_id),
      note: text(row.note),
    })),
    shipments: [...grouped.values()].sort((left, right) =>
      right.externalShipmentId.localeCompare(left.externalShipmentId),
    ),
  })
}
