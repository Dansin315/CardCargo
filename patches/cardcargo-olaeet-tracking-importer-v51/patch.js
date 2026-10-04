const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function full(rel) {
  return path.join(appRoot, rel)
}

function read(rel) {
  const file = full(rel)
  if (!fs.existsSync(file)) throw new Error(`Datei nicht gefunden: ${rel}`)
  return fs.readFileSync(file, 'utf8')
}

function write(rel, value) {
  const file = full(rel)
  const original = fs.readFileSync(file, 'utf8')
  if (original === value) {
    console.log(`Bereits korrekt: ${rel}`)
    return
  }

  const backup = `${file}.bak-v51`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, value)
  console.log(`Aktualisiert: ${rel}`)
}

function patchTypes() {
  const rel = 'lib/types.ts'
  let src = read(rel)

  src = src
    .replace(
      /^(\s*)domestic_carrier:\s*string\s*\|\s*null\s*$/m,
      '$1domestic_carrier?: string | null',
    )
    .replace(
      /^(\s*)domestic_tracking_number:\s*string\s*\|\s*null\s*$/m,
      '$1domestic_tracking_number?: string | null',
    )

  if (!src.includes('domestic_tracking_number?: string | null')) {
    const shippingField = /^(\s*)domestic_shipping_amount:\s*number\s*\|\s*null\s*$/m
    const match = src.match(shippingField)
    if (!match) {
      throw new Error(`v51: domestic_shipping_amount in ${rel} nicht gefunden.`)
    }

    src = src.replace(
      shippingField,
      `${match[1]}domestic_shipping_amount: number | null\n${match[1]}domestic_carrier?: string | null\n${match[1]}domestic_tracking_number?: string | null`,
    )
  }

  write(rel, src)
}

function addImportAfter(src, newImport) {
  if (src.includes(newImport)) return src

  const importLines = [...src.matchAll(/^import .*$/gm)]
  if (!importLines.length) throw new Error('Keine Import-Zeilen gefunden.')

  const last = importLines[importLines.length - 1]
  const insertAt = last.index + last[0].length
  return src.slice(0, insertAt) + `\n${newImport}` + src.slice(insertAt)
}

function patchPurchaseDetail() {
  const rel = 'app/(app)/purchases/[id]/page.tsx'
  let src = read(rel)

  src = addImportAfter(
    src,
    "import { PurchaseDomesticTrackingEditor } from '@/components/purchase-domestic-tracking-editor'",
  )

  const fromIndex = src.indexOf(".from('purchases')")
  if (fromIndex < 0) throw new Error(`v51: purchases-Abfrage in ${rel} nicht gefunden.`)

  const selectEnd = src.indexOf(".eq('id', id)", fromIndex)
  if (selectEnd < 0) throw new Error(`v51: Ende der purchases-Abfrage in ${rel} nicht gefunden.`)

  const selectSlice = src.slice(fromIndex, selectEnd)
  if (!selectSlice.includes('domestic_carrier') || !selectSlice.includes('domestic_tracking_number')) {
    const shippingIndex = src.indexOf('domestic_shipping_amount', fromIndex)
    if (shippingIndex < 0 || shippingIndex > selectEnd) {
      throw new Error(`v51: domestic_shipping_amount im purchases-Select nicht gefunden.`)
    }

    const afterShipping = shippingIndex + 'domestic_shipping_amount'.length
    src =
      src.slice(0, afterShipping) +
      ', domestic_carrier, domestic_tracking_number' +
      src.slice(afterShipping)
  }

  if (!src.includes('<PurchaseDomesticTrackingEditor')) {
    const dlStart = src.indexOf('<dl className="definition-list">')
    if (dlStart < 0) {
      throw new Error(`v51: definition-list in ${rel} nicht gefunden.`)
    }

    const dlEndStart = src.indexOf('</dl>', dlStart)
    if (dlEndStart < 0) {
      throw new Error(`v51: schliessendes </dl> in ${rel} nicht gefunden.`)
    }

    const dlEnd = dlEndStart + '</dl>'.length
    const lineStart = src.lastIndexOf('\n', dlEndStart) + 1
    const indent = (src.slice(lineStart, dlEndStart).match(/^\s*/) || [''])[0]

    const editor =
      `\n${indent}<PurchaseDomesticTrackingEditor\n` +
      `${indent}  purchaseId={purchase.id}\n` +
      `${indent}  domesticCarrier={purchase.domestic_carrier ?? null}\n` +
      `${indent}  domesticTrackingNumber={purchase.domestic_tracking_number ?? null}\n` +
      `${indent}/>`

    src = src.slice(0, dlEnd) + editor + src.slice(dlEnd)
  }

  write(rel, src)
}

function patchWarehouseList() {
  const rel = 'app/(app)/warehouse-packages/page.tsx'
  let src = read(rel)

  if (src.includes('href="/warehouse-packages/import"')) {
    console.log(`Bereits korrekt: ${rel}`)
    return
  }

  const marker = '<Link className="button button-primary" href="/warehouse-packages/new">'
  const index = src.indexOf(marker)
  if (index < 0) {
    throw new Error(`v51: Button + Paket erfassen in ${rel} nicht gefunden.`)
  }

  const lineStart = src.lastIndexOf('\n', index) + 1
  const indent = (src.slice(lineStart, index).match(/^\s*/) || [''])[0]
  const importer =
    `<Link className="button button-secondary" href="/warehouse-packages/import">\n` +
    `${indent}  OLAEET importieren\n` +
    `${indent}</Link>\n${indent}`

  src = src.slice(0, index) + importer + src.slice(index)
  write(rel, src)
}

patchTypes()
patchPurchaseDetail()
patchWarehouseList()

console.log('')
console.log('v51: Quellcode-Patches erfolgreich abgeschlossen.')
