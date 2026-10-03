export interface BunjangStructuredExtraction {
  title?: string | null
  sellerName?: string | null
  purchasedAt?: string | null
  orderedAt?: string | null
  productAmount?: number | null
  domesticShippingAmount?: number | null
  totalAmount?: number | null
  domesticCarrier?: string | null
  domesticTrackingNumber?: string | null
  transactionMethod?: string | null
}

export interface BunjangOrderSnapshot {
  orderId: string
  orderUrl: string
  text: string
  productUrls?: string[]
  imageUrls?: string[]
  extracted?: BunjangStructuredExtraction
  warning?: string | null
}

export interface BunjangOrderRecord {
  orderId: string
  orderUrl: string
  sourceListingId: string | null
  title: string | null
  sellerName: string | null
  purchasedAt: string | null
  productAmount: number | null
  domesticShippingAmount: number | null
  totalAmount: number | null
  domesticCarrier: string | null
  domesticTrackingNumber: string | null
  transactionMethod: string | null
  bunjangStatus: string | null
  productUrls: string[]
  imageUrls: string[]
  rawText: string
  warnings: string[]
}

export interface BunjangOrderParseResult {
  records: BunjangOrderRecord[]
  warnings: string[]
}

function clean(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .trim()
}

function lines(value: string) {
  return value
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
}

function won(value: string | undefined) {
  if (!value) return null
  const parsed = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function extractLabelAmount(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`${escaped}\\s*\\+?\\s*([\\d,.]+)\\s*원`))
  return won(match?.[1])
}

function dateIso(text: string, orderId: string) {
  const detailed = text.match(
    new RegExp(
      `주문번호\\s*${orderId}\\s*(\\d{2,4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일`,
    ),
  )
  if (detailed) {
    const year = detailed[1].length === 2 ? `20${detailed[1]}` : detailed[1]
    return `${year}-${detailed[2].padStart(2, '0')}-${detailed[3].padStart(2, '0')}`
  }

  const top = text.match(/(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})/)
  return top
    ? `${top[1]}-${top[2].padStart(2, '0')}-${top[3].padStart(2, '0')}`
    : null
}

function sourceListingId(urls: string[]) {
  for (const url of urls) {
    const match =
      url.match(/\/products?\/(\d{5,})/i) ||
      url.match(/[?&](?:product|product_id|item|item_id|goods|goods_id)=(\d{5,})/i)
    if (match?.[1]) return match[1]
  }
  return null
}

const STATUSES = [
  '거래 완료',
  '배송 완료',
  '배송 중',
  '거래 취소 완료',
  '취소 요청 보냄',
  '결제 완료',
  '배송 준비',
]

function titleFromText(text: string, orderId: string) {
  const all = lines(text)
  const orderIndex = all.findIndex((line) => line.includes(`주문번호 ${orderId}`))
  const start = orderIndex >= 0 ? orderIndex + 1 : 0
  const window = all.slice(start, start + 12)

  const priceIndex = window.findIndex((line) => /^[\d,.]+\s*원$/.test(line))
  if (priceIndex <= 0) return null

  for (let index = priceIndex - 1; index >= 0; index -= 1) {
    const candidate = window[index]
    if (!STATUSES.includes(candidate) && !/배송 조회|결제정보/.test(candidate)) {
      return candidate
    }
  }
  return null
}

function valueAfterLabel(all: string[], label: string) {
  const index = all.findIndex(
    (line) =>
      line === label ||
      line.startsWith(`${label} `) ||
      line.startsWith(`${label}:`) ||
      line.startsWith(`${label}：`),
  )

  if (index < 0) return null

  const sameLine = all[index]
    .slice(label.length)
    .trim()
    .replace(/^[:：]\s*/, '')

  if (sameLine) return sameLine
  return all[index + 1] ?? null
}

function looksLikeTrackingNumber(value: string | null | undefined) {
  if (!value) return false
  const compact = value.replace(/[\s-]/g, '')
  return /^[A-Z0-9]{8,32}$/i.test(compact) && /\d{6,}/.test(compact.replace(/\D/g, ''))
}

