import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const orderId = new URL(request.url).searchParams.get('orderId')?.trim()
  if (!orderId) {
    return NextResponse.json({ error: 'Bunjang-Bestellnummer fehlt.' }, { status: 422 })
  }

  const { data, error } = await auth.supabase
    .from('purchases')
    .select('id, title, bunjang_order_id, source_listing_id, listing_url')
    .eq('user_id', auth.user.id)
    .eq('source', 'bunjang')
    .eq('bunjang_order_id', orderId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ purchase: data ?? null })
}
