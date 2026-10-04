import { describe, expect, it } from 'vitest'
import { shipmentInputSchema } from '@/lib/shipment-schema'

const baseInput = {
  externalShipmentId: 'OUT-2026-001',
  shippingService: 'fedex_priority',
  trackingNumber: '123456789',
  status: 'in_transit',
  shippedAt: '2026-08-07',
  estimatedDeliveryAt: '2026-08-12',
  deliveredAt: null,
  totalWeightGrams: 500,
  internationalShippingAmount: 35000,
  forwardingFeeAmount: 5000,
  importTaxAmount: 0,
  currency: 'KRW',
  notes: null,
  warehousePackageIds: ['11111111-1111-4111-8111-111111111111'],
} as const

describe('shipmentInputSchema', () => {
  it('accepts a valid international shipment', () => {
    expect(shipmentInputSchema.parse(baseInput).shippingService).toBe('fedex_priority')
  })

  it('requires at least one warehouse package', () => {
    expect(() =>
      shipmentInputSchema.parse({ ...baseInput, warehousePackageIds: [] }),
    ).toThrow(/mindestens ein OLAEET-Paket/i)
  })

  it('rejects a delivery date before the shipping date', () => {
    expect(() =>
      shipmentInputSchema.parse({ ...baseInput, deliveredAt: '2026-08-06' }),
    ).toThrow(/Lieferdatum darf nicht vor dem Versanddatum/i)
  })

  it('requires a delivery date when the status is delivered', () => {
    expect(() =>
      shipmentInputSchema.parse({ ...baseInput, status: 'delivered' }),
    ).toThrow(/Lieferdatum erforderlich/i)
  })
})
