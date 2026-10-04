import 'server-only'

import {
  cardNumberNumerator,
  catalogMatchType,
  comparableCardNumber,
  displayCardNumber,
  tcgdexCatalogLanguage,
  tcgdexImageUrl,
  variantLabels,
  type CardCatalogCandidate,
} from '@/lib/card-catalog-types'

interface CatalogSearchInput {
  name?: string
  cardNumber?: string
  setName?: string
  itemLanguage?: string
  includeFallback?: boolean
}

interface TcgDexBrief {
  id: string
  localId: string | number
  name: string
  image?: string
}

interface TcgDexDetail extends TcgDexBrief {
  category?: string
  illustrator?: string
  rarity?: string
  hp?: number
  types?: string[]
  variants?: Record<string, unknown>
  set?: {
    id?: string
    name?: string
    cardCount?: { official?: number; total?: number }
  }
}

interface PokemonTcgCard {
  id: string
  name: string
  supertype?: string
  subtypes?: string[]
  hp?: string
  types?: string[]
  number?: string
  artist?: string
  rarity?: string
  set?: { id?: string; name?: string; printedTotal?: number; total?: number }
  images?: { small?: string; large?: string }
}

function normalizedText(value: string | null | undefined) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function containsNormalized(haystack: string | null | undefined, needle: string | null | undefined) {
  const wanted = normalizedText(needle)
  return !wanted || normalizedText(haystack).includes(wanted)
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`Kataloganfrage fehlgeschlagen (${response.status}).`)
  }
  return (await response.json()) as T
}

async function searchTcgdex(input: CatalogSearchInput): Promise<CardCatalogCandidate[]> {
  const itemLanguage = input.itemLanguage || 'Korean'
  const language = tcgdexCatalogLanguage(itemLanguage)
  const number = cardNumberNumerator(input.cardNumber)
  const params = new URLSearchParams()

  // If the physical language is not available in TCGdex (notably Korean),
  // searching by an English name would incorrectly suppress good number matches.
  if (input.name && catalogMatchType(itemLanguage, language) === 'exact_language') {
    params.set('name', input.name.trim())
  }
  if (number) params.set('localId', number)
  if (input.setName) params.set('set.name', input.setName.trim())
  params.set('pagination:page', '1')
  params.set('pagination:itemsPerPage', '24')

  if (![...params.keys()].some((key) => !key.startsWith('pagination:'))) return []

  const briefs = await fetchJson<TcgDexBrief[]>(
    `https://api.tcgdex.net/v2/${encodeURIComponent(language)}/cards?${params.toString()}`,
  )

  const details = await Promise.all(
    briefs.slice(0, 16).map(async (brief) => {
      try {
        return await fetchJson<TcgDexDetail>(
          `https://api.tcgdex.net/v2/${encodeURIComponent(language)}/cards/${encodeURIComponent(brief.id)}`,
        )
      } catch {
        return null
      }
    }),
  )

  return details
    .filter((detail): detail is TcgDexDetail => Boolean(detail))
    .filter((detail) => {
      if (number && comparableCardNumber(detail.localId) !== comparableCardNumber(number)) {
        return false
      }
      if (input.setName && !containsNormalized(detail.set?.name, input.setName)) return false
      if (
        input.name &&
        catalogMatchType(itemLanguage, language) === 'exact_language' &&
        !containsNormalized(detail.name, input.name)
      ) {
        return false
      }
      return true
    })
    .map((detail) => {
      const localId = String(detail.localId)
      const printedTotal = detail.set?.cardCount?.official ?? null
      const variants = variantLabels(detail.variants)
      const snapshot = {
        provider: 'tcgdex',
        id: detail.id,
        category: detail.category ?? null,
        illustrator: detail.illustrator ?? null,
        hp: detail.hp ?? null,
        types: detail.types ?? [],
        variants,
        setTotal: detail.set?.cardCount?.total ?? null,
        printedTotal,
      }
      return {
        provider: 'tcgdex' as const,
        providerCardId: detail.id,
        catalogLanguage: language,
        matchType: catalogMatchType(itemLanguage, language),
        name: detail.name,
        number: localId,
        numberDisplay: displayCardNumber(localId, printedTotal),
        setId: detail.set?.id ?? null,
        setName: detail.set?.name ?? null,
        rarity: detail.rarity ?? null,
        imageUrl: tcgdexImageUrl(detail.image, 'high'),
        category: detail.category ?? null,
        illustrator: detail.illustrator ?? null,
        hp: detail.hp === undefined ? null : String(detail.hp),
        types: detail.types ?? [],
        variants,
        snapshot,
      } satisfies CardCatalogCandidate
    })
}

function luceneValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

async function searchPokemonTcg(input: CatalogSearchInput): Promise<CardCatalogCandidate[]> {
  const clauses: string[] = []
  if (input.name) clauses.push(`name:${luceneValue(input.name.trim())}`)
  const number = cardNumberNumerator(input.cardNumber)
  if (number) clauses.push(`number:${luceneValue(number)}`)
  if (input.setName) clauses.push(`set.name:${luceneValue(input.setName.trim())}`)
  if (!clauses.length) return []

  const params = new URLSearchParams({
    q: clauses.join(' '),
    page: '1',
    pageSize: '16',
    orderBy: 'name,number',
  })
  const headers: Record<string, string> = {}
  const apiKey = process.env.POKEMON_TCG_API_KEY?.trim()
  if (apiKey) headers['X-Api-Key'] = apiKey

  const response = await fetchJson<{ data?: PokemonTcgCard[] }>(
    `https://api.pokemontcg.io/v2/cards?${params.toString()}`,
    { headers },
  )
  const itemLanguage = input.itemLanguage || 'Korean'

  return (response.data ?? [])
    .filter((card) => {
      if (number && comparableCardNumber(card.number) !== comparableCardNumber(number)) return false
      if (input.setName && !containsNormalized(card.set?.name, input.setName)) return false
      return true
    })
    .map((card) => {
      const printedTotal = card.set?.printedTotal ?? null
      const snapshot = {
        provider: 'pokemontcg',
        id: card.id,
        supertype: card.supertype ?? null,
        subtypes: card.subtypes ?? [],
        illustrator: card.artist ?? null,
        hp: card.hp ?? null,
        types: card.types ?? [],
        printedTotal,
        setTotal: card.set?.total ?? null,
      }
      return {
        provider: 'pokemontcg' as const,
        providerCardId: card.id,
        catalogLanguage: 'en',
        matchType: itemLanguage === 'English' ? 'exact_language' : 'equivalent_language',
        name: card.name,
        number: card.number ?? null,
        numberDisplay: displayCardNumber(card.number ?? null, printedTotal),
        setId: card.set?.id ?? null,
        setName: card.set?.name ?? null,
        rarity: card.rarity ?? null,
        imageUrl: card.images?.large ?? card.images?.small ?? null,
        category: card.supertype ?? null,
        illustrator: card.artist ?? null,
        hp: card.hp ?? null,
        types: card.types ?? [],
        variants: card.subtypes ?? [],
        snapshot,
      } satisfies CardCatalogCandidate
    })
}

export async function searchCardCatalog(input: CatalogSearchInput) {
  const warnings: string[] = []
  let primary: CardCatalogCandidate[] = []
  try {
    primary = await searchTcgdex(input)
  } catch (error) {
    warnings.push(error instanceof Error ? `TCGdex: ${error.message}` : 'TCGdex konnte nicht abgefragt werden.')
  }

  let fallback: CardCatalogCandidate[] = []
  if (input.includeFallback !== false && primary.length < 8) {
    try {
      fallback = await searchPokemonTcg(input)
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Pokémon TCG API: ${error.message}`
          : 'Pokémon TCG API konnte nicht abgefragt werden.',
      )
    }
  }

  return {
    candidates: [...primary, ...fallback].slice(0, 24),
    warnings,
    tcgdexLanguage: tcgdexCatalogLanguage(input.itemLanguage || 'Korean'),
  }
}
