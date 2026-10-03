import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { normalizeDomesticTrackingNumber } from '@/lib/domestic-tracking'
import { createSignedImageUrl } from '@/lib/storage'
import { hasTrustedRequestOrigin } from '@/lib/request-security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => value || null)

const recordSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  orderUrl: z.string().url().max(2_000),
  sourceListingId: nullableText(200),
  title: nullableText(1_000),
  sellerName: nullableText(300),
  purchasedAt: nullableText(30),
  orderedAt: nullableText(100),
  productAmount: z.number().finite().min(0).nullable(),
  domesticShippingAmount: z.number().finite().min(0).nullable(),
  totalAmount: z.number().finite().min(0).nullable(),
  domesticCarrier: nullableText(120),
  domesticTrackingNumber: nullableText(200),
  transactionMethod: nullableText(200),
  bunjangStatus: nullableText(100),
  imageUrls: z.array(z.string().url()).max(12),
  rawText: z.string().max(30_000),
  warnings: z.array(z.string().max(500)).max(20),
})

const inputSchema = z.object({
  records: z.array(recordSchema).min(1).max(500),
})

type PurchaseCandidate = {
  id: string
  bunjang_order_id: string | null
  source_listing_id: string | null
  listing_url: string
  title: string
  seller_name: string | null
  price_amount: number | null
  price_currency: string
  domestic_shipping_amount: number | null
  purchased_at: string | null
  domestic_carrier: string | null
  domestic_tracking_number: string | null
  status: string
  purchase_images?: Array<{
    id: string
    storage_path: string
    position: number
    category: string | null
    kind: string
  }>
}

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function isGenericTitle(value: string | null | undefined) {
  const text = normalize(value)
  return (
    !text ||
    text === normalize('예약상품') ||
    text.startsWith('bunjangbestellung')
  )
}

function dateDistanceDays(left: string | null, right: string | null) {
  if (!left || !right) return Number.POSITIVE_INFINITY

  const a = new Date(`${left.slice(0, 10)}T00:00:00Z`).getTime()
  const b = new Date(`${right.slice(0, 10)}T00:00:00Z`).getTime()

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Number.POSITIVE_INFINITY
  }

  return Math.abs(a - b) / 86_400_000
}

