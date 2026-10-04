import { z } from 'zod'
import {
  shipmentCurrencies,
  shipmentStatuses,
  shippingServices,
} from '@/lib/shipments'
import { isValidDateOnly } from '@/lib/warehouse-packages'

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

const nullableDate = z
  .string()
  .trim()
  .nullable()
  .default(null)
  .refine(
    (value) => value === null || value === '' || isValidDateOnly(value),
    'Datum ist ungültig.',
  )
  .transform((value) => value || null)

export const shipmentInputSchema = z
  .object({
    externalShipmentId: nullableText(200),
    shippingService: z.enum(shippingServices),
    trackingNumber: nullableText(250),
    status: z.enum(shipmentStatuses),
    shippedAt: nullableDate,
    estimatedDeliveryAt: nullableDate,
    deliveredAt: nullableDate,
    totalWeightGrams: nullableAmount('Gesamtgewicht', 10_000_000),
    internationalShippingAmount: nullableAmount('Internationale Versandkosten', 100_000_000),
    forwardingFeeAmount: nullableAmount('OLAEET-Servicegebühren', 100_000_000),
    importTaxAmount: nullableAmount('Zoll- und Einfuhrkosten', 100_000_000),
    currency: z.enum(shipmentCurrencies),
    notes: nullableText(10_000),
    warehousePackageIds: z
      .array(z.string().uuid('Ungültige OLAEET-Paket-ID.'))
      .min(1, 'Wähle mindestens ein OLAEET-Paket aus.')
      .max(250),
  })
  .superRefine((value, context) => {
    if (
      value.shippedAt &&
      value.estimatedDeliveryAt &&
      value.estimatedDeliveryAt < value.shippedAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['estimatedDeliveryAt'],
        message: 'Das erwartete Lieferdatum darf nicht vor dem Versanddatum liegen.',
      })
    }

    if (value.shippedAt && value.deliveredAt && value.deliveredAt < value.shippedAt) {
      context.addIssue({
        code: 'custom',
        path: ['deliveredAt'],
        message: 'Das Lieferdatum darf nicht vor dem Versanddatum liegen.',
      })
    }

    if (value.status === 'delivered' && !value.deliveredAt) {
      context.addIssue({
        code: 'custom',
        path: ['deliveredAt'],
        message: 'Für eine zugestellte Sendung ist ein Lieferdatum erforderlich.',
      })
    }
  })

export type ShipmentInput = z.infer<typeof shipmentInputSchema>
