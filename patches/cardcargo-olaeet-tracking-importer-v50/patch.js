const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function read(rel) {
  return fs.readFileSync(path.join(appRoot, rel), 'utf8')
}
function write(rel, value) {
  const file = path.join(appRoot, rel)
  const backup = `${file}.bak-v50`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, value)
  console.log(`Aktualisiert: ${rel}`)
}

function patchTypes() {
  const rel = 'lib/types.ts'
  let src = read(rel)
  if (src.includes('domestic_tracking_number: string | null')) {
    console.log(`Bereits korrekt: ${rel}`)
    return
  }
  const anchor = `  domestic_shipping_amount: number | null
  service_fee_amount: number | null`
  if (!src.includes(anchor)) throw new Error(`v50: Anker in ${rel} nicht gefunden.`)
  src = src.replace(
    anchor,
    `  domestic_shipping_amount: number | null
  domestic_carrier: string | null
  domestic_tracking_number: string | null
  service_fee_amount: number | null`,
  )
  write(rel, src)
}

function patchPurchaseDetail() {
  const rel = 'app/(app)/purchases/[id]/page.tsx'
  let src = read(rel)

  if (!src.includes("import { PurchaseDomesticTrackingEditor }")) {
    const anchor = `import { PurchaseItemsSummary } from '@/components/purchase-items-summary'`
    if (!src.includes(anchor)) throw new Error(`v50: Import-Anker in ${rel} nicht gefunden.`)
    src = src.replace(
      anchor,
      `${anchor}
import { PurchaseDomesticTrackingEditor } from '@/components/purchase-domestic-tracking-editor'`,
    )
  }

  if (!src.includes('domestic_carrier, domestic_tracking_number')) {
    const selectAnchor = 'price_currency, domestic_shipping_amount, service_fee_amount'
    if (!src.includes(selectAnchor)) throw new Error(`v50: Select-Anker in ${rel} nicht gefunden.`)
    src = src.replace(
      selectAnchor,
      'price_currency, domestic_shipping_amount, domestic_carrier, domestic_tracking_number, service_fee_amount',
    )
  }

  if (!src.includes('<PurchaseDomesticTrackingEditor')) {
    const anchor = `          </dl>
          {purchase.description ? (`
    if (!src.includes(anchor)) throw new Error(`v50: Detail-Anker in ${rel} nicht gefunden.`)
    src = src.replace(
      anchor,
      `          </dl>
          <PurchaseDomesticTrackingEditor
            purchaseId={purchase.id}
            domesticCarrier={purchase.domestic_carrier}
            domesticTrackingNumber={purchase.domestic_tracking_number}
          />
          {purchase.description ? (`,
    )
  }

  write(rel, src)
}

function patchPurchaseEditSelect() {
  const rel = 'app/(app)/purchases/[id]/edit/page.tsx'
  let src = read(rel)
  if (src.includes('domestic_carrier, domestic_tracking_number')) {
    console.log(`Bereits korrekt: ${rel}`)
    return
  }
  const before = 'price_currency, domestic_shipping_amount, service_fee_amount'
  if (!src.includes(before)) throw new Error(`v50: Select-Anker in ${rel} nicht gefunden.`)
  src = src.replace(
    before,
    'price_currency, domestic_shipping_amount, domestic_carrier, domestic_tracking_number, service_fee_amount',
  )
  write(rel, src)
}

function patchWarehouseList() {
  const rel = 'app/(app)/warehouse-packages/page.tsx'
  let src = read(rel)
  if (src.includes('href="/warehouse-packages/import"')) {
    console.log(`Bereits korrekt: ${rel}`)
    return
  }
  const anchor = `<Link className="button button-primary" href="/warehouse-packages/new">
          + Paket erfassen
        </Link>`
  if (!src.includes(anchor)) throw new Error(`v50: Button-Anker in ${rel} nicht gefunden.`)
  src = src.replace(
    anchor,
    `<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="button button-secondary" href="/warehouse-packages/import">
            OLAEET importieren
          </Link>
          <Link className="button button-primary" href="/warehouse-packages/new">
            + Paket erfassen
          </Link>
        </div>`,
  )
  write(rel, src)
}

patchTypes()
patchPurchaseDetail()
patchPurchaseEditSelect()
patchWarehouseList()
console.log('v50: bestehende Dateien erfolgreich gepatcht.')
