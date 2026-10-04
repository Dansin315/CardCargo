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

interface TcgDexSet {
  id: string
  name: string
  cards?: TcgDexBrief[]
  cardCount?: {
    official?: number
    total?: number
  }
  tcgOnline?: string
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

interface ScrydexImage {
  type?: string
  small?: string
  medium?: string
  large?: string
}

interface ScrydexTranslation {
  en?: {
    name?: string
    supertype?: string
    subtypes?: string[]
    types?: string[]
    rarity?: string
  }
}

interface ScrydexExpansion {
  id?: string
  name?: string
  code?: string
  total?: number
  printed_total?: number
  language?: string
  language_code?: string
  translation?: {
    en?: {
      name?: string
    }
  }
}

interface ScrydexCard {
  id: string
  name: string
  supertype?: string
  subtypes?: string[]
  hp?: string | number
  types?: string[]
  number?: string
  printed_number?: string
  rarity?: string
  artist?: string
  national_pokedex_numbers?: number[]
  images?: ScrydexImage[]
  expansion?: ScrydexExpansion
  language?: string
  language_code?: string
  translation?: ScrydexTranslation
}

interface ScrydexSearchResponse {
  status?: string
  data?: ScrydexCard[]
  page?: number
  pageSize?: number
  totalCount?: number
}

interface PokeApiSpeciesName {
  name: string
  language: {
    name: string
  }
}

interface PokeApiSpecies {
  id: number
  name: string
  names?: PokeApiSpeciesName[]
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
        const contentType = response.headers.get('content-type') ?? ''
        const isHtml = contentType.includes('text/html') || /^\s*<!doctype html/i.test(body)
        const detail = isHtml ? '' : body.trim().slice(0, 240)
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

function containsLatinLetter(value: string) {
  return /[A-Za-z]/.test(value)
}

function normalizedPokemonSearchName(value: string) {
  return normalizedText(stripPokemonCardSuffix(value))
}

async function resolveDexIdsFromEnglishName(name: string) {
  const wanted = normalizedPokemonSearchName(name)
  if (!wanted) return []

  // TCGdex's normal text filter is intentionally lax/contains-based. Keep that
  // behavior here so "Chari" can resolve to Charizard as well as "Charizard".
  const params = new URLSearchParams({ name: name.trim() })
  const briefs = await fetchJson<TcgDexBrief[]>(
    `https://api.tcgdex.net/v2/en/cards?${params.toString()}`,
    undefined,
    { attempts: 2, timeoutMs: 20_000 },
  )

  const matchingBriefs = briefs
    .filter((brief) =>
      normalizedPokemonSearchName(brief.name).includes(wanted),
    )
    .slice(0, 24)

  const dexIds = new Set<number>()

  for (let index = 0; index < matchingBriefs.length; index += 4) {
    const batch = matchingBriefs.slice(index, index + 4)
    const details = await Promise.all(
      batch.map(async (brief) => {
        try {
          return await fetchJson<TcgDexDetail>(
            `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(brief.id)}`,
            undefined,
            { attempts: 1, timeoutMs: 10_000 },
          )
        } catch {
          return null
        }
      }),
    )

    for (const detail of details) {
      if (!detail || detail.category !== 'Pokemon') continue

      const speciesName = normalizedPokemonSearchName(detail.name)
      if (!speciesName.includes(wanted)) continue

      for (const dexId of detail.dexId ?? []) {
        if (Number.isInteger(dexId) && dexId > 0) dexIds.add(dexId)
      }
    }
  }

  return [...dexIds]
}

async function resolveJapanesePokemonNames(dexIds: number[]) {
  const names = new Set<string>()

  const batches: number[][] = []
  for (let index = 0; index < dexIds.length; index += 4) {
    batches.push(dexIds.slice(index, index + 4))
  }

  for (const batch of batches) {
    const speciesResults = await Promise.all(
      batch.map(async (dexId) => {
        try {
          return await fetchJson<PokeApiSpecies>(
            `https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(String(dexId))}/`,
            undefined,
            { attempts: 2, timeoutMs: 15_000 },
          )
        } catch {
          return null
        }
      }),
    )

    for (const species of speciesResults) {
      if (!species) continue

      const japanese =
        species.names?.find((entry) => entry.language.name === 'ja-Hrkt')?.name ??
        species.names?.find((entry) => entry.language.name === 'ja')?.name ??
        null

      if (japanese) names.add(japanese)
    }
  }

  return [...names]
}

function unionBriefLists(lists: TcgDexBrief[][]) {
  const byId = new Map<string, TcgDexBrief>()

  for (const list of lists) {
    for (const brief of list) byId.set(brief.id, brief)
  }

  return [...byId.values()]
}

function intersectBriefLists(lists: TcgDexBrief[][]) {
  if (!lists.length) return []

  const [first, ...rest] = lists
  if (!rest.length) return first

  const remainingIds = rest.map((list) => new Set(list.map((brief) => brief.id)))

  return first.filter((brief) =>
    remainingIds.every((ids) => ids.has(brief.id)),
  )
}

async function fetchTcgdexBriefs(
  language: string,
  field: string,
  value: string,
) {
  const params = new URLSearchParams({ [field]: value })

  return fetchJson<TcgDexBrief[]>(
    `https://api.tcgdex.net/v2/${encodeURIComponent(language)}/cards?${params.toString()}`,
    undefined,
    { attempts: 2, timeoutMs: 20_000 },
  )
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


async function fetchTcgdexSet(language: string, setCode: string) {
  return fetchJson<TcgDexSet>(
    `https://api.tcgdex.net/v2/${encodeURIComponent(language)}/sets/${encodeURIComponent(setCode)}`,
    undefined,
    { attempts: 2, timeoutMs: 20_000 },
  )
}

function briefMatchesLocalizedNames(
  brief: TcgDexBrief,
  localizedNames: string[],
) {
  const cardName = normalizedText(brief.name)
  return localizedNames.some((name) =>
    cardName.includes(normalizedText(name)),
  )
}

function filterTcgdexBriefs(
  briefs: TcgDexBrief[],
  options: {
    number: string
    name: string
    crossLanguageEnglishName: boolean
    localizedSearchNames: string[]
  },
) {
  const {
    number,
    name,
    crossLanguageEnglishName,
    localizedSearchNames,
  } = options

  return briefs.filter((brief) => {
    if (
      number &&
      comparableCardNumber(String(brief.localId)) !==
        comparableCardNumber(number)
    ) {
      return false
    }

    if (name) {
      if (crossLanguageEnglishName) {
        if (!briefMatchesLocalizedNames(brief, localizedSearchNames)) {
          return false
        }
      } else if (
        !normalizedText(brief.name).includes(normalizedText(name))
      ) {
        return false
      }
    }

    return true
  })
}

async function enrichTcgdexBriefs(
  language: string,
  briefs: TcgDexBrief[],
) {
  const enriched: Array<{
    brief: TcgDexBrief
    detail: TcgDexDetail | null
  }> = []

  for (let index = 0; index < briefs.length; index += 4) {
    const batch = briefs.slice(index, index + 4)
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
          // The brief already matched all user-entered criteria.
          return { brief, detail: null }
        }
      }),
    )
    enriched.push(...batchResults)
  }

  return enriched
}
async function searchTcgdexLanguage(
  input: CatalogSearchInput,
  language: string,
): Promise<CardCatalogCandidate[]> {
  const itemLanguage = input.itemLanguage || 'Korean'
  const number = cardNumberNumerator(input.cardNumber)
  const setCode = input.setCode?.trim() || ''
  const name = input.name?.trim() || ''

  const crossLanguageEnglishName =
    Boolean(name) && language !== 'en' && containsLatinLetter(name)

  let resolvedDexIds: number[] = []
  let localizedSearchNames: string[] = []

  if (crossLanguageEnglishName) {
    resolvedDexIds = await resolveDexIdsFromEnglishName(name)
    if (!resolvedDexIds.length) return []

    if (language === 'ja') {
      localizedSearchNames = await resolveJapanesePokemonNames(resolvedDexIds)
    }

    // Do not silently ignore the user's English Pokemon name.
    if (!localizedSearchNames.length) return []
  }

  let matchedBriefs: TcgDexBrief[] = []

  if (setCode) {
    // A set code is a structural identifier, not a free-text card filter.
    // Fetch the set directly and filter its card list locally. TCGdex officially
    // exposes the complete card list on GET /sets/{setId}.
    const set = await fetchTcgdexSet(language, setCode)
    matchedBriefs = filterTcgdexBriefs(set.cards ?? [], {
      number,
      name,
      crossLanguageEnglishName,
      localizedSearchNames,
    })
  } else if (number) {
    // localId is not globally unique, so get every card with that local number
    // and apply the optional Pokemon-name criterion locally.
    const numberBriefs = await fetchTcgdexBriefs(
      language,
      'localId',
      number,
    )
    matchedBriefs = filterTcgdexBriefs(numberBriefs, {
      number,
      name,
      crossLanguageEnglishName,
      localizedSearchNames,
    })
  } else if (name) {
    if (crossLanguageEnglishName) {
      const nameLists = await Promise.all(
        localizedSearchNames.map((localizedName) =>
          fetchTcgdexBriefs(language, 'name', localizedName),
        ),
      )
      matchedBriefs = filterTcgdexBriefs(
        unionBriefLists(nameLists),
        {
          number,
          name,
          crossLanguageEnglishName,
          localizedSearchNames,
        },
      )
    } else {
      const nameBriefs = await fetchTcgdexBriefs(
        language,
        'name',
        name,
      )
      matchedBriefs = filterTcgdexBriefs(nameBriefs, {
        number,
        name,
        crossLanguageEnglishName,
        localizedSearchNames,
      })
    }
  }

  matchedBriefs = matchedBriefs.slice(0, 24)
  if (!matchedBriefs.length) return []

  const enriched = await enrichTcgdexBriefs(language, matchedBriefs)

  const englishNameCache = new Map<
    number,
    { pokemonNameEn: string | null; englishName: string | null }
  >()

  return Promise.all(
    enriched.map(async ({ brief, detail }) => {
      const localId = String(detail?.localId ?? brief.localId)
      const printedTotal = detail?.set?.cardCount?.official ?? null
      const variants = detail ? variantLabels(detail.variants) : []
      const setCodeValue =
        detail?.set?.id ?? brief.id.split('-')[0] ?? null
      const dexId = detail?.dexId?.[0] ?? null

      let pokemonNameEn: string | null = null
      let englishName: string | null = null

      if (language === 'en') {
        englishName = detail?.name ?? brief.name
        pokemonNameEn =
          detail?.category === 'Pokemon'
            ? stripPokemonCardSuffix(englishName)
            : null
      } else if (detail?.category === 'Pokemon' && dexId) {
        const resolved = await resolveEnglishPokemonNames(
          dexId,
          detail.suffix,
          englishNameCache,
        )
        pokemonNameEn = resolved.pokemonNameEn
        englishName = resolved.englishName
      }

      const snapshot = detail
        ? {
            provider: 'tcgdex',
            id: detail.id,
            localizedName: detail.name,
            localizedSearchNames,
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
            localizedSearchNames,
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


function scrydexLanguage(itemLanguage: string) {
  if (itemLanguage === 'Japanese' || itemLanguage === 'Korean') return 'ja'
  return 'en'
}

function scrydexHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  const apiKey = process.env.SCRYDEX_API_KEY?.trim()
  const teamId = process.env.SCRYDEX_TEAM_ID?.trim()

  if (apiKey) headers['X-Api-Key'] = apiKey
  if (teamId) headers['X-Team-ID'] = teamId

  return headers
}

function scrydexImageUrl(images: ScrydexImage[] | undefined) {
  const front =
    images?.find((image) => normalizedText(image.type) === 'front') ??
    images?.[0]

  return front?.large ?? front?.medium ?? front?.small ?? null
}

async function resolveEnglishSpeciesNameFromDexId(dexId: number | null) {
  if (!dexId) return null

  try {
    const species = await fetchJson<PokeApiSpecies>(
      `https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(String(dexId))}/`,
      undefined,
      { attempts: 1, timeoutMs: 10_000 },
    )

    return (
      species.names?.find((entry) => entry.language.name === 'en')?.name ??
      null
    )
  } catch {
    return null
  }
}

async function searchScrydex(
  input: CatalogSearchInput,
): Promise<CardCatalogCandidate[]> {
  const itemLanguage = input.itemLanguage || 'Korean'
  const language = scrydexLanguage(itemLanguage)
  const number = cardNumberNumerator(input.cardNumber)
  const setCode = input.setCode?.trim() || ''
  const name = input.name?.trim() || ''

  const clauses: string[] = []

  if (name) {
    // Japanese/Korean physical cards use the Japanese Scrydex catalog.
    // If the user typed an English name, search Scrydex's nested English
    // translation field instead of the Japanese card name.
    if (language === 'ja' && containsLatinLetter(name)) {
      clauses.push(`translation.en.name:${luceneValue(name)}`)
    } else {
      clauses.push(`name:${luceneValue(name)}`)
    }
  }

  if (number) clauses.push(`number:${luceneToken(number)}`)
  if (setCode) clauses.push(`expansion.code:${luceneValue(setCode)}`)

  if (!clauses.length) return []

  const params = new URLSearchParams({
    q: clauses.join(' '),
    page: '1',
    page_size: '24',
    select:
      'id,name,supertype,subtypes,hp,types,number,printed_number,rarity,artist,national_pokedex_numbers,images,expansion,language,language_code,translation',
  })

  const response = await fetchJson<ScrydexSearchResponse>(
    `https://api.scrydex.com/pokemon/v1/${encodeURIComponent(language)}/cards?${params.toString()}`,
    { headers: scrydexHeaders() },
    { attempts: 2, timeoutMs: 20_000 },
  )

  const cards = response.data ?? []
  const speciesCache = new Map<number, string | null>()

  return Promise.all(
    cards.slice(0, 24).map(async (card) => {
      const dexId = card.national_pokedex_numbers?.[0] ?? null

      let pokemonNameEn: string | null = null
      if (dexId) {
        if (speciesCache.has(dexId)) {
          pokemonNameEn = speciesCache.get(dexId) ?? null
        } else {
          pokemonNameEn = await resolveEnglishSpeciesNameFromDexId(dexId)
          speciesCache.set(dexId, pokemonNameEn)
        }
      }

      const englishName =
        card.translation?.en?.name ??
        (language === 'en' ? card.name : null)

      const setName =
        card.expansion?.translation?.en?.name ??
        card.expansion?.name ??
        null

      const setCode =
        card.expansion?.code ??
        card.expansion?.id ??
        null

      const printedTotal = card.expansion?.printed_total ?? null
      const cardNumber = card.number ?? null
      const numberDisplay =
        card.printed_number ??
        displayCardNumber(cardNumber, printedTotal)

      const snapshot = {
        provider: 'scrydex',
        id: card.id,
        localizedName: card.name,
        englishName,
        pokemonNameEn,
        supertype: card.supertype ?? null,
        subtypes: card.subtypes ?? [],
        hp: card.hp ?? null,
        types: card.types ?? [],
        illustrator: card.artist ?? null,
        nationalPokedexNumbers: card.national_pokedex_numbers ?? [],
        setId: card.expansion?.id ?? null,
        setCode,
        setName,
        localizedSetName: card.expansion?.name ?? null,
        printedTotal,
        setTotal: card.expansion?.total ?? null,
        printedNumber: card.printed_number ?? null,
        language: card.language ?? null,
        languageCode: card.language_code ?? null,
        translation: card.translation ?? null,
      }

      return {
        provider: 'scrydex' as const,
        providerCardId: card.id,
        catalogLanguage: language,
        matchType: catalogMatchType(itemLanguage, language),
        name: card.name,
        number: cardNumber,
        numberDisplay,
        setId: card.expansion?.id ?? null,
        setCode,
        setName,
        pokemonNameEn,
        englishName,
        rarity:
          card.translation?.en?.rarity ??
          card.rarity ??
          null,
        imageUrl: scrydexImageUrl(card.images),
        category:
          card.translation?.en?.supertype ??
          card.supertype ??
          null,
        illustrator: card.artist ?? null,
        hp: card.hp === undefined ? null : String(card.hp),
        types:
          card.translation?.en?.types ??
          card.types ??
          [],
        variants:
          card.translation?.en?.subtypes ??
          card.subtypes ??
          [],
        snapshot,
      } satisfies CardCatalogCandidate
    }),
  )
}

async function searchPokemonTcg(input: CatalogSearchInput): Promise<CardCatalogCandidate[]> {
  const clauses: string[] = []
  const number = cardNumberNumerator(input.cardNumber)
  const setCode = input.setCode?.trim() || ''

  if (input.name) clauses.push(`name:${luceneValue(input.name.trim())}`)
  if (number) clauses.push(`number:${luceneToken(number)}`)
  if (setCode) clauses.push(`set.ptcgoCode:${luceneValue(setCode)}`)
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
      if (input.name && !normalizedText(card.name).includes(normalizedText(input.name))) {
        return false
      }
      if (number && comparableCardNumber(card.number) !== comparableCardNumber(number)) {
        return false
      }
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

  let tcgdex: CardCatalogCandidate[] = []
  try {
    tcgdex = await searchTcgdex(input)
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `TCGdex: ${error.message}`
        : 'TCGdex konnte nicht abgefragt werden.',
    )
  }

  if (tcgdex.length) {
    return {
      candidates: tcgdex.slice(0, 24),
      warnings,
      tcgdexLanguage:
        input.itemLanguage === 'Korean'
          ? 'ja'
          : tcgdexCatalogLanguage(input.itemLanguage || 'Korean'),
    }
  }

  let scrydex: CardCatalogCandidate[] = []
  if (input.includeFallback !== false) {
    try {
      scrydex = await searchScrydex(input)
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Scrydex: ${error.message}`
          : 'Scrydex konnte nicht abgefragt werden.',
      )
    }
  }

  if (scrydex.length) {
    return {
      candidates: scrydex.slice(0, 24),
      warnings,
      tcgdexLanguage:
        input.itemLanguage === 'Korean'
          ? 'ja'
          : tcgdexCatalogLanguage(input.itemLanguage || 'Korean'),
    }
  }

  // pokemontcg.io is kept only as an opt-in legacy fallback. Scrydex is the
  // successor service and has much stronger Japanese coverage, so the unstable
  // legacy API should not produce 500/502 warnings during normal searches.
  let legacy: CardCatalogCandidate[] = []
  if (
    input.includeFallback !== false &&
    process.env.ENABLE_LEGACY_POKEMON_TCG_FALLBACK === '1'
  ) {
    try {
      legacy = await searchPokemonTcg(input)
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Pokémon TCG API (Legacy): ${error.message}`
          : 'Pokémon TCG API (Legacy) konnte nicht abgefragt werden.',
      )
    }
  }

  return {
    candidates: legacy.slice(0, 24),
    warnings,
    tcgdexLanguage:
      input.itemLanguage === 'Korean'
        ? 'ja'
        : tcgdexCatalogLanguage(input.itemLanguage || 'Korean'),
  }
}

