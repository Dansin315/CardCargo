import 'server-only'
import { setDefaultResultOrder } from 'node:dns'
import { setDefaultAutoSelectFamily } from 'node:net'

setDefaultResultOrder('ipv4first')
setDefaultAutoSelectFamily(false)

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
  setCode?: string
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
  dexId?: number[]
  suffix?: string
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
  set?: {
    id?: string
    name?: string
    ptcgoCode?: string
    printedTotal?: number
    total?: number
  }
  images?: { small?: string; large?: string }
}

function normalizedText(value: string | null | undefined) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function describeFetchError(error: unknown) {
  if (!(error instanceof Error)) return 'Unbekannter Netzwerkfehler.'

  const parts = [error.message]
  const cause = (error as Error & { cause?: unknown }).cause

  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    parts.push(cause.message)
  } else if (cause && typeof cause === 'object') {
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : null
    const message =
      'message' in cause && typeof cause.message === 'string' ? cause.message : null
    if (code) parts.push(code)
    if (message && message !== error.message) parts.push(message)
  }

  return [...new Set(parts)].join(' · ')
}

class CatalogHttpError extends Error {
  retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'CatalogHttpError'
    this.retryable = retryable
  }
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  options?: { attempts?: number; timeoutMs?: number },
): Promise<T> {
  const attempts = Math.max(1, options?.attempts ?? 2)
  const timeoutMs = Math.max(1_000, options?.timeoutMs ?? 20_000)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        const detail = body.trim().slice(0, 240)
        const retryable = response.status === 429 || response.status >= 500
        const error = new CatalogHttpError(
          `Kataloganfrage fehlgeschlagen (${response.status})${detail ? `: ${detail}` : '.'}`,
          retryable,
        )

        if (retryable && attempt < attempts) {
          lastError = error
          await wait(400 * attempt)
          continue
        }

        throw error
      }

      return (await response.json()) as T
    } catch (error) {
      lastError = error

      if (error instanceof CatalogHttpError && !error.retryable) throw error

      if (attempt < attempts) {
        await wait(400 * attempt)
        continue
      }
    }
  }

  if (lastError instanceof CatalogHttpError) throw lastError
  throw new Error(`Netzwerkfehler nach ${attempts} Versuchen: ${describeFetchError(lastError)}`)
}

function tcgdexSearchLanguages(itemLanguage: string) {
  const mapped = tcgdexCatalogLanguage(itemLanguage)

  // Korean physical cards deliberately use the Japanese TCGdex catalog first.
  // The selected physical language is never overwritten by this catalog choice.
  if (itemLanguage === 'Korean') return ['ja', 'en']
  if (itemLanguage === 'Japanese') return ['ja', 'en']

  return [...new Set([mapped, 'en'])]
}

function stripPokemonCardSuffix(name: string) {
  return name
    .replace(/\s+(?:ex|EX|GX|V-UNION|VMAX|VSTAR|V|BREAK|LV\.X|Prime)$/u, '')
    .trim()
}

function appendSuffix(name: string, suffix: string | null | undefined) {
  const cleanName = name.trim()
  const cleanSuffix = String(suffix ?? '').trim()
  if (!cleanSuffix) return cleanName
  if (normalizedText(cleanName).endsWith(normalizedText(cleanSuffix))) return cleanName
  return `${cleanName} ${cleanSuffix}`.trim()
}

async function resolveEnglishPokemonNames(
  dexId: number | null,
  suffix: string | null | undefined,
  cache: Map<number, { pokemonNameEn: string | null; englishName: string | null }>,
) {
  if (!dexId) return { pokemonNameEn: null, englishName: null }
  const cached = cache.get(dexId)
  if (cached) return cached

  try {
    const params = new URLSearchParams({ dexId: String(dexId) })
    const briefs = await fetchJson<TcgDexBrief[]>(
      `https://api.tcgdex.net/v2/en/cards?${params.toString()}`,
      undefined,
      { attempts: 1, timeoutMs: 10_000 },
    )

    const names = [...new Set(briefs.map((brief) => brief.name.trim()).filter(Boolean))]
    if (!names.length) {
      const empty = { pokemonNameEn: null, englishName: null }
      cache.set(dexId, empty)
      return empty
    }

    const speciesCandidates = [...new Set(names.map(stripPokemonCardSuffix).filter(Boolean))]
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
    const pokemonNameEn = speciesCandidates[0] ?? null

    const wantedSuffix = normalizedText(suffix)
    const matchingSuffixNames = wantedSuffix
      ? names
          .filter((name) => normalizedText(name).endsWith(wantedSuffix))
          .sort((a, b) => a.length - b.length || a.localeCompare(b))
      : []

    const englishName =
      matchingSuffixNames[0] ??
      (pokemonNameEn ? appendSuffix(pokemonNameEn, suffix) : null)

    const resolved = { pokemonNameEn, englishName }
    cache.set(dexId, resolved)
    return resolved
  } catch {
    const empty = { pokemonNameEn: null, englishName: null }
    cache.set(dexId, empty)
    return empty
  }
}

