const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function patchSyncLimit() {
  const rel =
    'app/api/purchases/bunjang-order-sync/route.ts'
  const file = path.join(appRoot, rel)

  if (!fs.existsSync(file)) {
    throw new Error(`Datei nicht gefunden: ${rel}`)
  }

  let src = fs.readFileSync(file, 'utf8')

  const before = src
  src = src.replace(
    /records:\s*z\.array\(recordSchema\)\.min\(1\)\.max\(200\)/,
    'records: z.array(recordSchema).min(1).max(500)',
  )

  if (src === before) {
    if (src.includes('.max(500)')) {
      console.log(`Bereits korrekt: ${rel}`)
      return
    }

    throw new Error(
      'v64: Bunjang-Order-Sync-Limit konnte nicht von 200 auf 500 angehoben werden.',
    )
  }

  const backup = `${file}.bak-v64`
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup)
  }

  fs.writeFileSync(file, src)
  console.log(
    `Aktualisiert: ${rel} (Batch-Limit 500)`,
  )
}

function patchImporterHint() {
  const rel =
    'components/bunjang-order-importer.tsx'
  const file = path.join(appRoot, rel)

  if (!fs.existsSync(file)) {
    throw new Error(`Datei nicht gefunden: ${rel}`)
  }

  let src = fs.readFileSync(file, 'utf8')

  if (src.includes('Bulk-/Smart-Sync')) {
    console.log(`Bereits korrekt: ${rel}`)
    return
  }

  const oldText =
    'Der Order-Extractor lädt die Bestelldetailseiten automatisch. Nach dem'

  if (!src.includes(oldText)) {
    console.log(
      `Hinweis: Textanker in ${rel} nicht gefunden; UI-Hinweis wird übersprungen.`,
    )
    return
  }

  src = src.replace(
    oldText,
    'Der Bulk-/Smart-Sync lädt neue Bestellungen und bekannte Orders ohne Tracking automatisch. Nach dem',
  )

  const backup = `${file}.bak-v64`
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup)
  }

  fs.writeFileSync(file, src)
  console.log(`Aktualisiert: ${rel}`)
}

patchSyncLimit()
patchImporterHint()
console.log(
  'v64: Bunjang Bulk-/Smart-Sync vorbereitet.',
)
