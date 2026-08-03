import { describe, expect, it } from 'vitest'
import { createPurchaseSchema } from '@/lib/importer/schema'

const basePurchase = {
  source: 'bunjang' as const,
  listingUrl: 'm.bunjang.co.kr/products/123',
  canonicalUrl: null,
  externalId: '123',
  title: 'Korean Pokémon card',
  description: '',
  sellerName: '',
  priceAmount: 60_000,
  priceCurrency: 'krw',
  purchasedAt: '2026-07-31',
  status: 'ordered' as const,
  remoteImageUrls: ['https://img.example/card.jpg'],
  stagedImages: [],
}

describe('createPurchaseSchema', () => {
  it('accepts a Bunjang URL without a scheme for server-side normalization', () => {
    const parsed = createPurchaseSchema.parse(basePurchase)
    expect(parsed.listingUrl).toBe(basePurchase.listingUrl)
    expect(parsed.priceCurrency).toBe('KRW')
  })

  it('rejects more than eight images in total', () => {
    const parsed = createPurchaseSchema.safeParse({
      ...basePurchase,
      remoteImageUrls: Array.from({ length: 5 }, (_, index) => `https://img.example/${index}.jpg`),
      stagedImages: Array.from({ length: 4 }, (_, index) => ({
        path: `user/staging/import/${index}.jpg`,
        originalName: `${index}.jpg`,
        mimeType: 'image/jpeg' as const,
        byteSize: 1_024,
      })),
    })

    expect(parsed.success).toBe(false)
  })

  it.each(['31.07.2026', '2026-02-31'])('rejects invalid date-only value %s', (purchasedAt) => {
    const parsed = createPurchaseSchema.safeParse({ ...basePurchase, purchasedAt })
    expect(parsed.success).toBe(false)
  })
})
