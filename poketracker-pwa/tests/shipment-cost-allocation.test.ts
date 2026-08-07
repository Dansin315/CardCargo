import { describe, expect, it } from 'vitest'
import {
  allocationTotals,
  calculateShipmentCostAllocations,
  purchaseAllocationBasis,
  type AllocationPackage,
  type AllocationPurchase,
  type AllocationShipment,
} from '@/lib/shipment-cost-allocation'

const shipment: AllocationShipment = {
  id: 'shipment-1',
  international_shipping_amount: 60,
  forwarding_fee_amount: 10,
  import_tax_amount: 20,
  currency: 'EUR',
}

const packages: AllocationPackage[] = [
  {
    id: 'package-a',
    external_package_id: 'A',
    domestic_tracking_number: null,
    weight_grams: 1000,
  },
  {
    id: 'package-b',
    external_package_id: 'B',
    domestic_tracking_number: null,
    weight_grams: 2000,
  },
]

const purchases: AllocationPurchase[] = [
  {
    id: 'purchase-1',
    warehouse_package_id: 'package-a',
    title: 'Purchase 1',
    price_amount: 50000,
    domestic_shipping_amount: 0,
    service_fee_amount: 0,
    price_currency: 'KRW',
  },
  {
    id: 'purchase-2',
    warehouse_package_id: 'package-a',
    title: 'Purchase 2',
    price_amount: 30000,
    domestic_shipping_amount: 0,
    service_fee_amount: 0,
    price_currency: 'KRW',
  },
  {
    id: 'purchase-3',
    warehouse_package_id: 'package-b',
    title: 'Purchase 3',
    price_amount: 70000,
    domestic_shipping_amount: 0,
    service_fee_amount: 0,
    price_currency: 'KRW',
  },
]

describe('shipment cost allocation', () => {
  it('uses purchase price + domestic shipping + service fee as value basis', () => {
    expect(
      purchaseAllocationBasis({
        ...purchases[0],
        price_amount: 100,
        domestic_shipping_amount: 10,
        service_fee_amount: 5,
      }),
    ).toBe(115)
  })

  it('allocates shipping by package weight and inside package by purchase value', () => {
    const result = calculateShipmentCostAllocations({
      shipment,
      packages,
      purchases,
      methods: {
        shipping: 'package_weight',
        forwarding: 'equal_purchase',
        importTax: 'purchase_value',
      },
    })

    const byPurchase = new Map(result.allocations.map((row) => [row.purchase_id, row]))

    // 60 EUR shipping: package A gets 20, package B gets 40.
    // Package A's 20 is split 50k:30k => 12.50 / 7.50.
    expect(byPurchase.get('purchase-1')?.international_shipping_amount).toBe(12.5)
    expect(byPurchase.get('purchase-2')?.international_shipping_amount).toBe(7.5)
    expect(byPurchase.get('purchase-3')?.international_shipping_amount).toBe(40)

    // 10 EUR forwarding: equal across three purchases with deterministic cents.
    expect(allocationTotals(result.allocations).forwarding).toBe(10)

    // 20 EUR import: proportional to 50k / 30k / 70k.
    expect(allocationTotals(result.allocations).importTax).toBe(20)
    expect(allocationTotals(result.allocations).shipping).toBe(60)
  })

  it('preserves exact totals after cent rounding', () => {
    const result = calculateShipmentCostAllocations({
      shipment: { ...shipment, international_shipping_amount: 1 },
      packages,
      purchases,
      methods: {
        shipping: 'equal_purchase',
        forwarding: 'equal_purchase',
        importTax: 'equal_purchase',
      },
    })

    expect(allocationTotals(result.allocations).shipping).toBe(1)
  })

  it('refuses package-weight allocation when a used package has no weight', () => {
    expect(() =>
      calculateShipmentCostAllocations({
        shipment,
        packages: [{ ...packages[0], weight_grams: null }, packages[1]],
        purchases,
        methods: {
          shipping: 'package_weight',
          forwarding: 'equal_purchase',
          importTax: 'purchase_value',
        },
      }),
    ).toThrow(/fehlt ein positives Gewicht/)
  })

  it('refuses direct value comparison across mixed purchase currencies', () => {
    expect(() =>
      calculateShipmentCostAllocations({
        shipment,
        packages,
        purchases: [{ ...purchases[0], price_currency: 'USD' }, ...purchases.slice(1)],
        methods: {
          shipping: 'purchase_value',
          forwarding: 'equal_purchase',
          importTax: 'equal_purchase',
        },
      }),
    ).toThrow(/Mischwährungen/)
  })
})
