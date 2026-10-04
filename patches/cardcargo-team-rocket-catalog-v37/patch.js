const fs = require('fs')
const path = require('path')

const appRoot = path.resolve(process.argv[2] || '')
const filePath = path.join(appRoot, 'lib', 'card-catalog-server.ts')

if (!appRoot || !fs.existsSync(filePath)) {
  throw new Error(`card-catalog-server.ts nicht gefunden: ${filePath}`)
}

let source = fs.readFileSync(filePath, 'utf8')
const original = source
const changes = []

function requireMarker(marker, label) {
  const index = source.indexOf(marker)
  if (index < 0) {
    throw new Error(`${label}: erwarteter Code-Marker wurde nicht gefunden.`)
  }
  return index
}

function replaceInFunction(functionStartMarker, functionEndMarker, replacer, label) {
  const start = requireMarker(functionStartMarker, label)
  const end = source.indexOf(functionEndMarker, start)
  if (end < 0) {
    throw new Error(`${label}: Funktionsende wurde nicht gefunden.`)
  }

  const before = source.slice(0, start)
  const block = source.slice(start, end)
  const after = source.slice(end)
  const nextBlock = replacer(block)

  if (nextBlock === block) return false
  source = before + nextBlock + after
  changes.push(label)
  return true
}

// 1) Modern "Team Rocket's" cards use the same Japanese ownership prefix
// as the existing Rocket's mapping.
if (!source.includes(`"team rocket's": ['ロケット団の', 'R団の']`)) {
  const rocketLine = /(\n\s*"rocket's":\s*\[\s*'ロケット団の'\s*,\s*'R団の'\s*\]\s*,)/
  if (!rocketLine.test(source)) {
    throw new Error(
      `Team-Rocket-Praefix: bestehende "rocket's"-Zuordnung wurde nicht gefunden.`,
    )
  }
  source = source.replace(
    rocketLine,
    `$1\n  "team rocket's": ['ロケット団の', 'R団の'],`,
  )
  changes.push(`Team Rocket's -> ロケット団の`)
}

// 2) Parse spelling variants:
//    Team Rocket's Mewtwo
//    Team Rocket’s Mewtwo
//    Team Rocket Mewtwo
//    Team Rockets Mewtwo
if (!source.includes('function parseTeamRocketSearch(value: string)')) {
  const marker = 'function knownEnglishCardNameModifier(value: string) {'
  const index = requireMarker(marker, 'Team-Rocket-Helfer')
  const helpers = `function parseTeamRocketSearch(value: string) {
  const clean = value
    .trim()
    .replace(/[’]/gu, "'")
    .replace(/\\s+/gu, ' ')

  const match = clean.match(/^team\\s+rocket(?:'?s)?(?:\\s+(.+))?$/iu)
  if (!match) return null

  const subject = String(match[1] ?? '').trim()
  return {
    subject: subject || null,
  }
}

function normalizeTeamRocketEnglishLookup(value: string) {
  const parsed = parseTeamRocketSearch(value)
  if (!parsed) return value.trim()

  return parsed.subject
    ? \`Team Rocket's \${parsed.subject}\`
    : 'Team Rocket'
}

`
  source = source.slice(0, index) + helpers + source.slice(index)
  changes.push('Team-Rocket-Suchaliase')
}

// 3) Ensure Team Rocket searches are treated as card-name/modifier searches,
// never as a Pokemon species such as a hypothetical "Team Rocket Mewtwo".
{
  const startMarker = 'function knownEnglishCardNameModifier(value: string) {'
  const endMarker = '\nfunction isPortablePokemonCardSuffix'
  const start = requireMarker(startMarker, 'Modifier-Erkennung')
  const end = source.indexOf(endMarker, start)
  if (end < 0) {
    throw new Error('Modifier-Erkennung: Ende wurde nicht gefunden.')
  }

  const current = source.slice(start, end)
  const replacement = `function knownEnglishCardNameModifier(value: string) {
  const normalized = normalizedEnglishModifier(value)

  if (parseTeamRocketSearch(normalized)) {
    return "team rocket's"
  }

  return Object.keys(JAPANESE_CARD_NAME_PREFIXES).find(
    (modifier) =>
      normalized === modifier ||
      normalized.startsWith(\`\${modifier} \`),
  ) ?? null
}
`

  if (current !== replacement) {
    source = source.slice(0, start) + replacement + source.slice(end)
    changes.push('Team Rocket als Kartenmodifier')
  }
}

