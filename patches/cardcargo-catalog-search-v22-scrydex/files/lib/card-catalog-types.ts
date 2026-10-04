export type CatalogProvider = 'tcgdex' | 'scrydex' | 'pokemontcg'
export type CatalogMatchType = 'exact_language' | 'equivalent_language'

export interface CardCatalogCandidate {
  provider: CatalogProvider
  providerCardId: string
  catalogLanguage: string
  matchType: CatalogMatchType
  name: string
  number: string | null
  numberDisplay: string | null
  setId: string | null
  setCode: string | null
  setName: string | null
  pokemonNameEn: string | null
  englishName: string | null
  rarity: string | null
  imageUrl: string | null
  category: string | null
  illustrator: string | null
  hp: string | null
  types: string[]
  variants: string[]
  snapshot: Record<string, unknown>
}

export const itemLanguageOptions = [
  ['Korean', 'Koreanisch'],
  ['Japanese', 'Japanisch'],
  ['English', 'Englisch'],
  ['German', 'Deutsch'],
  ['French', 'Französisch'],
  ['Spanish', 'Spanisch'],
  ['Italian', 'Italienisch'],
  ['Portuguese', 'Portugiesisch'],
  ['Chinese Traditional', 'Chinesisch (traditionell)'],
  ['Indonesian', 'Indonesisch'],
  ['Thai', 'Thailändisch'],
  ['Other', 'Andere'],
] as const

const tcgdexLanguageMap: Record<string, string> = {
  Japanese: 'ja',
  English: 'en',
  German: 'de',
  French: 'fr',
  Spanish: 'es',
  Italian: 'it',
  Portuguese: 'pt-br',
  'Chinese Traditional': 'zh-tw',
  Indonesian: 'id',
  Thai: 'th',
}

export function tcgdexCatalogLanguage(itemLanguage: string) {
  return tcgdexLanguageMap[itemLanguage] ?? 'en'
}

export function catalogMatchType(
  itemLanguage: string,
  catalogLanguage: string,
): CatalogMatchType {
  return tcgdexLanguageMap[itemLanguage] === catalogLanguage
    ? 'exact_language'
    : 'equivalent_language'
}

export function cardNumberNumerator(value: string | null | undefined) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw.split('/')[0]?.trim() ?? ''
}

export function comparableCardNumber(value: string | null | undefined) {
  const numerator = cardNumberNumerator(value).toLowerCase()
  if (/^\d+$/.test(numerator)) return String(Number.parseInt(numerator, 10))
  return numerator.replace(/\s+/g, '')
}

export function tcgdexImageUrl(
  assetBase: string | null | undefined,
  quality: 'low' | 'high' = 'high',
) {
  if (!assetBase) return null
  return `${assetBase.replace(/\/$/, '')}/${quality}.webp`
}

export function displayCardNumber(number: string | null, printedTotal: number | null) {
  if (!number) return null
  return printedTotal ? `${number}/${printedTotal}` : number
}

export function variantLabels(variants: Record<string, unknown> | null | undefined) {
  if (!variants) return []
  const labels: Record<string, string> = {
    normal: 'Normal',
    reverse: 'Reverse Holo',
    holo: 'Holo',
    firstEdition: '1st Edition',
    wPromo: 'W Promo',
  }
  return Object.entries(variants)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => labels[key] ?? key)
}
