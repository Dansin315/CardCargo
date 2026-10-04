const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, output)
    else output.push(full)
  }
  return output
}

function matchingParen(source, openIndex) {
  let depth = 0
  let quote = null
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function splitTopLevel(body) {
  const chunks = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (quote) {
      if (ch === quote && body[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === "'" || ch === '"') quote = ch
    else if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === ',' && depth === 0) {
      chunks.push(body.slice(start, i))
      start = i + 1
    }
  }
  chunks.push(body.slice(start))
  return chunks
}

const specs = new Map()
function add(name, notNull = false, hasDefault = false, defaultValue = null) {
  if (!name || /^(constraint|primary|foreign|unique|check|exclude)$/i.test(name)) return
  const previous = specs.get(name) || { name, notNull: false, hasDefault: false, defaultValue: null }
  specs.set(name, {
    name,
    notNull: previous.notNull || notNull,
    hasDefault: previous.hasDefault || hasDefault,
    defaultValue: previous.defaultValue ?? defaultValue,
  })
}

for (const file of walk(path.join(appRoot, 'supabase'))) {
  if (!file.endsWith('.sql')) continue
  const source = fs.readFileSync(file, 'utf8')
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?inventory_units["']?\s*\(/ig
  for (const match of source.matchAll(re)) {
    const open = match.index + match[0].lastIndexOf('(')
    const close = matchingParen(source, open)
    if (close < 0) continue
    const body = source.slice(open + 1, close)
    for (const chunk of splitTopLevel(body)) {
      const cleaned = chunk.replace(/--.*$/gm, '').trim()
      const columnMatch = cleaned.match(/^["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s+/)
      if (!columnMatch) continue
      const name = columnMatch[1]
      const notNull = /\bnot\s+null\b/i.test(cleaned)
      const defaultMatch = cleaned.match(/\bdefault\s+((?:'[^']*')|(?:"[^"]*")|[^\s,]+)/i)
      let defaultValue = null
      if (defaultMatch) {
        const quoted = defaultMatch[1].match(/^['"]([^'"]*)['"]/)?.[1]
        defaultValue = quoted ?? defaultMatch[1]
      }
      add(name, notNull, Boolean(defaultMatch), defaultValue)
    }
  }
}

for (const file of walk(appRoot)) {
  if (!/\.(?:ts|tsx|js|jsx)$/.test(file)) continue
  if (file.includes(`${path.sep}.next${path.sep}`) || file.includes(`${path.sep}node_modules${path.sep}`)) continue
  const source = fs.readFileSync(file, 'utf8')
  if (!source.includes('inventory_units')) continue
  for (const match of source.matchAll(/\.select\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    for (const field of match[1].split(',')) {
      const name = field.trim().split(/[\s(]/)[0]
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) add(name)
    }
  }
}

for (const name of [
  'id', 'user_id', 'purchase_item_id', 'status', 'quantity',
  'note', 'notes', 'comment', 'comments', 'memo', 'tags', 'labels',
  'raw_metadata', 'metadata',
]) add(name)

const values = [...specs.values()].sort((a, b) => a.name.localeCompare(b.name))
const target = path.join(appRoot, 'lib/inventory-shipment-schema.generated.ts')
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(
  target,
  `export type InventoryColumnSpec = {\n  name: string\n  notNull: boolean\n  hasDefault: boolean\n  defaultValue: string | null\n}\n\nexport const inventoryUnitColumnSpecs: InventoryColumnSpec[] = ${JSON.stringify(values, null, 2)}\n\nexport const inventoryUnitColumns = inventoryUnitColumnSpecs.map((entry) => entry.name)\n`,
)
console.log(`Inventory schema generated: lib/inventory-shipment-schema.generated.ts (${values.length} columns)`) 
