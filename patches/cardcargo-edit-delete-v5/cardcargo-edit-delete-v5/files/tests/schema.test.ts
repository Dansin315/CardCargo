import { describe, expect, it } from 'vitest'
import { createPurchaseSchema, updatePurchaseSchema } from '@/lib/importer/schema'

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


describe('updatePurchaseSchema', () => {
  it('normalizes the currency and accepts nullable costs', () => {
    const parsed = updatePurchaseSchema.parse({
      title: 'Updated purchase',
      description: 'Corrected notes',
      sellerName: 'Seller',
      priceAmount: 50_000,
      domesticShippingAmount: 4_000,
      serviceFeeAmount: null,
      priceCurrency: 'krw',
      purchasedAt: '2026-08-04',
      status: 'paid',
    })

    expect(parsed.priceCurrency).toBe('KRW')
    expect(parsed.domesticShippingAmount).toBe(4_000)
  })

  it('rejects an empty title and negative costs', () => {
    const parsed = updatePurchaseSchema.safeParse({
      title: '   ',
      description: '',
      sellerName: '',
      priceAmount: -1,
      domesticShippingAmount: null,
      serviceFeeAmount: null,
      priceCurrency: 'KRW',
      purchasedAt: null,
      status: 'ordered',
    })

    expect(parsed.success).toBe(false)
  })
})
