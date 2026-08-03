import { chromium, type Response } from 'playwright'
import type { ListingPreview } from '@/lib/types'
import {
  isAllowedListingHostname,
  normalizeListingUrl,
  SafeFetchError,
} from '@/lib/importer/safe-fetch'

const MAX_PREVIEW_IMAGES = 12
const MAX_JSON_PAYLOADS = 80

const GENERIC_TITLES = new Set(['번개장터', 'bunjang', 'bungaejangter', 'bunjang-angebot'])

function cleanText(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').replace(/\s+/g, ' ').trim()
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

function extractExternalId(urlString: string) {
  const url = new URL(urlString)
  const match = url.pathname.match(/\/products?\/(\d+)/i)
  return match?.[1] ?? null
}

function firstValue(record: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(record)
  for (const wantedKey of keys) {
    const match = entries.find(([key]) => key.toLowerCase() === wantedKey.toLowerCase())
    if (match) return match[1]
  }
  return undefined
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  const value = firstValue(record, keys)
  if (typeof value === 'string') return cleanText(value)
  return ''
}

function shippingAmountFromRecord(record: Record<string, unknown> | undefined): number | null {
  if (!record) return null

  const freeFlag = firstValue(record, [
    'freeShipping',
    'free_shipping',
    'isFreeShipping',
    'is_free_shipping',
    'shippingFeeFree',
    'shipping_fee_free',
  ])
  if (freeFlag === true || freeFlag === 1 || freeFlag === '1' || freeFlag === 'true') return 0

  const value = firstValue(record, [
    'shippingFee',
    'shipping_fee',
    'shippingCost',
    'shipping_cost',
    'deliveryFee',
    'delivery_fee',
    'deliveryCost',
    'delivery_cost',
    'shippingInfo',
    'shipping_info',
    'deliveryInfo',
    'delivery_info',
    'shippingOption',
    'shipping_option',
  ])

  const direct = numberFromUnknown(value)
  if (direct !== null) return direct
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const nested = value as Record<string, unknown>
  return numberFromUnknown(
    firstValue(nested, [
      'fee',
      'amount',
      'price',
      'cost',
      'baseFee',
      'base_fee',
      'shippingFee',
      'deliveryFee',
    ]),
  )
}

function shippingAmountFromVisibleLines(lines: string[]) {
  const shippingIndex = lines.findIndex((line) => line === '배송비' || line.startsWith('배송비'))
  if (shippingIndex < 0) return null

  const candidates = lines.slice(shippingIndex, shippingIndex + 4)
  if (candidates.some((line) => /무료배송|배송비\s*무료/u.test(line))) return 0

  for (const line of candidates) {
    if (!/(?:\d{1,3}(?:,\d{3})+|\d+)\s*원/u.test(line)) continue
    const amount = numberFromUnknown(line)
    if (amount !== null) return amount
  }
  return null
}

function collectRecords(
  value: unknown,
  target: Record<string, unknown>[],
  depth = 0,
  seen = new Set<object>(),
) {
  if (depth > 12 || !value || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)

  if (Array.isArray(value)) {
    for (const child of value) collectRecords(child, target, depth + 1, seen)
    return
  }

  const record = value as Record<string, unknown>
  target.push(record)
  for (const child of Object.values(record)) {
    collectRecords(child, target, depth + 1, seen)
  }
}

function candidateScore(record: Record<string, unknown>, externalId: string) {
  const id = firstValue(record, ['pid', 'productId', 'product_id', 'itemId', 'item_id'])
  if (id === undefined || String(id) !== externalId) return -1

  let score = 100
  if (firstText(record, ['name', 'title', 'productName', 'product_name'])) score += 20
  if (numberFromUnknown(firstValue(record, ['price', 'salePrice', 'productPrice'])) !== null) score += 20
  if (firstText(record, ['description', 'content', 'productDescription'])) score += 10
  if (firstValue(record, ['imageUrls', 'images', 'imageUrl', 'imageUrlTemplate'])) score += 20
  return score
}

function findProductRecord(payloads: unknown[], externalId: string) {
  const records: Record<string, unknown>[] = []
  for (const payload of payloads) collectRecords(payload, records)

  return records
    .map((record) => ({ record, score: candidateScore(record, externalId) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.record
}

function addUrl(target: string[], value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return
    url.hash = ''
    const normalized = url.toString()
    if (normalized.length <= 2_000 && !target.includes(normalized)) target.push(normalized)
  } catch {
    // Ignore malformed URLs from page data.
  }
}

function collectImageUrls(value: unknown, target: string[], depth = 0) {
  if (depth > 8 || target.length >= 60) return
  if (typeof value === 'string') {
    addUrl(target, value)
    return
  }
  if (Array.isArray(value)) {
    for (const child of value) collectImageUrls(child, target, depth + 1)
    return
  }
  if (!value || typeof value !== 'object') return

  const record = value as Record<string, unknown>
  for (const [key, child] of Object.entries(record)) {
    if (/^(image|images|imageurl|image_url|imageurls|photos?|pictures?|productimages?)$/i.test(key)) {
      collectImageUrls(child, target, depth + 1)
    }
  }
}

export function isBunjangProductImageUrl(value: string, externalId: string | null) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false

    const hostname = url.hostname.toLowerCase()
    const pathname = url.pathname.toLowerCase()
    const isBunjangMedia = hostname === 'media.bunjang.co.kr' || hostname.endsWith('.bunjang.co.kr')
    if (!isBunjangMedia || !pathname.includes('/product/')) return false
    if (/(?:logo|icon|avatar|profile|banner|category)/i.test(pathname)) return false

    if (externalId) {
      const idPattern = new RegExp(`/product/${externalId}(?:_|/|\\.)`, 'i')
      if (!idPattern.test(url.pathname)) return false
    }

    return true
  } catch {
    return false
  }
}

function imagesFromProductRecord(record: Record<string, unknown> | undefined, externalId: string) {
  if (!record) return []
  const images: string[] = []
  collectImageUrls(record, images)

  const template = firstText(record, ['imageUrlTemplate', 'image_url_template'])
  const count = numberFromUnknown(firstValue(record, ['imageCount', 'image_count']))
  if (template && count !== null) {
    for (let index = 1; index <= Math.min(count, MAX_PREVIEW_IMAGES); index += 1) {
      addUrl(images, template.replace('{cnt}', String(index)))
    }
  }

  return images.filter((url) => isBunjangProductImageUrl(url, externalId)).slice(0, MAX_PREVIEW_IMAGES)
}

function sellerFromRecord(record: Record<string, unknown> | undefined) {
  if (!record) return ''
  const direct = firstText(record, ['sellerName', 'shopName', 'storeName', 'nickname'])
  if (direct) return direct

  const seller = firstValue(record, ['seller', 'shop', 'store', 'user'])
  if (seller && typeof seller === 'object' && !Array.isArray(seller)) {
    return firstText(seller as Record<string, unknown>, ['name', 'nickname', 'shopName', 'storeName'])
  }
  return ''
}

function usefulTitleCandidate(value: string) {
  const normalized = cleanText(value)
  if (!normalized || normalized.length > 300) return false
  if (GENERIC_TITLES.has(normalized.toLowerCase())) return false
  if (/^(?:판매하기|구매하기|신고하기|팔로우|카테고리|판매자센터|메루카리)$/u.test(normalized)) return false
  if (/^\d+(?:[.,]\d+)*$/u.test(normalized)) return false
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/u.test(normalized)) return false
  if (normalized.includes('여성의류') && normalized.includes('남성의류')) return false
  return true
}

