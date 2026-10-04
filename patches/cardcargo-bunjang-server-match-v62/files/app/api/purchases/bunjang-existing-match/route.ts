import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function isGenericTitle(value: string | null | undefined) {
  const normalized = normalize(value)
  return (
    !normalized ||
    normalized === normalize('예약상품') ||
    normalized.startsWith('bunjangbestellung')
  )
}

function numericParam(value: string | null) {
  if (!value?.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function GET(request: Request) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const externalId = url.searchParams.get('externalId')?.trim() || null
  const title = url.searchParams.get('title')?.trim() || ''
  const sellerName = url.searchParams.get('sellerName')?.trim() || ''
  const priceAmount = numericParam(url.searchParams.get('priceAmount'))

  if (!externalId && !title && !sellerName && priceAmount === null) {
    return NextResponse.json({ matches: [] })
  }

  const { data, error } = await auth.supabase
    .from('purchases')
    .select(
      'id, title, bunjang_order_id, source_listing_id, seller_name, price_amount, purchased_at, domestic_shipping_amount, domestic_carrier, domestic_tracking_number, status',
    )
    .eq('user_id', auth.user.id)
    .eq('source', 'bunjang')
    .not('bunjang_order_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const inputTitle = normalize(title)
  const inputSeller = normalize(sellerName)

  const matches = (data ?? [])
    .map((purchase) => {
      let score = 0
      const reasons: string[] = []

      if (
        externalId &&
        purchase.source_listing_id &&
        externalId === purchase.source_listing_id
      ) {
        score += 250
        reasons.push('gleiche Listing-ID')
      }

      const purchaseTitle = normalize(purchase.title)
      if (inputTitle && purchaseTitle) {
        if (inputTitle === purchaseTitle) {
          score += isGenericTitle(purchase.title) ? 15 : 65
          reasons.push('gleicher Titel')
        } else if (
          !isGenericTitle(title) &&
          !isGenericTitle(purchase.title) &&
          (inputTitle.includes(purchaseTitle) || purchaseTitle.includes(inputTitle))
        ) {
          score += 25
          reasons.push('ähnlicher Titel')
        }
      }

      const purchaseSeller = normalize(purchase.seller_name)
      if (inputSeller && purchaseSeller && inputSeller === purchaseSeller) {
        score += 40
        reasons.push('gleicher Verkäufer')
      }

      if (
        priceAmount !== null &&
        purchase.price_amount !== null &&
        Number(purchase.price_amount) === priceAmount
      ) {
        score += 35
        reasons.push('gleicher Preis')
      }

      const confidence =
        score >= 200
          ? 'exact'
          : score >= 100
            ? 'strong'
            : score >= 65
              ? 'possible'
              : 'weak'

      return {
        id: purchase.id,
        title: purchase.title,
        orderId: purchase.bunjang_order_id,
        sourceListingId: purchase.source_listing_id,
        sellerName: purchase.seller_name,
        priceAmount: purchase.price_amount,
        purchasedAt: purchase.purchased_at,
        domesticShippingAmount: purchase.domestic_shipping_amount,
        domesticCarrier: purchase.domestic_carrier,
        domesticTrackingNumber: purchase.domestic_tracking_number,
        status: purchase.status,
        score,
        confidence,
        reasons,
      }
    })
    .filter((match) => match.score >= 65)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  return NextResponse.json({ matches })
}
