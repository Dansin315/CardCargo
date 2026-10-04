import type { BunjangOrderRecord } from '@/lib/bunjang-order-import'

export const BUNJANG_ORDER_CACHE_KEY = 'cardcargo:bunjang-order-extractor:v54'

export interface BunjangListingMatchInput {
  externalId: string | null
  title: string
  sellerName: string
  priceAmount: number | null
}

export interface BunjangOrderMatch {
  record: BunjangOrderRecord
  score: number
  confidence: 'exact' | 'strong' | 'possible'
  reasons: string[]
}

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function isGenericTitle(value: string | null | undefined) {
  const title = normalize(value)
  return !title || title === normalize('예약상품') || title.startsWith('bunjangbestellung')
}

export function rankBunjangOrderMatches(
  listing: BunjangListingMatchInput,
  records: BunjangOrderRecord[],
): BunjangOrderMatch[] {
  const listingTitle = normalize(listing.title)
  const listingSeller = normalize(listing.sellerName)

  return records
    .map((record) => {
      let score = 0
      const reasons: string[] = []

      if (
        listing.externalId &&
        record.sourceListingId &&
        listing.externalId === record.sourceListingId
      ) {
        score += 200
        reasons.push('gleiche Listing-ID')
      }

      const orderTitle = normalize(record.title)
      if (listingTitle && orderTitle) {
        if (listingTitle === orderTitle) {
          score += isGenericTitle(record.title) ? 15 : 50
          reasons.push('gleicher Titel')
        } else if (
          !isGenericTitle(record.title) &&
          !isGenericTitle(listing.title) &&
          (listingTitle.includes(orderTitle) || orderTitle.includes(listingTitle))
        ) {
          score += 20
          reasons.push('ähnlicher Titel')
        }
      }

      const orderSeller = normalize(record.sellerName)
      if (listingSeller && orderSeller && listingSeller === orderSeller) {
        score += 30
        reasons.push('gleicher Verkäufer')
      }

      if (
        listing.priceAmount !== null &&
        record.productAmount !== null &&
        Number(listing.priceAmount) === Number(record.productAmount)
      ) {
        score += 25
        reasons.push('gleicher Preis')
      }

      const confidence: BunjangOrderMatch['confidence'] =
        score >= 200 ? 'exact' : score >= 75 ? 'strong' : 'possible'

      return { record, score, confidence, reasons }
    })
    .filter((match) => match.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}
