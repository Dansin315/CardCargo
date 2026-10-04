const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function patchImporterHint() {
  const rel =
    'components/bunjang-order-importer.tsx'
  const file = path.join(appRoot, rel)

  if (!fs.existsSync(file)) {
    throw new Error(`Datei nicht gefunden: ${rel}`)
  }

  let src = fs.readFileSync(file, 'utf8')

  if (
    src.includes(
      'klickbare Kaufkarten automatisch einer Bunjang-Bestellnummer zuordnen',
    )
  ) {
    console.log(`Bereits korrekt: ${rel}`)
    return
  }

  const anchor =
    'Der Bulk-/Smart-Sync lädt neue Bestellungen und bekannte Orders ohne Tracking automatisch.'

  if (!src.includes(anchor)) {
    console.log(
      `Hinweis: v64-Infotext in ${rel} nicht gefunden; UI-Hinweis wird übersprungen.`,
    )
    return
  }

  src = src.replace(
    anchor,
    `${anchor} v65 kann zusätzlich klickbare Kaufkarten automatisch einer Bunjang-Bestellnummer zuordnen, auch wenn die Übersicht keinen normalen Bestell-Link enthält.`,
  )

  const backup = `${file}.bak-v65`
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup)
  }

  fs.writeFileSync(file, src)
  console.log(`Aktualisiert: ${rel}`)
}

patchImporterHint()
console.log('v65: Bunjang Kaufkarten-Discovery installiert.')
