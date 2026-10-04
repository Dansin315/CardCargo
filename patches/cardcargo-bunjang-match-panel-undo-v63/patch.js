const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'components/purchase-import-form.tsx'
const file = path.join(appRoot, rel)

if (!fs.existsSync(file)) {
  throw new Error(`Datei nicht gefunden: ${rel}`)
}

let src = fs.readFileSync(file, 'utf8')

const backup = `${file}.bak-v63`
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup)
}

// ---------------------------------------------------------------------------
// 1. Find the existing server-match component block, remove it from wherever
// v62 placed it, then insert it inside section 3.
// ---------------------------------------------------------------------------

const matchBlockRe =
  /[ \t]*<BunjangExistingPurchaseMatches[\s\S]*?\/>[ \t]*\n?/

const matchBlockMatch = src.match(matchBlockRe)

if (!matchBlockMatch) {
  throw new Error(
    'v63: BunjangExistingPurchaseMatches-Block aus v62 nicht gefunden.',
  )
}

let matchBlock = matchBlockMatch[0].trim()

// Add onClear if it is not already present.
if (!matchBlock.includes('onClear=')) {
  matchBlock = matchBlock.replace(
    /\s*\/>$/,
    `
              onClear={() => {
                setExistingBunjangTarget(null)
                setSelectedBunjangOrder(null)
                setBunjangOrderMessage(
                  'Bestellzuordnung entfernt. Beim Speichern wird dieser bestehende Einkauf nicht mehr automatisch ergänzt.',
                )
              }}
            />`,
  )
}

// Remove old placement.
src = src.replace(matchBlockRe, '')

// Identify section 3 by heading, independent of surrounding formatting.
const heading = '<h2>Bunjang-Bestelldaten</h2>'
const headingIndex = src.indexOf(heading)

if (headingIndex < 0) {
  throw new Error('v63: Abschnitt 3 „Bunjang-Bestelldaten“ nicht gefunden.')
}

const sectionStart = src.lastIndexOf('<section className="panel">', headingIndex)
if (sectionStart < 0) {
  throw new Error('v63: Start von Abschnitt 3 nicht gefunden.')
}

const sectionEnd = src.indexOf('</section>', headingIndex)
if (sectionEnd < 0) {
  throw new Error('v63: Ende von Abschnitt 3 nicht gefunden.')
}

// Normalize indentation of the reinserted component.
const indentedBlock = matchBlock
  .split('\n')
  .map((line) => `            ${line.trimStart()}`)
  .join('\n')

src =
  src.slice(0, sectionEnd) +
  `\n\n${indentedBlock}\n          ` +
  src.slice(sectionEnd)

// ---------------------------------------------------------------------------
// 2. Make the local-cache note less confusing when a server-side DB match is
// shown directly below it.
// ---------------------------------------------------------------------------

src = src.replace(
  'Keine ausreichend ähnliche Bestellung im lokalen Bunjang-Cache gefunden.',
  'Keine passende Bestellung im lokalen Extraction-Cache gefunden. Bereits gespeicherte CardCargo-Bestellungen werden zusätzlich darunter geprüft.',
)

src = src.replace(
  'Keine passende Bestellung im lokalen Extraction-Cache gefunden.',
  'Keine passende Bestellung im lokalen Extraction-Cache gefunden. Bereits gespeicherte CardCargo-Bestellungen werden zusätzlich darunter geprüft.',
)

// Avoid duplicated suffix if the replacement ran twice.
src = src.replace(
  'Keine passende Bestellung im lokalen Extraction-Cache gefunden. Bereits gespeicherte CardCargo-Bestellungen werden zusätzlich darunter geprüft. Bereits gespeicherte CardCargo-Bestellungen werden zusätzlich darunter geprüft.',
  'Keine passende Bestellung im lokalen Extraction-Cache gefunden. Bereits gespeicherte CardCargo-Bestellungen werden zusätzlich darunter geprüft.',
)

fs.writeFileSync(file, src)

console.log('v63: Bestehende Bunjang-Matches in Abschnitt 3 verschoben.')
console.log('v63: Ausgewählter DB-Treffer kann über „Auswahl rückgängig“ entfernt werden.')
