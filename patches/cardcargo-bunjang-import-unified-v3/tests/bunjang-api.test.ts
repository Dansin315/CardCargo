import { describe, expect, it } from 'vitest'
import { listingPreviewFromBunjangApiPayload } from '@/lib/importer/bunjang-api'

describe('Bunjang product API mapping', () => {
  it('maps product, seller, price and all templated images', () => {
    const preview = listingPreviewFromBunjangApiPayload(
      {
        data: {
          product: {
            name: '포켓몬카드 다크라이 지라치 세레비',
            description: '2015년도 포켓몬카드',
            price: 50000,
            imageUrl:
              'https://media.bunjang.co.kr/product/422347802_{cnt}_1750000000_w{res}.jpg',
            imageCount: 6,
          },
          shop: { name: 'dhsgh' },
        },
      },
      'https://m.bunjang.co.kr/products/422347802',
      '422347802',
    )

    expect(preview.title).toBe('포켓몬카드 다크라이 지라치 세레비')
    expect(preview.description).toBe('2015년도 포켓몬카드')
    expect(preview.priceAmount).toBe(50000)
    expect(preview.sellerName).toBe('dhsgh')
    expect(preview.imageUrls).toHaveLength(6)
    expect(preview.imageUrls[0]).toContain('422347802_1_')
    expect(preview.imageUrls[5]).toContain('422347802_6_')
    expect(preview.imageUrls[0]).toContain('_w840.jpg')
  })
})
