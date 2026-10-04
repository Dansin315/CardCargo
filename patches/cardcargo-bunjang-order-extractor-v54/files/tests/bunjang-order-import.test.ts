import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBunjangOrderSnapshot } from '@/lib/bunjang-order-import'

test('parses Bunjang order-detail labels used by the current purchase page', () => {
  const record = parseBunjangOrderSnapshot({
    orderId: '100023792',
    orderUrl: 'https://order.bunjang.co.kr/purchases/100023792',
    text: `
2026.08.17 주문번호 100023792
거래 완료
포켓몬 카드 뮤 20주년 프로모카드
20,000원
배송 조회
결제정보
상품금액 20,000원
배송비 +4,000원
총 결제금액 24,000원
거래정보
주문번호 100023792 26년 08월 17일 01:28
판매자 친절한판매왕1등
거래방법 일반택배(선불)
운송장 CU편의점택배 460359674375
`,
    productUrls: [],
    imageUrls: [],
  })

  assert.equal(record.title, '포켓몬 카드 뮤 20주년 프로모카드')
  assert.equal(record.productAmount, 20000)
  assert.equal(record.domesticShippingAmount, 4000)
  assert.equal(record.totalAmount, 24000)
  assert.equal(record.purchasedAt, '2026-08-17')
  assert.equal(record.sellerName, '친절한판매왕1등')
  assert.equal(record.transactionMethod, '일반택배(선불)')
  assert.equal(record.domesticCarrier, 'CU편의점택배')
  assert.equal(record.domesticTrackingNumber, '460359674375')
})
