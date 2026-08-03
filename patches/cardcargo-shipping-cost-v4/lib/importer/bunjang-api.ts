import type { ListingPreview } from '@/lib/types'
import { normalizeListingUrl, SafeFetchError } from '@/lib/importer/safe-fetch'
import { isBunjangProductImageUrl } from '@/lib/importer/render-bunjang'

const MAX_API_BYTES = 5_000_000
const MAX_PREVIEW_IMAGES = 12

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function cleanText(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : ''
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value !== 'string') return null
  if (!/[0-9]/.test(value)) return null
  const normalized = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function booleanFromUnknown(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'y', 'yes', 'free', '무료', '무료배송'].includes(normalized)) return true
  if (['false', '0', 'n', 'no'].includes(normalized)) return false
  return null
}

function shippingAmountFromValue(value: unknown): number | null {
  const direct = numberFromUnknown(value)
  if (direct !== null) return direct
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  for (const key of [
    'freeShipping',
    'free_shipping',
    'isFreeShipping',
    'is_free_shipping',
    'shippingFeeFree',
    'shipping_fee_free',
  ]) {
    if (booleanFromUnknown(record[key]) === true) return 0
  }

  const amountKeys = [
    'fee',
    'amount',
    'price',
    'cost',
    'baseFee',
    'base_fee',
    'shippingFee',
    'shipping_fee',
    'shippingCost',
    'shipping_cost',
    'deliveryFee',
    'delivery_fee',
    'deliveryCost',
    'delivery_cost',
  ]

  for (const key of amountKeys) {
    if (!(key in record)) continue
    const parsed = shippingAmountFromValue(record[key])
    if (parsed !== null) return parsed
  }
  return null
}

function domesticShippingAmountFromPayload(
  root: Record<string, unknown>,
  data: Record<string, unknown>,
  product: Record<string, unknown>,
) {
  const freeShippingKeys = [
    'freeShipping',
    'free_shipping',
    'isFreeShipping',
    'is_free_shipping',
    'shippingFeeFree',
    'shipping_fee_free',
    'deliveryFeeFree',
    'delivery_fee_free',
  ]

  for (const record of [product, data, root]) {
    for (const key of freeShippingKeys) {
      if (booleanFromUnknown(record[key]) === true) return 0
    }
  }

  const shippingKeys = [
    'shippingFee',
    'shipping_fee',
    'shippingCost',
    'shipping_cost',
    'deliveryFee',
    'delivery_fee',
    'deliveryCost',
    'delivery_cost',
    'shipping',
    'delivery',
    'shippingInfo',
    'shipping_info',
    'deliveryInfo',
    'delivery_info',
    'shippingOption',
    'shipping_option',
    'deliveryOption',
    'delivery_option',
  ]

  for (const record of [product, data, root]) {
    for (const key of shippingKeys) {
      if (!(key in record)) continue
      const parsed = shippingAmountFromValue(record[key])
      if (parsed !== null) return parsed
    }
  }

  return null
}

function extractExternalId(urlString: string) {
  const url = new URL(urlString)
  const match = url.pathname.match(/\/products?\/(\d+)/i)
  return match?.[1] ?? null
}

function normalizeImageUrl(value: string, count: number) {
  return value
    .replace(/%7Bcnt%7D/gi, String(count))
    .replace(/%7Bres%7D/gi, '840')
    .replace(/\{cnt\}/gi, String(count))
    .replace(/\{res\}/gi, '840')
}

function addImage(target: string[], value: unknown, externalId: string) {
  if (typeof value !== 'string' || !value.trim()) return
  const normalized = normalizeImageUrl(value.trim(), 1)
  try {
    const url = new URL(normalized)
    if (!isBunjangProductImageUrl(url.toString(), externalId)) return
    const finalUrl = url.toString()
    if (!target.includes(finalUrl)) target.push(finalUrl)
  } catch {
    // Ignore malformed image values in the API response.
  }
}

function collectImageValues(
  value: unknown,
  target: string[],
  externalId: string,
  depth = 0,
  seen = new Set<object>(),
) {
  if (depth > 10 || target.length >= MAX_PREVIEW_IMAGES * 3 || value === null || value === undefined) return

  if (typeof value === 'string') {
    if (/^https:\/\//i.test(value) && /image|product|photo/i.test(value)) {
      addImage(target, value, externalId)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const child of value) collectImageValues(child, target, externalId, depth + 1, seen)
    return
  }

  if (typeof value !== 'object' || seen.has(value)) return
  seen.add(value)

  const record = value as Record<string, unknown>
  for (const [key, child] of Object.entries(record)) {
    if (/image|photo|picture/i.test(key)) {
      if (typeof child === 'string') addImage(target, child, externalId)
      else collectImageValues(child, target, externalId, depth + 1, seen)
    } else if (depth < 5) {
      collectImageValues(child, target, externalId, depth + 1, seen)
    }
  }
}