async function searchTcgdexLanguage(
  input: CatalogSearchInput,
  language: string,
): Promise<CardCatalogCandidate[]> {
  const itemLanguage = input.itemLanguage || 'Korean'
  const number = cardNumberNumerator(input.cardNumber)
  const setCode = input.setCode?.trim() || ''
  const name = input.name?.trim() || ''
  const params = new URLSearchParams()

  // Set code and local number are language-independent identifiers and are
  // therefore preferred over a translated card name.
  if (number) params.set('localId', number)
  if (setCode) params.set('set.id', setCode)
  if (!number && !setCode && name) params.set('name', name)

  if (![...params.keys()].length) return []

  const briefs = await fetchJson<TcgDexBrief[]>(
    `https://api.tcgdex.net/v2/${encodeURIComponent(language)}/cards?${params.toString()}`,
    undefined,
    { attempts: 2, timeoutMs: 20_000 },
  )

  const matchedBriefs = briefs
    .filter((brief) => {
      if (
        number &&
        comparableCardNumber(String(brief.localId)) !== comparableCardNumber(number)
      ) {
        return false
      }
      return true
    })
    .slice(0, 12)

  const enriched: Array<{ brief: TcgDexBrief; detail: TcgDexDetail | null }> = []

  for (let index = 0; index < matchedBriefs.length; index += 4) {
    const batch = matchedBriefs.slice(index, index + 4)
    const batchResults = await Promise.all(
      batch.map(async (brief) => {
        try {
          const detail = await fetchJson<TcgDexDetail>(
            `https://api.tcgdex.net/v2/${encodeURIComponent(language)}/cards/${encodeURIComponent(brief.id)}`,
            undefined,
            { attempts: 1, timeoutMs: 10_000 },
          )
          return { brief, detail }
        } catch {
          return { brief, detail: null }
        }
      }),
    )
    enriched.push(...batchResults)
  }

  const englishNameCache = new Map<
    number,
    { pokemonNameEn: string | null; englishName: string | null }
  >()

  return Promise.all(
    enriched.map(async ({ brief, detail }) => {
      const localId = String(detail?.localId ?? brief.localId)
      const printedTotal = detail?.set?.cardCount?.official ?? null
      const variants = detail ? variantLabels(detail.variants) : []
      const setCodeValue = detail?.set?.id ?? brief.id.split('-')[0] ?? null
      const dexId = detail?.dexId?.[0] ?? null

      let pokemonNameEn: string | null = null
      let englishName: string | null = null

      if (language === 'en') {
        englishName = detail?.name ?? brief.name
        pokemonNameEn = detail?.category === 'Pokemon'
          ? stripPokemonCardSuffix(englishName)
          : null
      } else if (detail?.category === 'Pokemon' && dexId) {
        const resolved = await resolveEnglishPokemonNames(dexId, detail.suffix, englishNameCache)
        pokemonNameEn = resolved.pokemonNameEn
        englishName = resolved.englishName
      }

      const snapshot = detail
        ? {
            provider: 'tcgdex',
            id: detail.id,
            localizedName: detail.name,
            englishName,
            pokemonNameEn,
            category: detail.category ?? null,
            illustrator: detail.illustrator ?? null,
            hp: detail.hp ?? null,
            types: detail.types ?? [],
            dexId: detail.dexId ?? [],
            suffix: detail.suffix ?? null,
            variants,
            setCode: setCodeValue,
            setName: detail.set?.name ?? null,
            setTotal: detail.set?.cardCount?.total ?? null,
            printedTotal,
            detailEnriched: true,
            searchLanguage: language,
          }
        : {
            provider: 'tcgdex',
            id: brief.id,
            localizedName: brief.name,
            localId,
            setCode: setCodeValue,
            detailEnriched: false,
            searchLanguage: language,
          }

      return {
        provider: 'tcgdex' as const,
        providerCardId: detail?.id ?? brief.id,
        catalogLanguage: language,
        matchType: catalogMatchType(itemLanguage, language),
        name: detail?.name ?? brief.name,
        number: localId,
        numberDisplay: displayCardNumber(localId, printedTotal),
        setId: detail?.set?.id ?? setCodeValue,
        setCode: setCodeValue,
        setName: detail?.set?.name ?? null,
        pokemonNameEn,
        englishName,
        rarity: detail?.rarity ?? null,
        imageUrl: tcgdexImageUrl(detail?.image ?? brief.image, 'high'),
        category: detail?.category ?? null,
        illustrator: detail?.illustrator ?? null,
        hp: detail?.hp === undefined ? null : String(detail.hp),
        types: detail?.types ?? [],
        variants,
        snapshot,
      } satisfies CardCatalogCandidate
    }),
  )
}

