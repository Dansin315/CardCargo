import { describe, expect, it } from 'vitest'
import { warehousePackageInputSchema } from '@/lib/warehouse-package-schema'

const validInput = {
  externalPackageId: 'PKG-123',
  customerCode: null,
  domesticTrackingNumber: '123456789',
  domesticCarrier: 'CJ Logistics',
  senderName: 'Bunjang seller',
  packageDescription: 'Pokemon cards',
  providerStatus: 'Arrived',
  status: 'received',
  arrivedAt: '2026-08-05',
  inspectedAt: null,
  storageStartedAt: null,
  weightGrams: 250,
  lengthCm: 20,
  widthCm: 15,
  heightCm: 5,
  notes: null,
  purchaseIds: [],
}

describe('warehousePackageInputSchema', () => {
  it('accepts a valid OLAEET package', () => {
    expect(warehousePackageInputSchema.parse(validInput)).toMatchObject({
      externalPackageId: 'PKG-123',
      status: 'received',
      weightGrams: 250,
    })
  })

  it('requires a package ID or tracking number', () => {
    const result = warehousePackageInputSchema.safeParse({
      ...validInput,
      externalPackageId: null,
      domesticTrackingNumber: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative measurements', () => {
    const result = warehousePackageInputSchema.safeParse({
      ...validInput,
      weightGrams: -1,
    })
    expect(result.success).toBe(false)
  })

  it('calculates the storage deadline 80 days after arrival', () => {
    expect(warehousePackageInputSchema.parse(validInput)).toMatchObject({
      arrivedAt: '2026-08-05',
      storageDeadlineAt: '2026-10-24',
    })
  })

  it('rejects timestamps because package events are date-only', () => {
    const result = warehousePackageInputSchema.safeParse({
      ...validInput,
      arrivedAt: '2026-08-05T10:00:00.000Z',
    })
    expect(result.success).toBe(false)
  })

  it('ignores a submitted deadline and recalculates it from arrival', () => {
    expect(
      warehousePackageInputSchema.parse({
        ...validInput,
        storageDeadlineAt: '2099-01-01',
      }),
    ).toMatchObject({ storageDeadlineAt: '2026-10-24' })
  })
})
