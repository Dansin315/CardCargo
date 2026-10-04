const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'components/inventory-workspace.tsx'
const file = path.join(appRoot, rel)
if (!fs.existsSync(file)) throw new Error(`Nicht gefunden: ${rel}`)

let source = fs.readFileSync(file, 'utf8')
const original = source

const connectedImport = "import { ConnectedInventoryModel } from '@/components/connected-inventory-model'"
const filterImport = "import { InventoryShipmentFilter } from '@/components/inventory-shipment-filter'"

function ensureImport(text, statement) {
  if (text.includes(statement)) return text
  const imports = [...text.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm)]
  if (imports.length) {
    const last = imports[imports.length - 1]
    const at = last.index + last[0].length
    return text.slice(0, at) + `\n${statement}` + text.slice(at)
  }
  return `${statement}\n${text}`
}

source = ensureImport(source, connectedImport)
source = ensureImport(source, filterImport)

// v93 used source.indexOf('return (') and could therefore inject the inventory
// UI into SearchIcon's <svg>. Remove all old placements first, then insert once
// into the real InventoryWorkspace root.
source = source
  .replace(/\s*<ConnectedInventoryModel\s*\/>/g, '')
  .replace(/\s*<InventoryShipmentFilter\s*\/>/g, '')
  .replace(/\sdata-cc-anydb=(?:"inventory"|'inventory'|\{["']inventory["']\})/g, '')

function isWordBoundary(ch) {
  return !ch || !/[A-Za-z0-9_$]/.test(ch)
}

function findMatchingParen(text, open) {
  let depth = 0
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let i = open; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (lineComment) {
      if (ch === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false
        i += 1
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '/' && next === '/') {
      lineComment = true
      i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      blockComment = true
      i += 1
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '(') depth += 1
    if (ch === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function findFunctionBodyStart(text, markerIndex) {
  const openParen = text.indexOf('(', markerIndex)
  if (openParen < 0) return -1
  const closeParen = findMatchingParen(text, openParen)
  if (closeParen < 0) return -1
  return text.indexOf('{', closeParen)
}

function findTopLevelReturn(text, bodyStart) {
  let depth = 1
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let i = bodyStart + 1; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (lineComment) {
      if (ch === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false
        i += 1
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '/' && next === '/') {
      lineComment = true
      i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      blockComment = true
      i += 1
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }

    if (ch === '{') {
      depth += 1
      continue
    }
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return -1
      continue
    }

    if (
      depth === 1 &&
      text.startsWith('return', i) &&
      isWordBoundary(text[i - 1]) &&
      isWordBoundary(text[i + 6])
    ) {
      return i
    }
  }

  return -1
}

function findOpeningTagEnd(text, start) {
  let quote = null
  let escaped = false
  let braceDepth = 0

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '{') {
      braceDepth += 1
      continue
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      continue
    }
    if (ch === '>' && braceDepth === 0) return i
  }
  return -1
}

const markers = [
  /export\s+function\s+InventoryWorkspace\b/,
  /function\s+InventoryWorkspace\b/,
]
let markerIndex = -1
for (const marker of markers) {
  const match = source.match(marker)
  if (match && match.index !== undefined) {
    markerIndex = match.index
    break
  }
}
if (markerIndex < 0) {
  throw new Error('InventoryWorkspace-Funktionsdeklaration nicht gefunden.')
}

const bodyStart = findFunctionBodyStart(source, markerIndex)
if (bodyStart < 0) throw new Error('InventoryWorkspace-Funktionsblock nicht gefunden.')

const returnIndex = findTopLevelReturn(source, bodyStart)
if (returnIndex < 0) throw new Error('Top-Level return von InventoryWorkspace nicht gefunden.')

let cursor = returnIndex + 'return'.length
while (/\s/.test(source[cursor] || '')) cursor += 1
if (source[cursor] === '(') {
  cursor += 1
  while (/\s/.test(source[cursor] || '')) cursor += 1
}

if (source.startsWith('<>', cursor)) {
  // Fragment root: keep the fragment but wrap the actual inventory content so
  // filtering/badges still see all record nodes under data-cc-anydb.
  const close = source.indexOf('</>', cursor + 2)
  if (close < 0) throw new Error('InventoryWorkspace Fragment-Ende nicht gefunden.')
  source =
    source.slice(0, cursor + 2) +
    '\n      <div data-cc-anydb="inventory">\n        <ConnectedInventoryModel />\n        <InventoryShipmentFilter />' +
    source.slice(cursor + 2, close) +
    '\n      </div>\n    ' +
    source.slice(close)
} else {
  const rootStart = source.indexOf('<', cursor)
  if (rootStart < 0 || rootStart > cursor + 300) {
    throw new Error('JSX-Root von InventoryWorkspace nicht gefunden.')
  }
  const tagMatch = source.slice(rootStart).match(/^<([A-Za-z][A-Za-z0-9.]*)\b/)
  if (!tagMatch) throw new Error('InventoryWorkspace JSX-Root ist kein normales Element.')

  const openingEnd = findOpeningTagEnd(source, rootStart)
  if (openingEnd < 0) throw new Error('Ende des InventoryWorkspace Root-Tags nicht gefunden.')

  let opening = source.slice(rootStart, openingEnd + 1)
  if (!opening.includes('data-cc-anydb=')) {
    opening = opening.replace(/>$/, ' data-cc-anydb="inventory">')
  }

  source =
    source.slice(0, rootStart) +
    opening +
    '\n      <ConnectedInventoryModel />\n      <InventoryShipmentFilter />' +
    source.slice(openingEnd + 1)
}

const connectedCount = (source.match(/<ConnectedInventoryModel\s*\/>/g) || []).length
const filterCount = (source.match(/<InventoryShipmentFilter\s*\/>/g) || []).length
const rootAttrCount = (source.match(/data-cc-anydb=["']inventory["']/g) || []).length

if (connectedCount !== 1 || filterCount !== 1 || rootAttrCount !== 1) {
  throw new Error(
    `Reparatur nicht eindeutig: ConnectedInventoryModel=${connectedCount}, ` +
      `InventoryShipmentFilter=${filterCount}, inventory-root=${rootAttrCount}`,
  )
}

// Explicit guard against the exact hydration bug from v93/v99.
const svgBlocks = [...source.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((m) => m[0])
if (svgBlocks.some((block) => /ConnectedInventoryModel|InventoryShipmentFilter|data-cc-anydb/.test(block))) {
  throw new Error('Inventory-Komponenten befinden sich nach Reparatur weiterhin innerhalb eines SVG.')
}

if (source !== original) {
  const backup = `${file}.bak-v101`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, source)
  console.log(`Repariert: ${rel}`)
} else {
  console.log(`Keine Änderung erforderlich: ${rel}`)
}

console.log('Hydration-Struktur geprüft: Inventory-Komponenten liegen außerhalb von SVG.')
