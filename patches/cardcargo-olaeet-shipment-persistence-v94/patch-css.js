const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
const patchRoot = process.argv[3]
if (!appRoot || !patchRoot) throw new Error('APP_ROOT/PATCH_ROOT fehlt.')

const candidates = [
  'app/globals.css',
  'src/app/globals.css',
  'styles/globals.css',
  'src/styles/globals.css',
]
const targetRel = candidates.find((rel) => fs.existsSync(path.join(appRoot, rel)))
if (!targetRel) throw new Error('Keine globale CSS-Datei gefunden.')

const target = path.join(appRoot, targetRel)
let source = fs.readFileSync(target, 'utf8')
const marker = 'CardCargo v94 - OLAEET shipment persistence/detail UI'
if (!source.includes(marker)) {
  const css = fs.readFileSync(path.join(patchRoot, 'shipment-v94.css'), 'utf8')
  const backup = `${target}.bak-v94`
  if (!fs.existsSync(backup)) fs.copyFileSync(target, backup)
  source = `${source.trimEnd()}\n\n${css.trim()}\n`
  fs.writeFileSync(target, source)
  console.log(`v94 Shipment-UI ergänzt: ${targetRel}`)
}
