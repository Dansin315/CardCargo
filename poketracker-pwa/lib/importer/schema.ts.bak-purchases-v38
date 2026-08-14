import { z } from 'zod'

export const previewRequestSchema = z.object({
  url: z.string().trim().min(1).max(2_000),
})

const stagedImageSchema = z.object({
  path: z.string().min(1).max(600),
  originalName: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  byteSize: z.number().int().positive().max(6 * 1024 * 1024),
})


const purchaseImageCategorySchema = z.enum([
  'listing',
  'general',
  'chat',
  'condition',
  'receipt',
  'shipping',
])

const stagedPurchaseImageSchema = stagedImageSchema.extend({
  category: purchaseImageCategorySchema,
})

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Kaufdatum.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  }, 'Das Kaufdatum existiert nicht.')

export const createPurchaseSchema = z
  .object({
    source: z.literal('bunjang').default('bunjang'),
    listingUrl: z.string().trim().min(1).max(2_000),
    canonicalUrl: z.string().trim().min(1).max(2_000).nullable().optional(),
    externalId: z.string().trim().max(200).nullable().optional(),
    title: z.string().trim().min(1).max(300),
    description: z.string().max(10_000).default(''),
    sellerName: z.string().trim().max(200).default(''),
    priceAmount: z.number().nonnegative().max(999_999_999_999).nullable(),
    domesticShippingAmount: z.number().nonnegative().max(999_999_999_999).nullable().default(null),
    priceCurrency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),
    purchasedAt: dateOnlySchema.nullable().optional(),
    status: z
      .enum([
        'planned',
        'ordered',
        'paid',
        'shipped_domestic',
        'warehouse_received',
        'consolidated',
        'international_transit',
        'delivered',
        'cancelled',
      ])
      .default('ordered'),
    remoteImageUrls: z.array(z.string().url().max(2_000)).max(12).default([]),
    stagedImages: z.array(stagedImageSchema).max(12).default([]),
  })
  .superRefine((value, context) => {
    if (value.remoteImageUrls.length + value.stagedImages.length > 12) {
      context.addIssue({
        code: 'custom',
        path: ['remoteImageUrls'],
        message: 'Pro Angebot können höchstens zwölf Bilder archiviert werden.',
      })
    }
  })


export const updatePurchaseSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).default(''),
  sellerName: z.string().trim().max(200).default(''),
  priceAmount: z.number().nonnegative().max(999_999_999_999).nullable(),
  domesticShippingAmount: z.number().nonnegative().max(999_999_999_999).nullable(),
  serviceFeeAmount: z.number().nonnegative().max(999_999_999_999).nullable(),
  priceCurrency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  purchasedAt: dateOnlySchema.nullable(),
  stagedImages: z.array(stagedPurchaseImageSchema).max(12).default([]),
  deleteManualImageIds: z.array(z.string().uuid()).max(24).default([]),
  status: z.enum([
    'planned',
    'ordered',
    'paid',
    'shipped_domestic',
    'warehouse_received',
    'consolidated',
    'international_transit',
    'delivered',
    'cancelled',
  ]),
})
