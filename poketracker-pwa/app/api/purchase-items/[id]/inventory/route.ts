import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireUser()
  const { data, error } = await supabase.rpc('create_inventory_units_from_purchase_item', {
    p_purchase_item_id: id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ created: Number(data ?? 0) })
}
