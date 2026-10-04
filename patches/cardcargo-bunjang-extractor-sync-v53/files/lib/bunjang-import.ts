export interface BunjangImportRecord {
  listingId: string
  listingUrl: string | null
  title: string | null
  sellerName: string | null
  purchasedAt: string | null
  priceAmount: number | null
  priceCurrency: string
  domesticCarrier: string | null
  domesticTrackingNumber: string | null
  imageUrls: string[]
  rawText: string
  warnings: string[]
}

export interface BunjangParseResult {
  records: BunjangImportRecord[]
  warnings: string[]
}

type SnapshotCandidate = {
  listingId?: string | null
  url?: string | null
  anchorText?: string | null
  contextText?: string | null
  imageUrls?: string[]
}

type Snapshot = {
  source?: string
  page?: { url?: string; title?: string; text?: string }
  candidates?: SnapshotCandidate[]
  records?: unknown[]
}

const CARRIERS = [
  'CJ대한통운', 'CJ Logistics', '대한통운', '우체국택배', 'Korea Post',
  '한진택배', 'Hanjin', '롯데택배', 'Lotte', '로젠택배', 'Logen',
  'CU Post', 'CUPOST', 'GS Postbox', 'GSPOSTBOX', '편의점택배',
]

function clean(value: unknown) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

