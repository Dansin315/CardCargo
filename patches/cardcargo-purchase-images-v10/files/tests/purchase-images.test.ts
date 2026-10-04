import { describe, expect, it } from 'vitest'
import { updatePurchaseSchema } from '@/lib/importer/schema'

const base = {
  title: 'Test purchase',
  description: '',
  sellerName: '',
  priceAmount: 50_000,
  domesticShippingAmount: 4_000,
  serviceFeeAmount: null,
  priceCurrency: 'KRW',
  purchasedAt: '2026-08-06',
  status: 'ordered' as const,
}

describe('purchase image editing', () => {
  it('accepts categorized staged chat screenshots', () => {
    const result = updatePurchaseSchema.parse({
      ...base,
      stagedImages: [
        {
          path: 'user/staging/edit/chat.png',
          originalName: 'chat.png',
          mimeType: 'image/png',
          byteSize: 1234,
          category: 'chat',
        },
      ],
      deleteManualImageIds: [],
    })

    expect(result.stagedImages[0]?.category).toBe('chat')
  })

  it('rejects unsupported image categories', () => {
    expect(() =>
      updatePurchaseSchema.parse({
        ...base,
        stagedImages: [
          {
            path: 'user/staging/edit/file.png',
            originalName: 'file.png',
            mimeType: 'image/png',
            byteSize: 1234,
            category: 'unknown',
          },
        ],
        deleteManualImageIds: [],
      }),
    ).toThrow()
  })
})
