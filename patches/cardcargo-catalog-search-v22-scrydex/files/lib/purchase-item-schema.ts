import { z } from 'zod'

const nullableText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).transform((value) => value || null)

export const purchaseItemPayloadSchema = z.object({
  itemName: z.string().trim().min(1).max(200),
  setName: nullableText(200),
  setCode: nullableText(80),
  pokemonNameEn: nullableText(200),
  cardNumber: nullableText(80),
  language: z.string().trim().min(1).max(80).default('Korean'),
  rarity: nullableText(120),
  variant: nullableText(120),
  quantity: z.number().int().min(1).max(999),
  gradingCompany: nullableText(80),
  grade: nullableText(80),
  sellerCondition: nullableText(120),
  allocatedUnitCost: z.number().min(0).max(999999999999).nullable(),
  notes: nullableText(4000),
  catalogProvider: z.enum(['tcgdex', 'scrydex', 'pokemontcg']).nullable(),
  catalogCardId: nullableText(200),
  catalogLanguage: nullableText(30),
  catalogMatchType: z.enum(['exact_language', 'equivalent_language']).nullable(),
  catalogImageUrl: z.union([z.string().url().max(2000), z.null()]),
  catalogSnapshot: z.record(z.string(), z.unknown()).nullable(),
})
