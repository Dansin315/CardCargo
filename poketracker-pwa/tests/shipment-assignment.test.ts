import { describe, expect, it } from 'vitest'
import {
  filterAssignableWarehousePackages,
  selectedWarehousePackageIdsForShipment,
  type ShipmentPackageLink,
  type ShipmentWarehousePackageChoice,
} from '@/lib/shipments'

const packages: ShipmentWarehousePackageChoice[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    external_package_id: 'PKG-A',
    domestic_tracking_number: null,
    sender_name: null,
    status: 'received',
    arrived_at: '2026-08-01',
    weight_grams: 100,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    external_package_id: 'PKG-B',
    domestic_tracking_number: null,
    sender_name: null,
    status: 'received',
    arrived_at: '2026-08-02',
    weight_grams: 200,
  },
]

const links: ShipmentPackageLink[] = [
  {
    shipment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    warehouse_package_id: packages[0].id,
  },
]

describe('international shipment package assignment', () => {
  it('hides packages assigned to another shipment', () => {
    expect(filterAssignableWarehousePackages(packages, links).map((item) => item.id)).toEqual([
      packages[1].id,
    ])
  })

  it('keeps packages assigned to the shipment currently being edited', () => {
    expect(
      filterAssignableWarehousePackages(
        packages,
        links,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ).map((item) => item.id),
    ).toEqual([packages[0].id, packages[1].id])
  })

  it('returns the selected package ids for a shipment', () => {
    expect(
      selectedWarehousePackageIdsForShipment(
        links,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
    ).toEqual([packages[0].id])
  })
})
