const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const importLine = "import { ShipmentBunjangPurchaseManager } from '@/components/shipment-bunjang-purchase-manager'"

function ensureImport(source) {
  if (source.includes(importLine)) return source

  const useClient = source.match(/^\s*['\"]use client['\"];?\s*\n/)
  if (useClient) {
    const imports = [...source.matchAll(/^import[\s\S]*?from\s+['\"][^'\"]+['\"]\s*$/gm)]
    if (imports.length) {
      const last = imports[imports.length - 1]
      const at = last.index + last[0].length
      return source.slice(0, at) + '\n' + importLine + source.slice(at)
    }
    const at = useClient[0].length
    return source.slice(0, at) + '\n' + importLine + '\n' + source.slice(at)
  }

  const imports = [...source.matchAll(/^import[\s\S]*?from\s+['\"][^'\"]+['\"]\s*$/gm)]
  if (imports.length) {
    const last = imports[imports.length - 1]
    const at = last.index + last[0].length
    return source.slice(0, at) + '\n' + importLine + source.slice(at)
  }
  return importLine + '\n' + source
}

function patchRecordDetails() {
  const rel = 'components/olaeet-shipment-record-details.tsx'
  const file = path.join(appRoot, rel)
  if (!fs.existsSync(file)) {
    console.log(`Hinweis: ${rel} nicht gefunden; Detailansicht übersprungen.`)
    return
  }

  let source = fs.readFileSync(file, 'utf8')
  const original = source
  source = ensureImport(source)

  if (!source.includes('<ShipmentBunjangPurchaseManager shipmentRef={shipmentRef}')) {
    const inventoryAnchor = '<ShipmentInventoryImportPanel shipmentRef={shipmentRef} />'
    const costAnchor = '<div className="cc94-section cc98-cost-section">'

    if (source.includes(inventoryAnchor)) {
      source = source.replace(
        inventoryAnchor,
        `<ShipmentBunjangPurchaseManager shipmentRef={shipmentRef} />\n\n      ${inventoryAnchor}`,
      )
    } else if (source.includes(costAnchor)) {
      source = source.replace(
        costAnchor,
        `<ShipmentBunjangPurchaseManager shipmentRef={shipmentRef} />\n\n      ${costAnchor}`,
      )
    } else {
      throw new Error('Einfügepunkt in OLAEET-Sendungsdetails nicht gefunden.')
    }
  }

  if (source !== original) {
    const backup = `${file}.bak-v106`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    fs.writeFileSync(file, source)
    console.log(`Patched: ${rel}`)
  } else {
    console.log(`Already patched: ${rel}`)
  }
}

function patchExtractionImporter() {
  const rel = 'components/olaeet-shipment-extraction-importer.tsx'
  const file = path.join(appRoot, rel)
  if (!fs.existsSync(file)) {
    console.log(`Hinweis: ${rel} nicht gefunden; Erfassungsansicht übersprungen.`)
    return
  }

  let source = fs.readFileSync(file, 'utf8')
  const original = source
  source = ensureImport(source)

  if (!source.includes('cc106-capture-manager')) {
    const resultAnchor = /\{result\s*\?\s*\(/m
    const match = source.match(resultAnchor)
    if (!match || match.index === undefined) {
      throw new Error('Speicherergebnis-Block im OLAEET-Importer nicht gefunden.')
    }

    const block = `{result ? (\n            <div className="cc106-capture-manager">\n              <ShipmentBunjangPurchaseManager\n                shipmentRef={result.shipmentId || shipment.externalShipmentId}\n                compact\n              />\n            </div>\n          ) : null}\n\n          `
    source = source.slice(0, match.index) + block + source.slice(match.index)
  }

  if (source !== original) {
    const backup = `${file}.bak-v106`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    fs.writeFileSync(file, source)
    console.log(`Patched: ${rel}`)
  } else {
    console.log(`Already patched: ${rel}`)
  }
}

patchRecordDetails()
patchExtractionImporter()