export function extractBunjangListingId(value: unknown) {
  const text = String(value ?? '')
  const patterns = [
    /\/products?\/(\d{5,})/i,
    /[?&](?:product|product_id|item|item_id|goods|goods_id)=(\d{5,})/i,
    /(?:상품\s*(?:번호|ID)|listing\s*id|product\s*id|item\s*id|Bunjang\s*#?)\s*[:#：]?\s*(\d{5,})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

function parseTracking(text: string) {
  const patterns = [
    /(?:운송장(?:번호)?|송장(?:번호)?|배송번호|택배번호|tracking(?:\s*number)?|waybill(?:\s*number)?)\s*[:：#]?\s*([A-Z0-9][A-Z0-9 -]{6,30})/i,
    /(?:배송|택배|발송|tracking|courier)[\s\S]{0,80}?\b(\d[\d -]{7,18}\d)\b/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue
    const value = match[1].replace(/[\s-]+/g, '')
    if (/\d{8,}/.test(value.replace(/\D/g, ''))) return value
  }
  for (const carrier of CARRIERS) {
    const escaped = carrier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}\\s*[:：-]?\\s*([A-Z0-9][A-Z0-9 -]{6,30})`, 'i'))
    if (match?.[1]) {
      const value = match[1].replace(/[\s-]+/g, '')
      if (/\d{8,}/.test(value.replace(/\D/g, ''))) return value
    }
  }
  return null
}

function parseCarrier(text: string) {
  for (const carrier of CARRIERS) {
    if (text.toLocaleLowerCase().includes(carrier.toLocaleLowerCase())) return carrier
  }
  const match = text.match(/(?:택배사|배송사|배송업체|courier|carrier)\s*[:：]?\s*([^\n|·]{2,60})/i)
  return match?.[1] ? clean(match[1]) : null
}

function parseSeller(text: string) {
  const match = text.match(/(?:판매자|판매자명|상점명|상점|스토어|seller|shop)\s*[:：]?\s*([^\n|·]{1,100})/i)
  return match?.[1] ? clean(match[1]) : null
}

function parseDate(text: string) {
  const labelled = text.match(/(?:구매일|구매일자|결제일|결제일시|주문일|주문일시|purchase\s*date|order\s*date|purchased(?:\s*at)?)\s*[:：]?\s*(20\d{2}|\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/i)
  const generic = text.match(/\b(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/)
  const match = labelled || generic
  if (!match) return null
  const year = match[1].length === 2 ? `20${match[1]}` : match[1]
  return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function parsePrice(text: string) {
  const labelled = text.match(/(?:결제금액|상품금액|판매가|구매금액|price|amount)\s*[:：]?\s*(?:₩|KRW\s*)?([\d,]{2,})\s*(?:원|KRW)?/i)
  const won = text.match(/(?:₩\s*([\d,]{2,})|([\d,]{2,})\s*원)/)
  const raw = labelled?.[1] || won?.[1] || won?.[2]
  if (!raw) return null
  const value = Number(raw.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

function parseCandidate(candidate: SnapshotCandidate, page?: Snapshot['page']): BunjangImportRecord | null {
  const context = clean(candidate.contextText || page?.text || '')
  const listingUrl = clean(candidate.url || page?.url || '') || null
  const listingId = clean(candidate.listingId) || extractBunjangListingId(listingUrl) || extractBunjangListingId(context)
  if (!listingId) return null

  const anchor = clean(candidate.anchorText)
  const pageTitle = clean(page?.title).replace(/\s*[-|]\s*(번개장터|Bunjang).*$/i, '')
  const title = anchor && !/^(상세|상세보기|보기|구매|주문|배송조회|detail|view)$/i.test(anchor)
    ? anchor
    : pageTitle || null
  const tracking = parseTracking(context)

  return {
    listingId,
    listingUrl,
    title,
    sellerName: parseSeller(context),
    purchasedAt: parseDate(context),
    priceAmount: parsePrice(context),
    priceCurrency: 'KRW',
    domesticCarrier: parseCarrier(context),
    domesticTrackingNumber: tracking,
    imageUrls: [...new Set(candidate.imageUrls ?? [])].filter(Boolean).slice(0, 12),
    rawText: context.slice(0, 20000),
    warnings: tracking ? [] : ['Keine koreanische Trackingnummer erkannt.'],
  }
}

function directRecord(value: unknown): BunjangImportRecord | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const value = item[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number') return String(value)
    }
    return null
  }
  const listingUrl = text('listingUrl', 'listing_url', 'url')
  const listingId = text('listingId', 'listing_id', 'source_listing_id', 'productId', 'itemId') || extractBunjangListingId(listingUrl)
  if (!listingId) return null
  const price = item.priceAmount ?? item.price_amount ?? item.price
  const priceAmount = typeof price === 'number' ? price : typeof price === 'string' ? Number(price.replace(/[^\d]/g, '')) : null
  return {
    listingId,
    listingUrl,
    title: text('title', 'productName', 'itemName'),
    sellerName: text('sellerName', 'seller_name', 'seller', 'shopName'),
    purchasedAt: text('purchasedAt', 'purchased_at', 'orderDate', 'paidAt'),
    priceAmount: typeof priceAmount === 'number' && Number.isFinite(priceAmount) ? priceAmount : null,
    priceCurrency: text('priceCurrency', 'price_currency', 'currency') || 'KRW',
    domesticCarrier: text('domesticCarrier', 'domestic_carrier', 'carrier', 'courier'),
    domesticTrackingNumber: text('domesticTrackingNumber', 'domestic_tracking_number', 'trackingNumber', 'tracking_number', 'waybill'),
    imageUrls: Array.isArray(item.imageUrls) ? item.imageUrls.filter((v): v is string => typeof v === 'string').slice(0, 12) : [],
    rawText: JSON.stringify(item).slice(0, 20000),
    warnings: [],
  }
}

function merge(a: BunjangImportRecord | undefined, b: BunjangImportRecord) {
  if (!a) return b
  return {
    ...a,
    listingUrl: a.listingUrl || b.listingUrl,
    title: a.title || b.title,
    sellerName: a.sellerName || b.sellerName,
    purchasedAt: a.purchasedAt || b.purchasedAt,
    priceAmount: a.priceAmount ?? b.priceAmount,
    domesticCarrier: a.domesticCarrier || b.domesticCarrier,
    domesticTrackingNumber: a.domesticTrackingNumber || b.domesticTrackingNumber,
    imageUrls: [...new Set([...a.imageUrls, ...b.imageUrls])].slice(0, 12),
    rawText: [a.rawText, b.rawText].filter(Boolean).join('\n---\n').slice(0, 20000),
    warnings: [...new Set([...a.warnings, ...b.warnings])],
  }
}

export function parseBunjangImportText(rawText: string): BunjangParseResult {
  const trimmed = rawText.trim()
  if (!trimmed) return { records: [], warnings: [] }

  const map = new Map<string, BunjangImportRecord>()
  const warnings: string[] = []

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const record = directRecord(item)
        if (record) map.set(record.listingId, merge(map.get(record.listingId), record))
      }
    } else if (parsed && typeof parsed === 'object') {
      const snapshot = parsed as Snapshot
      for (const item of snapshot.records ?? []) {
        const record = directRecord(item)
        if (record) map.set(record.listingId, merge(map.get(record.listingId), record))
      }
      for (const candidate of snapshot.candidates ?? []) {
        const record = parseCandidate(candidate, snapshot.page)
        if (record) map.set(record.listingId, merge(map.get(record.listingId), record))
      }
      if (!map.size && snapshot.page) {
        const record = parseCandidate({
          listingId: extractBunjangListingId(snapshot.page.url),
          url: snapshot.page.url,
          anchorText: snapshot.page.title,
          contextText: snapshot.page.text,
        }, snapshot.page)
        if (record) map.set(record.listingId, record)
      }
    }
  } catch {
    const listingId = extractBunjangListingId(trimmed)
    if (listingId) {
      const record = parseCandidate({ listingId, contextText: trimmed })
      if (record) map.set(record.listingId, record)
    }
  }

  const records = [...map.values()]
  if (!records.length) warnings.push('Keine Bunjang-Listing-ID erkannt. Nutze den Extractor auf einer Bunjang-Kauf- oder Produktseite.')
  const withoutTracking = records.filter((record) => !record.domesticTrackingNumber).length
  if (withoutTracking) warnings.push(`${withoutTracking} erkannte Einkäufe besitzen noch keine Trackingnummer.`)
  return { records, warnings }
}
