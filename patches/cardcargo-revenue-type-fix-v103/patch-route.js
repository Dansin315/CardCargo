const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('Usage: node patch-route.js /path/to/poketracker-pwa')

const file = path.join(appRoot, 'app/api/revenue/route.ts')
if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`)

let source = fs.readFileSync(file, 'utf8')
const original = source

// 1) Avoid the local total `purchaseCostKrw` shadowing the helper function.
source = source.replace(
  /function\s+purchaseCostKrw\s*\(purchase:\s*GenericRow,\s*fx:\s*FxSnapshot\s*\|\s*null\)/,
  'function calculatePurchaseCostKrw(purchase: GenericRow, fx: FxSnapshot | null)',
)
source = source.replace(
  /purchaseCostKrw:\s*purchaseCostKrw\(purchase,\s*fx\)/g,
  'purchaseCostKrw: calculatePurchaseCostKrw(purchase, fx)',
)

// 2) The RHS of `?? { cards: [] }` otherwise infers `never[]` under strict TS.
// Explicitly type both group accumulators as GroupOutput.
source = source.replace(
  /const current = groups\.get\(key\) \?\? \{\n(\s+key,\n\s+type: 'purchase' as const,)/,
  'const current: GroupOutput = groups.get(key) ?? {\n$1',
)
source = source.replace(
  /const current = groups\.get\(key\) \?\? \{\n(\s+key,\n\s+type: 'package' as const,)/,
  'const current: GroupOutput = groups.get(key) ?? {\n$1',
)

if (source === original) {
  // Treat an already-fixed file as success, but verify the required changes.
  const alreadyFixed =
    source.includes('function calculatePurchaseCostKrw(') &&
    source.includes('purchaseCostKrw: calculatePurchaseCostKrw(purchase, fx)') &&
    (source.match(/const current: GroupOutput = groups\.get\(key\) \?\?/g) || []).length >= 2
  if (!alreadyFixed) {
    throw new Error('Could not locate the v102 revenue TypeScript patterns. No changes made.')
  }
  console.log('Already fixed: app/api/revenue/route.ts')
  process.exit(0)
}

const checks = [
  ['renamed helper', source.includes('function calculatePurchaseCostKrw(')],
  ['renamed helper call', source.includes('purchaseCostKrw: calculatePurchaseCostKrw(purchase, fx)')],
  ['typed accumulators', (source.match(/const current: GroupOutput = groups\.get\(key\) \?\?/g) || []).length >= 2],
]
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
if (failed.length) throw new Error(`Patch verification failed: ${failed.join(', ')}`)

fs.copyFileSync(file, `${file}.v103.bak`)
fs.writeFileSync(file, source)
console.log('Patched: app/api/revenue/route.ts')
