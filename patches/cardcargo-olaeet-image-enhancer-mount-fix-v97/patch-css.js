const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
const patchDir = __dirname
if (!appRoot) throw new Error('APP_ROOT missing.')

const candidates = [
  path.join(appRoot, 'app', 'globals.css'),
  path.join(appRoot, 'src', 'app', 'globals.css'),
]
const file = candidates.find((entry) => fs.existsSync(entry))
if (!file) throw new Error('globals.css not found.')

const marker = '/* CardCargo v96 - shipment summary, package image previews and archive downloads */'
let source = fs.readFileSync(file, 'utf8')
if (source.includes(marker)) {
  console.log('v96 CSS already installed.')
  process.exit(0)
}

const addition = fs.readFileSync(path.join(patchDir, 'shipment-v96.css'), 'utf8')
const backup = `${file}.bak-v96`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
source = source.replace(/\s*$/, '') + '\n\n' + addition.replace(/^\s*/, '') + '\n'
fs.writeFileSync(file, source)
console.log(`CSS appended: ${path.relative(appRoot, file)}`)