async function searchTcgdex(input: CatalogSearchInput): Promise<CardCatalogCandidate[]> {
  const itemLanguage = input.itemLanguage || 'Korean'
  const languages = tcgdexSearchLanguages(itemLanguage)
  const warnings: Error[] = []

  for (const language of languages) {
    try {
      const candidates = await searchTcgdexLanguage(input, language)
      if (candidates.length) return candidates
    } catch (error) {
      warnings.push(error instanceof Error ? error : new Error(String(error)))
    }
  }

  if (warnings.length === languages.length && warnings.length) throw warnings[0]
  return []
}

function luceneValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function luceneToken(value: string) {
  return value.replace(/([+\-!(){}\[\]^"~*?:\\/])/g, '\\$1')
}

async function searchPokemonTcg(input: CatalogSearchInput): Promise<CardCatalogCandidate[]> {
  const clauses: string[] = []
  const number = cardNumberNumerator(input.cardNumber)
  const setCode = input.setCode?.trim() || ''

  if (number) clauses.push(`number:${luceneToken(number)}`)
  if (setCode) clauses.push(`set.ptcgoCode:${luceneValue(setCode)}`)
  if (!number && !setCode && input.name) {
    clauses.push(`name:${luceneValue(input.name.trim())}`)
  }
  if (!clauses.length) return []

  const params = new URLSearchParams({
    q: clauses.join(' '),
    page: '1',
    pageSize: '16',
    select:
      'id,name,supertype,subtypes,hp,types,number,artist,rarity,set,images',
  })
  const headers: Record<string, string> = {}
  const apiKey = process.env.POKEMON_TCG_API_KEY?.trim()
  if (apiKey) headers['X-Api-Key'] = apiKey

  const response = await fetchJson<{ data?: PokemonTcgCard[] }>(
    `https://api.pokemontcg.io/v2/cards?${params.toString()}`,
    { headers },
    { attempts: 3, timeoutMs: 20_000 },
  )
  const itemLanguage = input.itemLanguage || 'Korean'

  return (response.data ?? [])
    .filter((card) => {
      if (number && comparableCardNumber(card.number) !== comparableCardNumber(number)) return false
      if (
        setCode &&
        normalizedText(card.set?.ptcgoCode) !== normalizedText(setCode)
      ) {
        return false
      }
      return true
    })
    .map((card) => {
      const printedTotal = card.set?.printedTotal ?? null
      const setCodeValue = card.set?.ptcgoCode ?? card.set?.id ?? null
      const pokemonNameEn =
        card.supertype === 'Pokémon' || card.supertype === 'Pokemon'
          ? stripPokemonCardSuffix(card.name)
          : null

      const snapshot = {
        provider: 'pokemontcg',
        id: card.id,
        englishName: card.name,
        pokemonNameEn,
        supertype: card.supertype ?? null,
        subtypes: card.subtypes ?? [],
        illustrator: card.artist ?? null,
        hp: card.hp ?? null,
        types: card.types ?? [],
        setCode: setCodeValue,
        setName: card.set?.name ?? null,
        providerSetId: card.set?.id ?? null,
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
        setCode: setCodeValue,
        setName: card.set?.name ?? null,
        pokemonNameEn,
        englishName: card.name,
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
    warnings.push(
      error instanceof Error
        ? `TCGdex: ${error.message}`
        : 'TCGdex konnte nicht abgefragt werden.',
    )
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
    tcgdexLanguage:
      input.itemLanguage === 'Korean'
        ? 'ja'
        : tcgdexCatalogLanguage(input.itemLanguage || 'Korean'),
  }
}
