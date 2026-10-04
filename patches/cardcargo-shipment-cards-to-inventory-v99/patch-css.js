const fs = require('fs')
const path = require('path')
const appRoot = process.argv[2]
const patchRoot = process.argv[3]
if (!appRoot || !patchRoot) throw new Error('APP_ROOT/PATCH_ROOT fehlt.')
const marker = 'CardCargo v99 - Shipment cards -> inventory'
const candidates = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css', 'src/styles/globals.css']
const rel = candidates.find((entry) => fs.existsSync(path.join(appRoot, entry)))
if (!rel) throw new Error('Keine globale CSS-Datei gefunden.')
const file = path.join(appRoot, rel)
let source = fs.readFileSync(file, 'utf8')
if (!source.includes(marker)) {
  const backup = `${file}.bak-v99`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  source = `${source.trimEnd()}\n\n${fs.readFileSync(path.join(patchRoot, 'v99.css'), 'utf8').trim()}\n`
  fs.writeFileSync(file, source)
  console.log(`CSS patched: ${rel}`)
} else {
  console.log(`CSS already present: ${rel}`)
}
