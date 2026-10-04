const fs = require('fs')
const path = require('path')

const root = process.argv[2]
if (!root) throw new Error('App-Root fehlt.')
const file = path.join(root, 'components', 'inventory-workspace.tsx')
if (!fs.existsSync(file)) throw new Error(`Nicht gefunden: ${file}`)

let src = fs.readFileSync(file, 'utf8')
const original = src
const notes = []

function ensureImport(importLine) {
  if (src.includes(importLine)) {
    notes.push(`Import bereits vorhanden: ${importLine}`)
    return
  }

  const preferred = "import { createClient } from '@/lib/supabase/client'"
  const preferredIndex = src.indexOf(preferred)
  if (preferredIndex >= 0) {
    const insertAt = preferredIndex + preferred.length
    src = src.slice(0, insertAt) + `\n${importLine}` + src.slice(insertAt)
    notes.push(`Import ergänzt: ${importLine}`)
    return
  }

  const importMatches = [...src.matchAll(/^import .*$/gm)]
  if (!importMatches.length) throw new Error(`Import-Marker nicht gefunden für: ${importLine}`)
  const last = importMatches[importMatches.length - 1]
  const insertAt = last.index + last[0].length
  src = src.slice(0, insertAt) + `\n${importLine}` + src.slice(insertAt)
  notes.push(`Import ergänzt (Fallback): ${importLine}`)
}

ensureImport("import { InventoryCatalogPicker } from '@/components/inventory-catalog-picker'")
ensureImport("import { InventoryLanguageFlag } from '@/components/inventory-language-flag'")

if (!src.includes('<InventoryCatalogPicker')) {
  const block = `          {mode === 'create' ? (\n            <InventoryCatalogPicker\n              initialName={draft.itemName}\n              initialCardNumber={draft.cardNumber}\n              initialSetCode={draft.setCode}\n              language={draft.language}\n              onSelect={(candidate) => {\n                setDraft((current) => {\n                  const resolvedPokemonName = candidate.pokemonNameEn?.trim() || ''\n                  const resolvedItemName =\n                    candidate.matchType === 'exact_language'\n                      ? candidate.name\n                      : current.itemName.trim() || candidate.englishName || candidate.name\n                  const resolvedSpecies = resolvedPokemonName\n                    ? deriveSpeciesFromEditableFields(resolvedItemName, resolvedPokemonName)\n                    : []\n                  return {\n                    ...current,\n                    itemName: resolvedItemName,\n                    pokemonNameEn: resolvedPokemonName || current.pokemonNameEn,\n                    pokemonSpecies: resolvedSpecies.length\n                      ? resolvedSpecies.join(', ')\n                      : current.pokemonSpecies,\n                    setName: candidate.setName || current.setName,\n                    setCode: candidate.setCode || current.setCode,\n                    cardNumber: candidate.number || current.cardNumber,\n                    rarity: candidate.rarity || current.rarity,\n                  }\n                })\n              }}\n            />\n          ) : null}\n`

  const primaryMarkers = [
    '          <div className="inv-editor-grid inv-editor-grid-primary">',
    '        <div className="inv-editor-grid inv-editor-grid-primary">',
    '<div className="inv-editor-grid inv-editor-grid-primary">',
  ]

  let index = -1
  for (const marker of primaryMarkers) {
    index = src.indexOf(marker)
    if (index >= 0) break
  }

  if (index < 0) {
    const formMatch = src.match(/<form\b[^>]*className=["'][^"']*inv-editor-form[^"']*["'][^>]*>/)
    if (!formMatch || formMatch.index === undefined) {
      throw new Error('Katalog-UI: Weder Primary-Grid noch inv-editor-form gefunden.')
    }
    index = formMatch.index + formMatch[0].length
    src = src.slice(0, index) + `\n${block}` + src.slice(index)
    notes.push('Kartenkatalog in Create-Dialog eingefügt (Form-Fallback).')
  } else {
    src = src.slice(0, index) + block + src.slice(index)
    notes.push('Kartenkatalog in Create-Dialog eingefügt.')
  }
} else {
  notes.push('Kartenkatalog bereits im Inventar-Dialog vorhanden.')
}

if (src.includes('<InventoryLanguageFlag language={row.language}')) {
  notes.push('Sprachflaggen-Ausgabe bereits vorhanden.')
} else {
  const tdRegex = /<td\b[^>]*>[\s\S]*?<\/td>/g
  const matches = [...src.matchAll(tdRegex)]
  const candidates = matches.filter((match) => {
    const block = match[0]
    if (!block.includes('row.language')) return false
    if (block.includes('<input') || block.includes('<select') || block.includes('onChange=')) return false
    return true
  })

  if (candidates.length) {
    let changed = 0
    src = src.replace(tdRegex, (block) => {
      if (!block.includes('row.language')) return block
      if (block.includes('<input') || block.includes('<select') || block.includes('onChange=')) return block
      if (block.includes('InventoryLanguageFlag')) return block
      const parts = block.match(/^(<td\b[^>]*>)[\s\S]*?(<\/td>)$/)
      if (!parts) return block
      changed += 1
      return `${parts[1]}<InventoryLanguageFlag language={row.language} />${parts[2]}`
    })
    if (!changed) throw new Error('Sprachflagge: Kandidaten gefunden, aber keine Tabellenzelle konnte ersetzt werden.')
    notes.push(`Sprachflaggen in ${changed} Tabellenzelle(n) aktiviert.`)
  } else {
    // Fallback: nur im Tabellenbereich nach einfachen row.language-Ausgaben suchen.
    const tableStart = src.indexOf('<table')
    const tableEnd = tableStart >= 0 ? src.indexOf('</table>', tableStart) : -1
    if (tableStart >= 0 && tableEnd > tableStart) {
      const before = src.slice(0, tableStart)
      let table = src.slice(tableStart, tableEnd + '</table>'.length)
      const after = src.slice(tableEnd + '</table>'.length)
      const expressions = [
        /\{\s*row\.language\s*\|\|\s*['\"]–['\"]\s*\}/,
        /\{\s*row\.language\s*\?\?\s*['\"]–['\"]\s*\}/,
        /\{\s*row\.language\s*\}/,
      ]
      let replaced = false
      for (const rx of expressions) {
        if (rx.test(table)) {
          table = table.replace(rx, '<InventoryLanguageFlag language={row.language} />')
          replaced = true
          break
        }
      }
      if (replaced) {
        src = before + table + after
        notes.push('Sprachflagge über Tabellen-Fallback aktiviert.')
      } else {
        const contexts = src
          .split(/\r?\n/)
          .map((line, index) => ({ line, no: index + 1 }))
          .filter(({ line }) => line.includes('row.language'))
          .slice(0, 12)
          .map(({ line, no }) => `${no}: ${line.trim()}`)
          .join('\n')
        throw new Error(
          `Sprachflagge: Keine darstellende Tabellenzelle gefunden. Gefundene row.language-Stellen:\n${contexts || '(keine)'}`,
        )
      }
    } else {
      throw new Error('Sprachflagge: Inventartabelle nicht gefunden.')
    }
  }
}

if (src === original) {
  console.log('inventory-workspace.tsx war bereits vollständig gepatcht.')
  for (const note of notes) console.log(`  - ${note}`)
  process.exit(0)
}

const backup = `${file}.bak-inventory-catalog-flags-v35`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
fs.writeFileSync(file, src)
console.log('inventory-workspace.tsx aktualisiert.')
for (const note of notes) console.log(`  - ${note}`)
console.log(`Backup: ${backup}`)
