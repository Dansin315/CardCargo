import { describe, expect, it } from 'vitest'
import {
  filterAssignablePurchases,
  selectedPurchaseIdsForPackage,
  type PackagePurchaseChoice,
  type WarehousePackagePurchaseLink,
} from '@/lib/warehouse-packages'

const purchases: PackagePurchaseChoice[] = [
  { id: 'purchase-a', title: 'A', source_listing_id: null, purchased_at: null, status: 'ordered', seller_name: 'Seller A', price_amount: 1000, currency: 'KRW' },
  { id: 'purchase-b', title: 'B', source_listing_id: null, purchased_at: null, status: 'ordered', seller_name: 'Seller B', price_amount: 2000, currency: 'KRW' },
  { id: 'purchase-c', title: 'C', source_listing_id: null, purchased_at: null, status: 'ordered', seller_name: 'Seller C', price_amount: 3000, currency: 'KRW' },
]

const links: WarehousePackagePurchaseLink[] = [
  { purchase_id: 'purchase-a', warehouse_package_id: 'package-one' },
  { purchase_id: 'purchase-b', warehouse_package_id: 'package-two' },
]

describe('OLAEET purchase assignment filtering', () => {
  it('hides every already assigned purchase when creating a new package', () => {
    expect(filterAssignablePurchases(purchases, links).map((purchase) => purchase.id)).toEqual([
      'purchase-c',
    ])
  })

  it('keeps purchases assigned to the package currently being edited', () => {
    expect(
      filterAssignablePurchases(purchases, links, 'package-one').map((purchase) => purchase.id),
    ).toEqual(['purchase-a', 'purchase-c'])
  })

  it('returns the selected purchases for one package', () => {
    expect(selectedPurchaseIdsForPackage(links, 'package-two')).toEqual(['purchase-b'])
  })
})
