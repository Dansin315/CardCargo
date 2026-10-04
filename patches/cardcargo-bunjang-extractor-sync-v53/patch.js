const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'app/(app)/purchases/page.tsx'
const file = path.join(appRoot, rel)
if (!fs.existsSync(file)) throw new Error(`Datei nicht gefunden: ${rel}`)

let src = fs.readFileSync(file, 'utf8')
if (src.includes('href="/purchases/bunjang-import"')) {
  console.log(`Bereits korrekt: ${rel}`)
  process.exit(0)
}

const marker = '<Link className="button button-primary" href="/purchases/new">'
const index = src.indexOf(marker)
if (index < 0) throw new Error(`v53: Button "+ Neuer Import" in ${rel} nicht gefunden.`)

const lineStart = src.lastIndexOf('\n', index) + 1
const indent = (src.slice(lineStart, index).match(/^\s*/) || [''])[0]
const syncLink =
  `<Link className="button button-secondary" href="/purchases/bunjang-import">\n` +
  `${indent}  Bunjang synchronisieren\n` +
  `${indent}</Link>\n${indent}`

const backup = `${file}.bak-v53`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
src = src.slice(0, index) + syncLink + src.slice(index)
fs.writeFileSync(file, src)
console.log(`Aktualisiert: ${rel}`)
