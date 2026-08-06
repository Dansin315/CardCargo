import { describe, expect, it } from 'vitest'
import { shipmentInputSchema } from '@/lib/shipment-schema'
import {
  filterShipmentLinkedImagesForSelection,
  type ShipmentLinkedImageChoice,
} from '@/lib/shipments'

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
}

const linkedImages: ShipmentLinkedImageChoice[] = [
  {
    id: 'warehouse-package:image-a',
    warehouse_package_id: 'package-a',
    purchase_id: null,
    package_label: 'PKG-A',
    source: 'warehouse_package',
    original_filename: 'inspection.jpg',
    category: 'warehouse_package',
    position: 1,
    signed_url: 'https://example.test/a',
  },
  {
    id: 'purchase:image-b',
    warehouse_package_id: 'package-b',
    purchase_id: 'purchase-b',
    package_label: 'PKG-B',
    source: 'purchase',
    original_filename: 'listing.jpg',
    category: 'listing',
    position: 1,
    signed_url: 'https://example.test/b',
  },
]

describe('international shipment images', () => {
  it('shows linked images only for selected OLAEET packages', () => {
    expect(filterShipmentLinkedImagesForSelection(linkedImages, ['package-a'])).toEqual([
      linkedImages[0],
    ])
    expect(filterShipmentLinkedImagesForSelection(linkedImages, [])).toEqual([])
  })

  it('accepts staged manual shipment images with a category', () => {
    const parsed = shipmentInputSchema.parse({
      ...baseInput,
      stagedImages: [
        {
          path: 'user/staging/shipments/upload/image.jpg',
          originalName: 'carton.jpg',
          mimeType: 'image/jpeg',
          byteSize: 1024,
          category: 'carton',
        },
      ],
      removeManualImageIds: ['22222222-2222-4222-8222-222222222222'],
    })

    expect(parsed.stagedImages[0]?.category).toBe('carton')
    expect(parsed.removeManualImageIds).toHaveLength(1)
  })

  it('rejects unsupported image categories', () => {
    const parsed = shipmentInputSchema.safeParse({
      ...baseInput,
      stagedImages: [
        {
          path: 'user/staging/shipments/upload/image.jpg',
          originalName: 'image.jpg',
          mimeType: 'image/jpeg',
          byteSize: 1024,
          category: 'unknown',
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })
})
