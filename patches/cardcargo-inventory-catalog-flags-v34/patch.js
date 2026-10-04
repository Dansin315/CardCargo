const fs = require('fs')
const path = require('path')

const root = process.argv[2]
if (!root) throw new Error('App-Root fehlt.')
const file = path.join(root, 'components', 'inventory-workspace.tsx')
if (!fs.existsSync(file)) throw new Error(`Nicht gefunden: ${file}`)
let src = fs.readFileSync(file, 'utf8')
const original = src

function insertAfterOnce(marker, addition, label) {
  if (src.includes(addition.trim())) return
  const index = src.indexOf(marker)
  if (index < 0) throw new Error(`${label}: Marker nicht gefunden: ${marker}`)
  src = src.slice(0, index + marker.length) + addition + src.slice(index + marker.length)
}

insertAfterOnce(
  "import { createClient } from '@/lib/supabase/client'",
  "\nimport { InventoryCatalogPicker } from '@/components/inventory-catalog-picker'\nimport { InventoryLanguageFlag } from '@/components/inventory-language-flag'",
  'Imports',
)

if (!src.includes('<InventoryCatalogPicker')) {
  const marker = '          <div className="inv-editor-grid inv-editor-grid-primary">'
  const index = src.indexOf(marker)
  if (index < 0) throw new Error('Katalog-UI: Formularmarker nicht gefunden.')
  const block = `          {mode === 'create' ? (\n            <InventoryCatalogPicker\n              initialName={draft.itemName}\n              initialCardNumber={draft.cardNumber}\n              initialSetCode={draft.setCode}\n              language={draft.language}\n              onSelect={(candidate) => {\n                setDraft((current) => {\n                  const resolvedPokemonName = candidate.pokemonNameEn?.trim() || ''\n                  const resolvedItemName =\n                    candidate.matchType === 'exact_language'\n                      ? candidate.name\n                      : current.itemName.trim() || candidate.englishName || candidate.name\n                  const resolvedSpecies = resolvedPokemonName\n                    ? deriveSpeciesFromEditableFields(resolvedItemName, resolvedPokemonName)\n                    : []\n                  return {\n                    ...current,\n                    itemName: resolvedItemName,\n                    pokemonNameEn: resolvedPokemonName || current.pokemonNameEn,\n                    pokemonSpecies: resolvedSpecies.length\n                      ? resolvedSpecies.join(', ')\n                      : current.pokemonSpecies,\n                    setName: candidate.setName || current.setName,\n                    setCode: candidate.setCode || current.setCode,\n                    cardNumber: candidate.number || current.cardNumber,\n                    rarity: candidate.rarity || current.rarity,\n                  }\n                })\n              }}\n            />\n          ) : null}\n`
  src = src.slice(0, index) + block + src.slice(index)
}

if (!src.includes('<InventoryLanguageFlag language={row.language}')) {
  const exact = "<td>{row.language || '–'}</td>"
  if (src.includes(exact)) {
    src = src.replace(exact, '<td><InventoryLanguageFlag language={row.language} /></td>')
  } else {
    // tolerate a simple pre-existing text wrapper around row.language
    const rx = /<td(?:\s+[^>]*)?>\s*\{row\.language\s*\|\|\s*['\"]–['\"]\}\s*<\/td>/
    if (!rx.test(src)) {
      throw new Error('Sprachflagge: Tabellenzelle mit row.language nicht eindeutig gefunden.')
    }
    src = src.replace(rx, '<td><InventoryLanguageFlag language={row.language} /></td>')
  }
}

if (src === original) {
  console.log('inventory-workspace.tsx war bereits vollständig gepatcht.')
  process.exit(0)
}
const backup = `${file}.bak-inventory-catalog-flags-v34`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
fs.writeFileSync(file, src)
console.log('inventory-workspace.tsx aktualisiert.')
