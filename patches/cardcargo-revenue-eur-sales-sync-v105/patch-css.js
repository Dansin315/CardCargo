const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
const patchDir = __dirname
if (!appRoot) throw new Error('APP_ROOT fehlt.')
const target = path.join(appRoot, 'app/globals.css')
if (!fs.existsSync(target)) throw new Error('app/globals.css nicht gefunden.')
let source = fs.readFileSync(target, 'utf8')
const marker = '/* CardCargo v105 - Umsatz EUR-first + compact sale columns */'
if (source.includes(marker)) {
  console.log('v105 CSS bereits installiert.')
  process.exit(0)
}
const css = fs.readFileSync(path.join(patchDir, 'revenue-v105.css'), 'utf8')
fs.writeFileSync(target, `${source.trimEnd()}\n\n${css.trim()}\n`)
console.log('v105 CSS installiert: app/globals.css')
