const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT missing.')

const file = path.join(appRoot, 'app', '(app)', 'shipments', '[id]', 'page.tsx')
if (!fs.existsSync(file)) throw new Error(`Shipment detail page not found: ${file}`)

const headerImport = "import { OlaeetShipmentHeaderSummary } from '@/components/olaeet-shipment-header-summary'"

function ensureImport(source, statement) {
  if (source.includes(statement)) return source
  const directive = source.match(/^\s*['\"]use client['\"];?\s*\n/)
  if (directive) {
    const at = directive[0].length
    return source.slice(0, at) + statement + '\n' + source.slice(at)
  }
  return statement + '\n' + source
}

function matchingTagEnd(source, start, tag) {
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'g')
  token.lastIndex = start
  let depth = 0
  let match
  while ((match = token.exec(source))) {
    const text = match[0]
    const closing = text.startsWith('</')
    const selfClosing = /\/>$/.test(text)
    if (!closing && !selfClosing) depth += 1
    if (closing) depth -= 1
    if (depth === 0) return token.lastIndex
  }
  return -1
}

function findAncestorStart(source, markerIndex, tag) {
  let cursor = markerIndex
  while (cursor >= 0) {
    const start = source.lastIndexOf(`<${tag}`, cursor)
    if (start < 0) return -1
    const end = matchingTagEnd(source, start, tag)
    if (end > markerIndex) return start
    cursor = start - 1
  }
  return -1
}

function removeElementContaining(source, marker, tag) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return { source, removed: false }
  const start = findAncestorStart(source, markerIndex, tag)
  if (start < 0) return { source, removed: false }
  const end = matchingTagEnd(source, start, tag)
  if (end < 0) return { source, removed: false }
  return {
    source: source.slice(0, start) + source.slice(end),
    removed: true,
  }
}

let source = fs.readFileSync(file, 'utf8')
const before = source
source = ensureImport(source, headerImport)

if (!source.includes('<OlaeetShipmentHeaderSummary')) {
  const marker = 'className="detail-price-block shipment-summary-block"'
  const classIndex = source.indexOf(marker)
  if (classIndex < 0) {
    throw new Error('Could not find shipment-summary-block on shipment detail page.')
  }
  const openEnd = source.indexOf('>', classIndex)
  if (openEnd < 0) throw new Error('Malformed shipment summary block.')
  source = source.slice(0, openEnd + 1) + '\n          <OlaeetShipmentHeaderSummary />' + source.slice(openEnd + 1)
}

for (const marker of [
  '<h2>Kostenübersicht</h2>',
  '<h2>Enthaltene OLAEET-Pakete</h2>',
  '<h2>Bilder aus enthaltenen Paketen und Einkäufen</h2>',
]) {
  const result = removeElementContaining(source, marker, 'section')
  source = result.source
  if (result.removed) console.log(`Removed duplicate section: ${marker.replace(/<[^>]+>/g, '')}`)
}

// The canonical OLAEET panel already shows the real package count. Remove the
// stale legacy definition-list row that can otherwise display "0".
for (const marker of ['<dt>Pakete</dt>', '<dt>Pakete</dt>']) {
  const result = removeElementContaining(source, marker, 'div')
  source = result.source
  if (result.removed) break
}

if (source !== before) {
  const backup = `${file}.bak-v96`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, source)
  console.log(`Patched: ${path.relative(appRoot, file)}`)
} else {
  console.log('Shipment detail page already matches v96.')
}