function usefulSellerCandidate(value: string) {
  const normalized = cleanText(value)
  if (!normalized || normalized.length > 100) return false
  if (/^(?:팔로우|구매하기|신고하기|판매|완료|만족후기)$/u.test(normalized)) return false
  if (/^\d+(?:\s*[・%/]\s*\d+)*%?$/u.test(normalized)) return false
  if (/후기|거래내역|배송비|상품상태|브랜드/u.test(normalized)) return false
  return /[\p{L}\p{N}_-]/u.test(normalized)
}

export function extractProductFromVisibleText(text: string) {
  const lines = text
    .split(/\r?\n/u)
    .map(cleanText)
    .filter(Boolean)

  const pricePattern = /^(?:₩\s*)?(\d{1,3}(?:,\d{3})+|\d+)\s*원$/u
  const priceIndex = lines.findIndex((line) => pricePattern.test(line))
  const priceAmount = priceIndex >= 0 ? numberFromUnknown(lines[priceIndex]) : null

  let title = ''
  if (priceIndex > 0) {
    for (let index = priceIndex - 1; index >= Math.max(0, priceIndex - 12); index -= 1) {
      if (usefulTitleCandidate(lines[index])) {
        title = lines[index]
        break
      }
    }
  }

  let description = ''
  const stateIndex = lines.findIndex((line) => line.includes('상품상태'))
  const shippingIndex = lines.findIndex((line, index) => index > stateIndex && line === '배송비')
  if (stateIndex >= 0 && shippingIndex > stateIndex) {
    const candidates = lines.slice(stateIndex + 1, shippingIndex).filter((line) => {
      if (/^(?:판매|완료|예약중|판매중)$/u.test(line)) return false
      if (/^(?:새상품|사용감 없음|사용감 적음|사용감 많음|고장\/파손 상품)$/u.test(line)) return false
      return usefulTitleCandidate(line)
    })
    description = candidates.at(-1) ?? ''
  }

  const domesticShippingAmount = shippingAmountFromVisibleLines(lines)

  let sellerName = ''
  const followIndex = lines.findIndex((line) => line === '팔로우')
  if (followIndex > 0) {
    for (let index = followIndex - 1; index >= Math.max(0, followIndex - 12); index -= 1) {
      if (usefulSellerCandidate(lines[index])) {
        sellerName = lines[index]
        break
      }
    }
  }

  return { title, priceAmount, domesticShippingAmount, description, sellerName }
}

export function isGenericBunjangTitle(value: string) {
  return GENERIC_TITLES.has(cleanText(value).toLowerCase())
}