function imageUrlsFromProduct(product: Record<string, unknown>, payload: unknown, externalId: string) {
  const images: string[] = []
  const template = cleanText(product.imageUrl ?? product.image_url ?? product.imageUrlTemplate)
  const imageCount =
    numberFromUnknown(product.imageCount) ??
    numberFromUnknown(product.image_count) ??
    numberFromUnknown(product.photoCount) ??
    1

  if (template) {
    const count = Math.max(1, Math.min(Math.trunc(imageCount), MAX_PREVIEW_IMAGES))
    for (let index = 1; index <= count; index += 1) {
      const candidate = normalizeImageUrl(template, index)
      try {
        const url = new URL(candidate)
        if (isBunjangProductImageUrl(url.toString(), externalId) && !images.includes(url.toString())) {
          images.push(url.toString())
        }
      } catch {
        // Ignore malformed templates.
      }
    }
  }

  collectImageValues(product, images, externalId)
  collectImageValues(payload, images, externalId)
  return images.slice(0, MAX_PREVIEW_IMAGES)
}

export function listingPreviewFromBunjangApiPayload(
  payload: unknown,
  listingUrl: string,
  externalId: string,
): ListingPreview {
  const root = asRecord(payload)
  const data = asRecord(root.data)
  const product = asRecord(data.product)
  const shop = asRecord(data.shop)

  const title = cleanText(product.name ?? product.title)
  const description = cleanText(product.description ?? product.content)
  const sellerName = cleanText(shop.name ?? shop.nickname ?? product.sellerName)
  const priceAmount = numberFromUnknown(product.price ?? product.salePrice)
  const domesticShippingAmount = domesticShippingAmountFromPayload(root, data, product)
  const imageUrls = imageUrlsFromProduct(product, payload, externalId)

  if (!title && priceAmount === null && imageUrls.length === 0) {
    const message = cleanText(root.message ?? root.error)
    throw new SafeFetchError(
      message
        ? `Bunjang lieferte keine Produktdaten: ${message}`
        : 'Bunjang lieferte über die Produkt-Schnittstelle keine verwertbaren Daten.',
    )
  }

  const warnings: string[] = []
  if (!title) warnings.push('Der Produkttitel wurde von Bunjang nicht geliefert.')
  if (priceAmount === null) warnings.push('Der Preis wurde von Bunjang nicht geliefert.')
  if (domesticShippingAmount === null) {
    warnings.push('Die koreanischen Versandkosten wurden von Bunjang nicht eindeutig geliefert.')
  }
  if (!imageUrls.length) warnings.push('Bunjang lieferte keine eindeutig zuordenbaren Produktbilder.')

  return {
    source: 'bunjang',
    listingUrl,
    canonicalUrl: listingUrl,
    externalId,
    title: (title || 'Bunjang-Angebot').slice(0, 300),
    description: description.slice(0, 10_000),
    sellerName: sellerName.slice(0, 200),
    priceAmount,
    domesticShippingAmount,
    priceCurrency: 'KRW',
    imageUrls,
    warnings,
  }
}

export async function previewBunjangListingViaApi(inputUrl: string): Promise<ListingPreview> {
  const listingUrl = normalizeListingUrl(inputUrl)
  const externalId = extractExternalId(listingUrl)
  if (!externalId) {
    throw new SafeFetchError('Aus der Bunjang-URL konnte keine Produkt-ID gelesen werden.')
  }

  const endpoint = `https://api.bunjang.co.kr/api/pms/v3/products-detail/${encodeURIComponent(
    externalId,
  )}?viewerUid=-1`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new SafeFetchError('Zeitüberschreitung beim Abruf der Bunjang-Produktdaten.')
    }
    throw new SafeFetchError(
      `Bunjang-Produktdaten konnten nicht abgerufen werden: ${
        error instanceof Error ? error.message : 'unbekannter Fehler'
      }`,
    )
  } finally {
    clearTimeout(timeout)
  }

  console.info('[CardCargo] Bunjang API response', {
    externalId,
    status: response.status,
    contentType: response.headers.get('content-type'),
  })

  if (!response.ok) {
    throw new SafeFetchError(
      `Bunjangs Produkt-Schnittstelle antwortete mit HTTP ${response.status}.`,
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new SafeFetchError('Bunjangs Produkt-Schnittstelle lieferte kein gültiges JSON.')
  }

  const preview = listingPreviewFromBunjangApiPayload(payload, listingUrl, externalId)

  console.info('[CardCargo] Bunjang product extracted', {
    externalId,
    title: preview.title,
    priceAmount: preview.priceAmount,
    domesticShippingAmount: preview.domesticShippingAmount,
    sellerName: preview.sellerName,
    imageCount: preview.imageUrls.length,
  })

  return preview
}