// 4) Cross-language search:
// - generic "Team Rocket" -> search the Japanese ownership prefix directly
// - Team Rocket + species -> resolve the species through PokeAPI and prepend
//   ロケット団の, avoiding dependence on punctuation in the English TCGdex query.
replaceInFunction(
  'async function resolveCrossLanguageEnglishName(name: string) {',
  '\nfunction unionBriefLists',
  (block) => {
    let next = block

    if (!next.includes('const teamRocketSearch = parseTeamRocketSearch(cleanName)')) {
      const marker = '  // Fast and robust path for exact English species names.'
      const index = next.indexOf(marker)
      if (index < 0) {
        throw new Error(
          'Cross-Language-Team-Rocket: Einfuegemarker wurde nicht gefunden.',
        )
      }

      const insertion = `  const teamRocketSearch = parseTeamRocketSearch(cleanName)
  if (teamRocketSearch) {
    const rocketPrefixes =
      JAPANESE_CARD_NAME_PREFIXES["team rocket's"] ?? ['ロケット団の']

    // "Team Rocket" alone intentionally means every Team Rocket Pokemon card.
    if (!teamRocketSearch.subject) {
      return {
        mode: 'card-name',
        dexIds: [],
        localizedSearchNames: [...new Set(rocketPrefixes)],
      } satisfies CrossLanguageNamePlan
    }

    // For "Team Rocket Mewtwo", "Team Rocket's Mewtwo ex", etc. resolve only
    // the Pokemon part and then build the actual Japanese printed card name.
    const speciesPlan = await resolveExactEnglishPokemonSpecies(
      teamRocketSearch.subject,
    )

    if (speciesPlan?.localizedSearchNames.length) {
      return {
        mode: 'card-name',
        dexIds: speciesPlan.dexIds,
        localizedSearchNames: [
          ...new Set(
            rocketPrefixes.flatMap((prefix) =>
              speciesPlan.localizedSearchNames.map(
                (localizedName) => \`\${prefix}\${localizedName}\`,
              ),
            ),
          ),
        ],
      } satisfies CrossLanguageNamePlan
    }
  }

  const englishLookupName = normalizeTeamRocketEnglishLookup(cleanName)

`
      next = next.slice(0, index) + insertion + next.slice(index)
    }

    if (
      next.includes('fetchEnglishPokemonDetailsByName(cleanName)') &&
      !next.includes('fetchEnglishPokemonDetailsByName(englishLookupName)')
    ) {
      next = next.replace(
        'fetchEnglishPokemonDetailsByName(cleanName)',
        'fetchEnglishPokemonDetailsByName(englishLookupName)',
      )
    }

    return next
  },
  'Cross-Language-Team-Rocket',
)

// 5) English catalog searches should accept "Team Rocket Mewtwo" as an alias
// for the actual English printed name "Team Rocket's Mewtwo".
replaceInFunction(
  'async function searchTcgdexLanguage(',
  '\nfunction interleaveCatalogCandidates',
  (block) => {
    if (block.includes("const rawName = input.name?.trim() || ''")) return block

    const oldLine = "  const name = input.name?.trim() || ''"
    if (!block.includes(oldLine)) {
      throw new Error(
        'Englische-Team-Rocket-Aliase: name-Zeile wurde nicht gefunden.',
      )
    }

    return block.replace(
      oldLine,
      `  const rawName = input.name?.trim() || ''
  const name =
    language === 'en'
      ? normalizeTeamRocketEnglishLookup(rawName)
      : rawName`,
    )
  },
  'Englische-Team-Rocket-Aliase',
)

if (source === original) {
  console.log('Keine Aenderung notwendig: Team-Rocket-Fix ist bereits vorhanden.')
  process.exit(0)
}

const backupPath = `${filePath}.bak-team-rocket-v37`
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(filePath, backupPath)
}

fs.writeFileSync(filePath, source, 'utf8')

console.log('Team-Rocket-Katalogfix erfolgreich angewendet:')
console.log(`  Datei:  ${filePath}`)
console.log(`  Backup: ${backupPath}`)
for (const change of changes) {
  console.log(`  - ${change}`)
}

console.log('')
console.log('Unterstuetzte Suchbeispiele:')
console.log("  Team Rocket's Mewtwo")
console.log('  Team Rocket Mewtwo')
console.log('  Team Rockets Mewtwo')
console.log("  Team Rocket's Mimikyu")
console.log('  Team Rocket')
