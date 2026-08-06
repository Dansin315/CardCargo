import { describe, expect, it } from 'vitest'
import { warehousePackageInputSchema } from '@/lib/warehouse-package-schema'
import {
  filterPurchaseImagesForSelection,
  type PackagePurchaseImageChoice,
} from '@/lib/warehouse-packages'

const baseInput = {
  externalPackageId: 'PKG-IMAGES',
  customerCode: null,
  domesticTrackingNumber: null,
  domesticCarrier: null,
  senderName: null,
  packageDescription: null,
  providerStatus: null,
  status: 'received',
  arrivedAt: '2026-08-05',
  inspectedAt: null,
  storageStartedAt: null,
  weightGrams: null,
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  notes: null,
  purchaseIds: [],
}

const images: PackagePurchaseImageChoice[] = [
  { id: 'image-a', purchase_id: 'purchase-a', position: 1, category: 'listing',  signed_url: 'https://example.test/a' },
  { id: 'image-b', purchase_id: 'purchase-b', position: 1, category: 'listing',  signed_url: 'https://example.test/b' },
]

describe('OLAEET package images', () => {
  it('shows only images from currently selected purchases', () => {
    expect(filterPurchaseImagesForSelection(images, ['purchase-a'])).toEqual([images[0]])
    expect(filterPurchaseImagesForSelection(images, [])).toEqual([])
  })

  it('accepts staged manual package images and removals', () => {
    const result = warehousePackageInputSchema.parse({
      ...baseInput,
      stagedImages: [
        {
          path: 'user/staging/warehouse-packages/upload/image.jpg',
          originalName: 'inspection.jpg',
          mimeType: 'image/jpeg',
          byteSize: 1024,
        },
      ],
      removeManualImageIds: ['11111111-1111-4111-8111-111111111111'],
    })

    expect(result.stagedImages).toHaveLength(1)
    expect(result.removeManualImageIds).toHaveLength(1)
  })

  it('rejects more than twelve new manual images', () => {
    const stagedImages = Array.from({ length: 13 }, (_, index) => ({
      path: `user/staging/warehouse-packages/upload/${index}.jpg`,
      originalName: `${index}.jpg`,
      mimeType: 'image/jpeg',
      byteSize: 1024,
    }))

    expect(
      warehousePackageInputSchema.safeParse({ ...baseInput, stagedImages }).success,
    ).toBe(false)
  })
})