function trackingFromText(text: string) {
  const all = lines(text)

  for (let index = 0; index < all.length; index += 1) {
    const line = all[index]
    if (!line.startsWith('운송장')) continue

    const sameLine = line.match(/운송장\s+(.+?)\s+([A-Z0-9][A-Z0-9 -]{7,30})$/i)
    if (sameLine?.[2]) {
      return {
        carrier: sameLine[1].trim(),
        tracking: sameLine[2].replace(/[\s-]/g, ''),
      }
    }

    const inlineCarrier = line
      .slice('운송장'.length)
      .trim()
      .replace(/^[:：]\s*/, '')

    const carrier = inlineCarrier || all[index + 1] || null
    const trackingCandidate = inlineCarrier ? all[index + 1] : all[index + 2]

    if (looksLikeTrackingNumber(trackingCandidate)) {
      return {
        carrier,
        tracking: trackingCandidate.replace(/[\s-]/g, ''),
      }
    }

    for (let offset = 1; offset <= 4; offset += 1) {
      const candidate = all[index + offset]
      if (!looksLikeTrackingNumber(candidate)) continue

      return {
        carrier:
          offset > 1
            ? all[index + offset - 1]
            : inlineCarrier || null,
        tracking: candidate.replace(/[\s-]/g, ''),
      }
    }
  }

  return { carrier: null, tracking: null }
}

function labelledValue(text: string, label: string) {
  return valueAfterLabel(lines(text), label)
}

export function parseBunjangOrderSnapshot(
  snapshot: BunjangOrderSnapshot,
): BunjangOrderRecord {
  const text = clean(snapshot.text)
  const tracking = trackingFromText(text)
  const warnings: string[] = []

  if (snapshot.warning) warnings.push(snapshot.warning)
  if (!tracking.tracking) warnings.push('Keine Trackingnummer auf der Bestelldetailseite erkannt.')

  const bunjangStatus =
    STATUSES.find((status) => lines(text).slice(0, 15).includes(status)) ?? null

  const extracted = snapshot.extracted

  return {
    orderId: snapshot.orderId,
    orderUrl: snapshot.orderUrl,
    sourceListingId: sourceListingId(snapshot.productUrls ?? []),
    title: extracted?.title ?? titleFromText(text, snapshot.orderId),
    sellerName: extracted?.sellerName ?? labelledValue(text, '판매자'),
    purchasedAt: dateIso(text, snapshot.orderId),
    productAmount: extractLabelAmount(text, '상품금액'),
    domesticShippingAmount: extractLabelAmount(text, '배송비'),
    totalAmount: extractLabelAmount(text, '총 결제금액'),
    domesticCarrier: extracted?.domesticCarrier ?? tracking.carrier,
    domesticTrackingNumber: extracted?.domesticTrackingNumber ?? tracking.tracking,
    transactionMethod: extracted?.transactionMethod ?? labelledValue(text, '거래방법'),
    bunjangStatus,
    productUrls: [...new Set(snapshot.productUrls ?? [])].slice(0, 8),
    imageUrls: [...new Set(snapshot.imageUrls ?? [])].slice(0, 12),
    rawText: text.slice(0, 30_000),
    warnings,
  }
}

export function parseBunjangOrderImport(rawText: string): BunjangOrderParseResult {
  const trimmed = rawText.trim()
  if (!trimmed) return { records: [], warnings: [] }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    const snapshots =
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { orders?: unknown[] }).orders)
        ? (parsed as { orders: unknown[] }).orders
        : Array.isArray(parsed)
          ? parsed
          : []

    const records = snapshots
      .filter(
        (value): value is BunjangOrderSnapshot =>
          Boolean(
            value &&
              typeof value === 'object' &&
              typeof (value as BunjangOrderSnapshot).orderId === 'string' &&
              typeof (value as BunjangOrderSnapshot).orderUrl === 'string' &&
              typeof (value as BunjangOrderSnapshot).text === 'string',
          ),
      )
      .map(parseBunjangOrderSnapshot)

    const warnings: string[] = []
    if (!records.length) {
      warnings.push(
        'Keine Bunjang-Bestelldetails erkannt. Verwende den v54-Extractor auf der Bunjang-Kaufübersicht.',
      )
    }
    const withoutTracking = records.filter((record) => !record.domesticTrackingNumber).length
    if (withoutTracking) {
      warnings.push(`${withoutTracking} Bestellung(en) enthalten noch keine erkannte Trackingnummer.`)
    }

    return { records, warnings }
  } catch {
    return {
      records: [],
      warnings: ['Extractor-Daten sind kein gültiges v54-JSON.'],
    }
  }
}
