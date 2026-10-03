import { z } from 'zod'

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => value || null)

const packageSchema = z.object({
  externalPackageId: z.string().trim().regex(/^STR-\d{8}-[A-Z0-9]+$/i),
  itemCategory: nullableText(300),
  recipientMasked: nullableText(300),
  domesticTrackingNumber: nullableText(100),
  rawRowText: z.string().max(2_000).optional().default(''),
})

const boxSchema = z.object({
  boxNumber: z.number().int().positive(),
  dimensions: z
    .object({
      widthCm: z.number().finite().positive(),
      heightCm: z.number().finite().positive(),
      lengthCm: z.number().finite().positive(),
      raw: z.string().max(200),
    })
    .nullable(),
  realWeightKg: z.number().finite().nonnegative().nullable(),
  volumeWeightKg: z.number().finite().nonnegative().nullable(),
  quoteWeightKg: z.number().finite().nonnegative().nullable(),
})

export const olaeetShipmentSchema = z.object({
  externalShipmentId: z
    .string()
    .trim()
    .regex(/^SHP-\d{8}-[A-Z0-9]+$/i),
  providerStatus: nullableText(100),
  createdAt: nullableText(100),
  completedAt: nullableText(100),
  courier: nullableText(120),
  trackingNumber: nullableText(160),
  trackingNumbers: z.array(z.string().trim().max(160)).max(20).default([]),
  paymentTransactionId: nullableText(160),
  shippingAmount: z.number().finite().nonnegative().nullable(),
  shippingFee: z.number().finite().nonnegative().nullable(),
  additionalFee: z.number().finite().nonnegative().nullable(),
  insuranceFee: z.number().finite().nonnegative().nullable(),
  totalPayment: z.number().finite().nonnegative().nullable(),
  currency: nullableText(20),
  address: z.object({
    name: nullableText(300),
    addressLine1: nullableText(500),
    city: nullableText(300),
    country: nullableText(20),
    zipCode: nullableText(60),
    contact: nullableText(120),
  }),
  packages: z.array(packageSchema).max(500),
  boxes: z.array(boxSchema).max(50),
  expectedItemCount: z.number().int().nonnegative().nullable(),
  expectedBoxCount: z.number().int().nonnegative().nullable(),
  extractionComplete: z.boolean(),
  pageUrl: nullableText(2_000),
  rawText: z.string().max(250_000),
  diagnostics: z.record(z.string(), z.unknown()).optional().default({}),
})

export const olaeetShipmentPayloadSchema = z.object({
  source: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional(),
  kind: z.literal('international-shipment').optional(),
  extractedAt: z.string().optional(),
  shipments: z.array(olaeetShipmentSchema).min(1).max(10),
})

export type OlaeetShipment = z.infer<typeof olaeetShipmentSchema>

export function validateCompleteShipment(shipment: OlaeetShipment) {
  if (!shipment.extractionComplete) {
    throw new Error(
      `Extraction für ${shipment.externalShipmentId} ist als unvollständig markiert.`,
    )
  }

  if (
    shipment.expectedItemCount === null ||
    shipment.expectedBoxCount === null
  ) {
    throw new Error(
      `OLAEET-Zähler fehlen für ${shipment.externalShipmentId}. ` +
        'Führe den aktualisierten Extractor erneut im geöffneten Shipping-Panel aus.',
    )
  }

  if (shipment.packages.length !== shipment.expectedItemCount) {
    throw new Error(
      `Paketanzahl stimmt nicht: ${shipment.packages.length}/` +
        `${shipment.expectedItemCount} erkannt.`,
    )
  }

  if (shipment.boxes.length !== shipment.expectedBoxCount) {
    throw new Error(
      `Boxanzahl stimmt nicht: ${shipment.boxes.length}/` +
        `${shipment.expectedBoxCount} erkannt.`,
    )
  }
}
