const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'app/(app)/shipments/new/page.tsx'
const file = path.join(appRoot, rel)

if (!fs.existsSync(file)) {
  throw new Error(`Datei nicht gefunden: ${rel}`)
}

const importStatement =
  "import { OlaeetShipmentExtractionImporter } from '@/components/olaeet-shipment-extraction-importer'"

let source = fs.readFileSync(file, 'utf8')

// Remove any misplaced/duplicate copy left by v84/v85 before re-inserting.
source = source
  .split(/\r?\n/)
  .filter(
    (line) => line.trim() !== importStatement,
  )
  .join('\n')

const directive = source.match(
  /^(\uFEFF?\s*(?:'use client'|"use client");?\s*\n+)/,
)

if (directive) {
  const at = directive[0].length
  source =
    source.slice(0, at) +
    `${importStatement}\n` +
    source.slice(at)
} else {
  source =
    `${importStatement}\n` +
    source.replace(/^\uFEFF?/, '')
}

if (
  !source.includes(
    '<OlaeetShipmentExtractionImporter',
  )
) {
  const headerIndex = source.indexOf('</header>')

  if (headerIndex < 0) {
    throw new Error(
      'v87: Kein sicherer Einfügepunkt für den OLAEET-Importer gefunden.',
    )
  }

  const at = headerIndex + '</header>'.length
  source =
    source.slice(0, at) +
    '\n      <OlaeetShipmentExtractionImporter />\n' +
    source.slice(at)
}

source = source
  .replace(
    /Internationale Sendungen erfassen/g,
    'Internationale Sendungen importieren',
  )
  .replace(
    /Internationale Sendung erfassen/g,
    'Internationale Sendung importieren',
  )

const backup = `${file}.bak-v87`
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup)
}

fs.writeFileSync(file, source)
console.log(`Aktualisiert: ${rel}`)
