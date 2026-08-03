import { describe, expect, it } from 'vitest'
import {
  extractProductFromVisibleText,
  isBunjangProductImageUrl,
  isGenericBunjangTitle,
} from '@/lib/importer/render-bunjang'

describe('rendered Bunjang extraction', () => {
  it('extracts the example product from visible Korean text', () => {
    const text = `
번개장터
상품명이나 상점명을 검색해주세요
예술/희귀/수집품 희귀/수집품
포켓몬카드 다크라이 지라치 세레비
50,000원
3일 전
브랜드 포켓몬스터
상품상태 사용감 적음
판매
완료
2015년도 포켓몬카드
배송비
무료배송
구매하기
dhsgh
1/6
팔로우
0 ・ 후기 0 ・ 거래내역 0
`

    expect(extractProductFromVisibleText(text)).toEqual({
      title: '포켓몬카드 다크라이 지라치 세레비',
      priceAmount: 50000,
      description: '2015년도 포켓몬카드',
      sellerName: 'dhsgh',
    })
  })

  it('accepts only product-specific Bunjang media URLs', () => {
    expect(
      isBunjangProductImageUrl(
        'https://media.bunjang.co.kr/product/422347802_1_1234567890_w900.jpg',
        '422347802',
      ),
    ).toBe(true)
    expect(isBunjangProductImageUrl('https://media.bunjang.co.kr/logo/logo.png', '422347802')).toBe(false)
    expect(
      isBunjangProductImageUrl(
        'https://media.bunjang.co.kr/product/999999999_1_1234567890_w900.jpg',
        '422347802',
      ),
    ).toBe(false)
  })

  it('recognizes the generic site title', () => {
    expect(isGenericBunjangTitle('번개장터')).toBe(true)
  })
})