export async function previewRenderedBunjangListing(inputUrl: string): Promise<ListingPreview> {
  const listingUrl = normalizeListingUrl(inputUrl)
  const externalId = extractExternalId(listingUrl)
  if (!externalId) throw new SafeFetchError('Aus der Bunjang-URL konnte keine Produkt-ID gelesen werden.')

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      locale: 'ko-KR',
      viewport: { width: 1440, height: 1200 },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)

    const jsonPayloads: unknown[] = []
    const responseTasks: Promise<void>[] = []
    page.on('response', (response: Response) => {
      if (jsonPayloads.length >= MAX_JSON_PAYLOADS) return
      if (!['xhr', 'fetch'].includes(response.request().resourceType())) return
      const contentType = (response.headers()['content-type'] ?? '').toLowerCase()
      if (!contentType.includes('json')) return

      responseTasks.push(
        response
          .json()
          .then((payload: unknown) => {
            if (jsonPayloads.length < MAX_JSON_PAYLOADS) jsonPayloads.push(payload)
          })
          .catch(() => undefined),
      )
    })

    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 })

    const finalUrl = new URL(page.url())
    if (finalUrl.protocol !== 'https:' || !isAllowedListingHostname(finalUrl.hostname)) {
      throw new SafeFetchError('Bunjang leitete auf eine nicht erlaubte Zielseite weiter.')
    }

    await page
      .waitForFunction(() => /(?:\d{1,3}(?:,\d{3})+|\d+)\s*원/u.test(document.body?.innerText ?? ''), undefined, {
        timeout: 15_000,
      })
      .catch(() => undefined)
    await page.waitForTimeout(1_200)
    await Promise.allSettled(responseTasks)

    const snapshot: { text: string; imageUrls: string[]; shopLinkTexts: string[] } = await page.evaluate(() => {
      const imageUrls = Array.from(document.images).flatMap((image) => {
        const candidates = [
          image.currentSrc,
          image.src,
          image.getAttribute('data-src') ?? '',
          image.getAttribute('data-lazy-src') ?? '',
        ]
        return candidates.filter(Boolean)
      })
      const shopLinkTexts = Array.from(
        document.querySelectorAll('a[href*="/shop"], a[href*="/seller"], a[href*="/user"]'),
      )
        .map((element) => element.textContent?.trim() ?? '')
        .filter(Boolean)

      return {
        text: document.body?.innerText ?? '',
        imageUrls,
        shopLinkTexts,
      }
    })

    const productRecord = findProductRecord(jsonPayloads, externalId)
    const visible = extractProductFromVisibleText(snapshot.text)

    const recordTitle = productRecord
      ? firstText(productRecord, ['name', 'title', 'productName', 'product_name'])
      : ''
    const recordDescription = productRecord
      ? firstText(productRecord, ['description', 'content', 'productDescription'])
      : ''
    const recordPrice = productRecord
      ? numberFromUnknown(firstValue(productRecord, ['price', 'salePrice', 'productPrice']))
      : null
    const recordShippingAmount = shippingAmountFromRecord(productRecord)

    const recordImages = imagesFromProductRecord(productRecord, externalId)
    const domImages = snapshot.imageUrls.filter((url) => isBunjangProductImageUrl(url, externalId))
    const imageUrls = [...new Set([...recordImages, ...domImages])].slice(0, MAX_PREVIEW_IMAGES)

    const sellerFromLinks = snapshot.shopLinkTexts.find(usefulSellerCandidate) ?? ''
    const title = recordTitle || visible.title || 'Bunjang-Angebot'
    const description = recordDescription || visible.description
    const sellerName = sellerFromRecord(productRecord) || visible.sellerName || sellerFromLinks
    const priceAmount = recordPrice ?? visible.priceAmount
    const domesticShippingAmount = recordShippingAmount ?? visible.domesticShippingAmount

    const warnings: string[] = []
    if (!imageUrls.length) {
      warnings.push('Die gerenderte Bunjang-Seite lieferte keine eindeutig dem Produkt zuordenbaren Bilder.')
    }
    if (priceAmount === null) warnings.push('Der Preis konnte nicht sicher erkannt werden.')
    if (domesticShippingAmount === null) {
      warnings.push('Die koreanischen Versandkosten konnten nicht sicher erkannt werden.')
    }
    if (title === 'Bunjang-Angebot') warnings.push('Der Produkttitel konnte nicht sicher erkannt werden.')

    return {
      source: 'bunjang',
      listingUrl,
      canonicalUrl: normalizeListingUrl(finalUrl.toString()),
      externalId,
      title: title.slice(0, 300),
      description: description.slice(0, 10_000),
      sellerName: sellerName.slice(0, 200),
      priceAmount,
      domesticShippingAmount,
      priceCurrency: 'KRW',
      imageUrls,
      warnings,
    }
  } catch (error) {
    if (error instanceof SafeFetchError) throw error
    throw new SafeFetchError(
      `Die dynamische Bunjang-Seite konnte nicht vollständig gelesen werden: ${
        error instanceof Error ? error.message : 'unbekannter Fehler'
      }`,
    )
  } finally {
    await browser.close()
  }
}
