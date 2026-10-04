const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT missing.')

const candidates = [
  path.join(appRoot, 'app', 'globals.css'),
  path.join(appRoot, 'src', 'app', 'globals.css'),
]
const file = candidates.find((entry) => fs.existsSync(entry))
if (!file) throw new Error('globals.css not found.')

const marker = '/* CardCargo v98 - shipment total costs and customs */'
let source = fs.readFileSync(file, 'utf8')
if (source.includes(marker)) {
  console.log('v98 CSS already installed.')
  process.exit(0)
}

const addition = fs.readFileSync(path.join(__dirname, 'shipment-v98.css'), 'utf8')
const backup = `${file}.bak-v98`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
source = source.replace(/\s*$/, '') + '\n\n' + addition.replace(/^\s*/, '') + '\n'
fs.writeFileSync(file, source)
console.log(`CSS appended: ${path.relative(appRoot, file)}`)
