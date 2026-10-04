const fs = require('fs')
const path = require('path')

const root = process.argv[2]
if (!root) throw new Error('App root missing.')
const file = path.join(root, 'components/revenue-workspace.tsx')
if (!fs.existsSync(file)) throw new Error('components/revenue-workspace.tsx not found. Apply v102-v105 first.')
let source = fs.readFileSync(file, 'utf8')
if (source.includes('data-cc-v107-plan-link')) {
  console.log('Revenue plan link already present.')
  process.exit(0)
}
const needle = '<h1>Umsatz</h1>'
if (!source.includes(needle)) throw new Error('Could not find Umsatz heading in revenue workspace.')
source = source.replace(
  needle,
  '<div className="cc107-revenue-title-row" data-cc-v107-plan-link>\n            <h1>Umsatz</h1>\n            <a className="button button-secondary" href="/revenue/plan">Plan / Test</a>\n          </div>',
)
fs.writeFileSync(file, source)
console.log('Patched: components/revenue-workspace.tsx')
