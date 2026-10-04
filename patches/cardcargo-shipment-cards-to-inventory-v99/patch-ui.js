const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function ensureImport(source, statement) {
  if (source.includes(statement)) return source
  const imports = [...source.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm)]
  if (imports.length) {
    const last = imports[imports.length - 1]
    const at = last.index + last[0].length
    return source.slice(0, at) + `\n${statement}` + source.slice(at)
  }
  return `${statement}\n${source}`
}

function patchShipmentDetails() {
  const rel = 'components/olaeet-shipment-record-details.tsx'
  const file = path.join(appRoot, rel)
  if (!fs.existsSync(file)) throw new Error(`Nicht gefunden: ${rel}`)
  let source = fs.readFileSync(file, 'utf8')
  const original = source
  const importLine = "import { ShipmentInventoryImportPanel } from '@/components/shipment-inventory-import-panel'"
  source = ensureImport(source, importLine)

  if (!source.includes('<ShipmentInventoryImportPanel')) {
    const anchor = '<div className="cc94-section cc98-cost-section">'
    const index = source.indexOf(anchor)
    if (index < 0) throw new Error('Sendungsdetails: Kostenabschnitt als Einfügepunkt nicht gefunden.')
    source = source.slice(0, index) +
      '      <ShipmentInventoryImportPanel shipmentRef={shipmentRef} />\n\n      ' +
      source.slice(index)
  }

  if (source !== original) {
    const backup = `${file}.bak-v99`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    fs.writeFileSync(file, source)
    console.log(`Patched: ${rel}`)
  } else {
    console.log(`Already patched: ${rel}`)
  }
}

function patchInventoryWorkspace() {
  const rel = 'components/inventory-workspace.tsx'
  const file = path.join(appRoot, rel)
  if (!fs.existsSync(file)) throw new Error(`Nicht gefunden: ${rel}`)
  let source = fs.readFileSync(file, 'utf8')
  const original = source
  const importLine = "import { InventoryShipmentFilter } from '@/components/inventory-shipment-filter'"
  source = ensureImport(source, importLine)

  if (!source.includes('data-cc-anydb="inventory"')) {
    const returnIndex = source.indexOf('return (')
    if (returnIndex < 0) throw new Error('Inventar: return (-Block nicht gefunden.')
    const tail = source.slice(returnIndex)
    const rootMatch = tail.match(/return\s*\(\s*(<[A-Za-z][A-Za-z0-9.]*\b[^>]*>)/)
    if (rootMatch && rootMatch.index !== undefined) {
      const absolute = returnIndex + rootMatch.index + rootMatch[0].lastIndexOf(rootMatch[1])
      const opening = rootMatch[1]
      const withAttr = opening.replace(/>$/, ' data-cc-anydb="inventory">')
      source = source.slice(0, absolute) + withAttr + source.slice(absolute + opening.length)
    }
  }

  if (!source.includes('<InventoryShipmentFilter')) {
    const connected = '<ConnectedInventoryModel />'
    if (source.includes(connected)) {
      source = source.replace(connected, `${connected}\n      <InventoryShipmentFilter />`)
    } else {
      const marker = /(<[A-Za-z][A-Za-z0-9.]*\b[^>]*data-cc-anydb="inventory"[^>]*>)/
      const match = source.match(marker)
      if (!match || match.index === undefined) throw new Error('Inventar: Root für Sendungsfilter nicht gefunden.')
      const at = match.index + match[0].length
      source = source.slice(0, at) + '\n      <InventoryShipmentFilter />' + source.slice(at)
    }
  }

  source = source.replace(/<article\b([^>]*)>/g, (full, attrs) => {
    if (/data-cc-record-card\s*=/.test(full)) return full
    return `<article${attrs} data-cc-record-card="true">`
  })

  let tableTagged = false
  source = source.replace(/<table\b([^>]*)>/g, (full, attrs) => {
    if (tableTagged || /data-cc-table\s*=/.test(full)) return full
    tableTagged = true
    return `<table${attrs} data-cc-table="inventory">`
  })

  if (source !== original) {
    const backup = `${file}.bak-v99`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    fs.writeFileSync(file, source)
    console.log(`Patched: ${rel}`)
  } else {
    console.log(`Already patched: ${rel}`)
  }
}

patchShipmentDetails()
patchInventoryWorkspace()
