const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
const patchRoot = __dirname
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const cssCandidates = [
  path.join(appRoot, 'app', 'globals.css'),
  path.join(appRoot, 'src', 'app', 'globals.css'),
]
const cssFile = cssCandidates.find((file) => fs.existsSync(file))
if (!cssFile) throw new Error('globals.css nicht gefunden.')

let source = fs.readFileSync(cssFile, 'utf8')
const marker = '/* CardCargo v106 - manual/date-range Bunjang assignment for international shipments */'
if (!source.includes(marker)) {
  source = source.trimEnd() + '\n\n' + fs.readFileSync(path.join(patchRoot, 'v106.css'), 'utf8').trim() + '\n'
  fs.writeFileSync(cssFile, source)
  console.log(`Patched CSS: ${path.relative(appRoot, cssFile)}`)
} else {
  console.log('CSS already patched for v106.')
}