function scoreCandidate(
  record: z.infer<typeof recordSchema>,
  purchase: PurchaseCandidate,
) {
  let score = 0
  let exactSignal = false
  const reasons: string[] = []

  if (
    purchase.bunjang_order_id &&
    purchase.bunjang_order_id !== record.orderId
  ) {
    return null
  }

  if (purchase.bunjang_order_id === record.orderId) {
    score += 1_000
    exactSignal = true
    reasons.push('bereits gleiche Bunjang-Order-ID')
  }

  if (
    record.sourceListingId &&
    purchase.source_listing_id &&
    record.sourceListingId === purchase.source_listing_id
  ) {
    score += 500
    exactSignal = true
    reasons.push('gleiche Listing-ID')
  }

  const orderTracking = normalizeDomesticTrackingNumber(
    record.domesticTrackingNumber,
  )
  const purchaseTracking = normalizeDomesticTrackingNumber(
    purchase.domestic_tracking_number,
  )

  if (
    orderTracking &&
    purchaseTracking &&
    orderTracking === purchaseTracking
  ) {
    score += 400
    exactSignal = true
    reasons.push('gleiche Trackingnummer')
  }

  const orderTitle = normalize(record.title)
  const purchaseTitle = normalize(purchase.title)

  if (orderTitle && purchaseTitle) {
    if (orderTitle === purchaseTitle) {
      score += isGenericTitle(record.title) ? 20 : 140
      reasons.push('gleicher Titel')
    } else if (
      !isGenericTitle(record.title) &&
      !isGenericTitle(purchase.title) &&
      (orderTitle.includes(purchaseTitle) ||
        purchaseTitle.includes(orderTitle))
    ) {
      score += 60
      reasons.push('ähnlicher Titel')
    }
  }

  const orderSeller = normalize(record.sellerName)
  const purchaseSeller = normalize(purchase.seller_name)

  if (
    orderSeller &&
    purchaseSeller &&
    orderSeller === purchaseSeller
  ) {
    score += 100
    reasons.push('gleicher Verkäufer')
  }

  if (
    record.productAmount !== null &&
    purchase.price_amount !== null
  ) {
    const left = Number(record.productAmount)
    const right = Number(purchase.price_amount)

    if (left === right) {
      score += 90
      reasons.push('gleicher Warenwert')
    } else {
      const denominator = Math.max(left, right, 1)
      const difference = Math.abs(left - right) / denominator

      if (difference <= 0.05) {
        score += 30
        reasons.push('Preis sehr ähnlich')
      }
    }
  }

  if (
    record.domesticShippingAmount !== null &&
    purchase.domestic_shipping_amount !== null &&
    Number(record.domesticShippingAmount) ===
      Number(purchase.domestic_shipping_amount)
  ) {
    score += 25
    reasons.push('gleiche Versandkosten')
  }

  const distance = dateDistanceDays(
    record.purchasedAt,
    purchase.purchased_at,
  )

  if (distance === 0) {
    score += 70
    reasons.push('gleiches Kaufdatum')
  } else if (distance <= 3) {
    score += 35
    reasons.push('Kaufdatum ±3 Tage')
  } else if (distance <= 14) {
    score += 10
    reasons.push('Kaufdatum zeitlich nah')
  }

  if (score < 60) return null

  const confidence =
    exactSignal
      ? 'exact'
      : score >= 260
        ? 'strong'
        : score >= 160
          ? 'likely'
          : 'possible'

  return {
    score,
    confidence,
    reasons,
    alreadyLinked:
      purchase.bunjang_order_id === record.orderId,
  }
}

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json(
      { error: 'Anfrage von fremder Origin blockiert.' },
      { status: 403 },
    )
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    )
  }

  try {
    const input = inputSchema.parse(await request.json())

    const { data, error } = await auth.supabase
      .from('purchases')
      .select(
        'id, bunjang_order_id, source_listing_id, listing_url, title, seller_name, price_amount, price_currency, domestic_shipping_amount, purchased_at, domestic_carrier, domestic_tracking_number, status, purchase_images(id, storage_path, position, category, kind)',
      )
      .eq('user_id', auth.user.id)
      .eq('source', 'bunjang')
      .order('purchased_at', { ascending: false, nullsFirst: false })

    if (error) throw new Error(error.message)

    const purchases = (data ?? []) as unknown as PurchaseCandidate[]

    const signedImageCache = new Map<
      string,
      Promise<string | null>
    >()

    async function signedUrl(storagePath: string) {
      let promise = signedImageCache.get(storagePath)

      if (!promise) {
        promise = createSignedImageUrl(
          auth.supabase,
          storagePath,
        )
        signedImageCache.set(storagePath, promise)
      }

      return promise
    }

    const suggestions = []

    for (const record of input.records) {
      const scored = purchases
        .map((purchase) => {
          const match = scoreCandidate(record, purchase)
          return match ? { purchase, ...match } : null
        })
        .filter(
          (
            value,
          ): value is {
            purchase: PurchaseCandidate
            score: number
            confidence: string
            reasons: string[]
            alreadyLinked: boolean
          } => Boolean(value),
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      const matches = []

      for (const entry of scored) {
        const images = await Promise.all(
          [...(entry.purchase.purchase_images ?? [])]
            .sort((a, b) => a.position - b.position)
            .slice(0, 4)
            .map(async (image) => ({
              id: image.id,
              url: await signedUrl(image.storage_path),
              category: image.category,
              kind: image.kind,
            })),
        )

        matches.push({
          purchase: {
            id: entry.purchase.id,
            title: entry.purchase.title,
            sellerName: entry.purchase.seller_name,
            priceAmount: entry.purchase.price_amount,
            priceCurrency: entry.purchase.price_currency,
            domesticShippingAmount:
              entry.purchase.domestic_shipping_amount,
            purchasedAt: entry.purchase.purchased_at,
            domesticCarrier: entry.purchase.domestic_carrier,
            domesticTrackingNumber:
              entry.purchase.domestic_tracking_number,
            status: entry.purchase.status,
            sourceListingId:
              entry.purchase.source_listing_id,
            listingUrl: entry.purchase.listing_url,
            bunjangOrderId:
              entry.purchase.bunjang_order_id,
            images: images.filter(
              (
                image,
              ): image is {
                id: string
                url: string
                category: string | null
                kind: string
              } => Boolean(image.url),
            ),
          },
          score: entry.score,
          confidence: entry.confidence,
          reasons: entry.reasons,
          alreadyLinked: entry.alreadyLinked,
        })
      }

      suggestions.push({
        orderId: record.orderId,
        matches,
      })
    }

    return NextResponse.json({ suggestions })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error:
            error.issues[0]?.message ||
            'Ungültige Bunjang-Bestelldaten.',
        },
        { status: 422 },
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Match-Vorschläge konnten nicht geladen werden.',
      },
      { status: 400 },
    )
  }
}
