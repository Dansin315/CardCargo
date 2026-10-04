const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel =
  'app/api/purchases/bunjang-order-sync/route.ts'
const file = path.join(appRoot, rel)

if (!fs.existsSync(file)) {
  throw new Error(`Datei nicht gefunden: ${rel}`)
}

let src = fs.readFileSync(file, 'utf8')

if (
  src.includes('manualOnly: z.boolean().default(false)') &&
  src.includes('if (!purchase && !input.manualOnly)')
) {
  console.log(
    'v71: manualOnly-Schutz ist bereits vorhanden.',
  )
  process.exit(0)
}

const backup = `${file}.bak-v71`
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup)
}

// Add input switch.
const inputAnchor =
  "  autoAssignOlaeet: z.boolean().default(true),"

if (!src.includes(inputAnchor)) {
  throw new Error(
    'v71: autoAssignOlaeet im Sync-inputSchema nicht gefunden.',
  )
}

src = src.replace(
  inputAnchor,
  `${inputAnchor}
  manualOnly: z.boolean().default(false),`,
)

// Guard the existing heuristic block.
// The v56+ route contains:
//   if (!purchase) {
//     const scored = purchases...
const heuristicNeedle =
  "      if (!purchase) {\n        const scored = purchases"

if (src.includes(heuristicNeedle)) {
  src = src.replace(
    heuristicNeedle,
    "      if (!purchase && !input.manualOnly) {\n        const scored = purchases",
  )
} else {
  const regex =
    /(\s+)if \(!purchase\) \{\s+const scored = purchases/

  if (!regex.test(src)) {
    throw new Error(
      'v71: Heuristik-Block im Bunjang-Sync nicht gefunden.',
    )
  }

  src = src.replace(
    regex,
    (full, indent) =>
      `${indent}if (!purchase && !input.manualOnly) {\n${indent}  const scored = purchases`,
  )
}

fs.writeFileSync(file, src)

console.log(
  'v71: Nicht ausgewählte Orders können jetzt ohne automatische Bestands-Heuristik verarbeitet werden.',
)
