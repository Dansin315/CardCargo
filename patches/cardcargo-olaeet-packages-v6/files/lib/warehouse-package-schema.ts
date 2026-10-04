import { z } from 'zod'
import { packageStatuses } from '@/lib/warehouse-packages'

const nullableText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullable()
    .default(null)
    .transform((value) => value || null)

const nullableAmount = (label: string, maximum: number) =>
  z
    .number({ error: `${label} muss eine Zahl sein.` })
    .finite()
    .min(0, `${label} darf nicht negativ sein.`)
    .max(maximum, `${label} ist zu groß.`)
    .nullable()
    .default(null)

const nullableDateTime = z
  .string()
  .trim()
  .nullable()
  .default(null)
  .refine(
    (value) => value === null || value === '' || !Number.isNaN(Date.parse(value)),
    'Datum oder Uhrzeit ist ungültig.',
  )
  .transform((value) => value || null)

export const warehousePackageInputSchema = z
  .object({
    externalPackageId: nullableText(200),
    customerCode: nullableText(100),
    domesticTrackingNumber: nullableText(200),
    domesticCarrier: nullableText(120),
    senderName: nullableText(200),
    packageDescription: nullableText(2_000),
    providerStatus: nullableText(200),
    status: z.enum(packageStatuses),
    arrivedAt: nullableDateTime,
    inspectedAt: nullableDateTime,
    storageStartedAt: nullableDateTime,
    storageDeadlineAt: nullableDateTime,
    weightGrams: nullableAmount('Gewicht', 1_000_000),
    lengthCm: nullableAmount('Länge', 10_000),
    widthCm: nullableAmount('Breite', 10_000),
    heightCm: nullableAmount('Höhe', 10_000),
    notes: nullableText(10_000),
    purchaseIds: z.array(z.string().uuid('Ungültige Einkaufs-ID.')).max(250).default([]),
  })
  .superRefine((value, context) => {
    if (!value.externalPackageId && !value.domesticTrackingNumber) {
      context.addIssue({
        code: 'custom',
        path: ['externalPackageId'],
        message: 'Erfasse eine OLAEET-Paket-ID oder eine koreanische Trackingnummer.',
      })
    }

    if (
      value.storageStartedAt &&
      value.storageDeadlineAt &&
      Date.parse(value.storageDeadlineAt) < Date.parse(value.storageStartedAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['storageDeadlineAt'],
        message: 'Die Lagerfrist darf nicht vor dem Lagerbeginn liegen.',
      })
    }
  })

export type WarehousePackageInput = z.infer<typeof warehousePackageInputSchema>
