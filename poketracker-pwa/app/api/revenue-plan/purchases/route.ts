import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'

type GenericRow = Record<string, unknown>

type PlanItem = {
  id: string
  name: string
  subtitle: string
  setNumber: string | null
  cardNumber: string | null
  quantity: number
}

function rows(value: unknown): GenericRow[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is GenericRow =>
          Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
      )
    : []
}

function objectRow(value: unknown): GenericRow | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GenericRow)
    : null
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function positiveInt(value: unknown) {
  const parsed = Math.floor(numberOrNull(value) ?? 1)
  return parsed > 0 ? parsed : 1
}

function cardName(item: GenericRow) {
  const catalog = objectRow(item.catalog_snapshot)
  for (const value of [
    item.item_name,
    item.card_name,
    item.name,
    item.title,
    item.pokemon_name,
    item.product_name,
    item.display_name,
    catalog?.englishName,
    catalog?.name,
  ]) {
    const normalized = text(value)
    if (normalized) return normalized
  }
  return 'Einzelkarte'
}

function cardMeta(item: GenericRow) {
  const catalog = objectRow(item.catalog_snapshot)
  const setNumber = text(
    item.set_number ||
      item.set_code ||
      item.set_id ||
      item.card_set_id ||
      catalog?.setNumber ||
      catalog?.set_number ||
      catalog?.setCode ||
      catalog?.set_code ||
      catalog?.setId ||
      catalog?.set_id,
  )
  const setName = text(
    item.set_name ||
      item.card_set_name ||
      catalog?.setName ||
      catalog?.set_name,
  )
  const cardNumber = text(
    item.card_number ||
      item.collector_number ||
      catalog?.cardNumber ||
      catalog?.number,
  )
  const language = text(item.language)
  return {
    setNumber: setNumber || null,
    cardNumber: cardNumber || null,
    subtitle: [
      cardNumber ? `Kartennr. ${cardNumber}` : '',
      setNumber ? `Set ${setNumber}` : '',
      setName,
      language,
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

function purchaseCostKrw(row: GenericRow) {
  const currency = text(row.price_currency || row.currency || 'KRW').toUpperCase() || 'KRW'
  if (currency !== 'KRW') return null
  return (
    (numberOrNull(row.price_amount) ?? 0) +
    (numberOrNull(row.domestic_shipping_amount) ?? 0) +
    (numberOrNull(row.service_fee_amount) ?? 0) +
    (numberOrNull(row.payment_fee_amount) ?? 0)
  )
}

function searchBlob(purchase: GenericRow, items: PlanItem[]) {
  return [
    purchase.id,
    purchase.bunjang_order_id,
    purchase.title,
    purchase.seller_name,
    purchase.domestic_tracking_number,
    purchase.source_listing_id,
    purchase.listing_url,
    purchase.canonical_url,
    purchase.raw_metadata ? JSON.stringify(purchase.raw_metadata) : '',
    ...items.flatMap((item) => [item.name, item.subtitle, item.cardNumber, item.setNumber]),
  ]
    .map(text)
    .join(' ')
    .toLocaleLowerCase('de')
}

export async function GET(request: Request) {
  try {
    const auth = await getApiUser()
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const url = new URL(request.url)
    const q = text(url.searchParams.get('q')).toLocaleLowerCase('de')
    const from = text(url.searchParams.get('from'))
    const to = text(url.searchParams.get('to'))

    let query = auth.supabase
      .from('purchases')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('purchased_at', { ascending: false })
      .limit(1000)

    if (from) query = query.gte('purchased_at', `${from}T00:00:00`)
    if (to) {
      const end = new Date(`${to}T00:00:00Z`)
      if (!Number.isNaN(end.getTime())) {
        end.setUTCDate(end.getUTCDate() + 1)
        query = query.lt('purchased_at', end.toISOString())
      }
    }

    const purchaseResponse = await query
    if (purchaseResponse.error) throw new Error(purchaseResponse.error.message)
    const purchases = rows(purchaseResponse.data)
    const purchaseIds = purchases.map((row) => text(row.id)).filter(Boolean)

    const itemsByPurchase = new Map<string, PlanItem[]>()
    for (let index = 0; index < purchaseIds.length; index += 150) {
      const chunk = purchaseIds.slice(index, index + 150)
      const itemResponse = await auth.supabase
        .from('purchase_items')
        .select('*')
        .in('purchase_id', chunk)

      if (itemResponse.error) continue
      for (const item of rows(itemResponse.data)) {
        const purchaseId = text(item.purchase_id)
        const id = text(item.id)
        if (!purchaseId || !id) continue
        const meta = cardMeta(item)
        const mapped: PlanItem = {
          id,
          name: cardName(item),
          subtitle: meta.subtitle,
          setNumber: meta.setNumber,
          cardNumber: meta.cardNumber,
          quantity: positiveInt(item.quantity),
        }
        const current = itemsByPurchase.get(purchaseId) ?? []
        current.push(mapped)
        itemsByPurchase.set(purchaseId, current)
      }
    }

    const candidates = purchases
      .map((purchase) => {
        const id = text(purchase.id)
        const items = itemsByPurchase.get(id) ?? []
        return {
          id,
          orderId: text(purchase.bunjang_order_id) || null,
          title: text(purchase.title) || 'Bunjang-Einkauf',
          sellerName: text(purchase.seller_name) || null,
          purchasedAt: text(purchase.purchased_at || purchase.purchase_date || purchase.created_at) || null,
          purchaseCostKrw: purchaseCostKrw(purchase),
          domesticTrackingNumber: text(purchase.domestic_tracking_number) || null,
          items,
          searchBlob: searchBlob(purchase, items),
        }
      })
      .filter((purchase) => purchase.id && (!q || purchase.searchBlob.includes(q)))
      .map(({ searchBlob: _searchBlob, ...purchase }) => purchase)

    return NextResponse.json({ candidates, filters: { q, from, to } })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Bunjang-Einkäufe konnten nicht geladen werden.',
      },
      { status: 400 },
    )
  }
}
