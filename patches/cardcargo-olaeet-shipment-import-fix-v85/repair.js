const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) {
  throw new Error('APP_ROOT fehlt.')
}

const rel = 'app/(app)/shipments/new/page.tsx'
const file = path.join(appRoot, rel)

if (!fs.existsSync(file)) {
  throw new Error(`Datei nicht gefunden: ${rel}`)
}

let source = fs.readFileSync(file, 'utf8')
const original = source

const importStatement =
  "import { OlaeetShipmentExtractionImporter } from '@/components/olaeet-shipment-extraction-importer'"

// v84 could insert the line inside a multiline import. Remove every existing
// copy first; this restores the interrupted import declaration.
source = source
  .split(/\r?\n/)
  .filter(
    (line) =>
      line.trim() !== importStatement,
  )
  .join('\n')

// Keep a leading Next.js directive such as 'use client' in first position.
// Otherwise the import can safely be the first module statement.
const directiveMatch = source.match(
  /^(\uFEFF?\s*(?:'use client'|"use client");?\s*\n+)/,
)

if (directiveMatch) {
  const at = directiveMatch[0].length
  source =
    source.slice(0, at) +
    `${importStatement}\n` +
    source.slice(at)
} else {
  source =
    `${importStatement}\n` +
    source.replace(/^\uFEFF?/, '')
}

// Normalize excessive blank lines around the new first import only.
source = source.replace(
  `${importStatement}\n\n\n`,
  `${importStatement}\n\n`,
)

if (!source.includes('<OlaeetShipmentExtractionImporter')) {
  throw new Error(
    'Die OLAEET-Importer-Komponente wird auf der Sendungsseite nicht verwendet. ' +
      'v85 bricht ab, statt eine unbekannte Dateiversion zu verändern.',
  )
}

const backup = `${file}.bak-v85`
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup)
}

fs.writeFileSync(file, source)

if (source === original) {
  console.log(`Bereits korrekt: ${rel}`)
} else {
  console.log(`Repariert: ${rel}`)
}

console.log(
  'OLAEET-Importer-Import wurde an eine sichere Modulposition verschoben.',
)
