const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function removeOldV53() {
  const oldFiles = [
    'lib/bunjang-import.ts',
    'app/api/purchases/bunjang-sync/route.ts',
    'components/bunjang-importer.tsx',
  ]

  for (const rel of oldFiles) {
    const file = path.join(appRoot, rel)
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true })
      console.log(`v53 entfernt: ${rel}`)
    }
  }

  const oldTool = path.join(appRoot, 'tools/bunjang-extractor')
  if (fs.existsSync(oldTool)) {
    fs.rmSync(oldTool, { recursive: true, force: true })
    console.log('v53 entfernt: tools/bunjang-extractor')
  }
}

function ensurePurchasesButton() {
  const rel = 'app/(app)/purchases/page.tsx'
  const file = path.join(appRoot, rel)
  if (!fs.existsSync(file)) throw new Error(`Datei nicht gefunden: ${rel}`)

  let src = fs.readFileSync(file, 'utf8')
  if (src.includes('href="/purchases/bunjang-import"')) {
    console.log(`Bunjang-Sync-Link bereits vorhanden: ${rel}`)
    return
  }

  const marker = '<Link className="button button-primary" href="/purchases/new">'
  const index = src.indexOf(marker)
  if (index < 0) throw new Error(`v54: Neuer-Import-Button in ${rel} nicht gefunden.`)

  const lineStart = src.lastIndexOf('\n', index) + 1
  const indent = (src.slice(lineStart, index).match(/^\s*/) || [''])[0]
  const link =
    `<Link className="button button-secondary" href="/purchases/bunjang-import">\n` +
    `${indent}  Bunjang Bestellungen synchronisieren\n` +
    `${indent}</Link>\n${indent}`

  const backup = `${file}.bak-v54`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  src = src.slice(0, index) + link + src.slice(index)
  fs.writeFileSync(file, src)
  console.log(`Aktualisiert: ${rel}`)
}

removeOldV53()
ensurePurchasesButton()
console.log('v54: v53 entfernt und Navigation vorbereitet.')
