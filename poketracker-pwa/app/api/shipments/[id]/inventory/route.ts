import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { supabase } = await requireUser()

  const { data: shipment, error: shipmentError } = await supabase
    .from('shipments')
    .select('id, status')
    .eq('id', id)
    .single()

  if (shipmentError || !shipment) {
    return NextResponse.json(
      { error: 'Die internationale Sendung wurde nicht gefunden.' },
      { status: 404 },
    )
  }

  if (shipment.status !== 'delivered') {
    return NextResponse.json(
      {
        error:
          'Alle Karten können erst übernommen werden, wenn die internationale Sendung als „Zugestellt“ markiert ist.',
      },
      { status: 409 },
    )
  }

  const { data, error } = await supabase.rpc(
    'create_inventory_units_from_shipment',
    {
      p_shipment_id: id,
    },
  )

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    )
  }

  return NextResponse.json({
    created: Number(data ?? 0),
  })
}
