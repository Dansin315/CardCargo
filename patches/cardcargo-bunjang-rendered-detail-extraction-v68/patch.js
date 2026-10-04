const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'lib/bunjang-order-import.ts'
const file = path.join(appRoot, rel)

if (!fs.existsSync(file)) {
  throw new Error(`Datei nicht gefunden: ${rel}`)
}

let src = fs.readFileSync(file, 'utf8')

if (src.includes('interface BunjangStructuredExtraction')) {
  console.log('v68 Parser-Erweiterung bereits vorhanden.')
  process.exit(0)
}

const interfaceAnchor = 'export interface BunjangOrderSnapshot {'
const interfaceIndex = src.indexOf(interfaceAnchor)

if (interfaceIndex < 0) {
  throw new Error('v68: BunjangOrderSnapshot-Interface nicht gefunden.')
}

const structuredInterface = `export interface BunjangStructuredExtraction {
  title?: string | null
  sellerName?: string | null
  purchasedAt?: string | null
  orderedAt?: string | null
  productAmount?: number | null
  domesticShippingAmount?: number | null
  totalAmount?: number | null
  domesticCarrier?: string | null
  domesticTrackingNumber?: string | null
  transactionMethod?: string | null
}

`

src =
  src.slice(0, interfaceIndex) +
  structuredInterface +
  src.slice(interfaceIndex)

const imageUrlsLine = '  imageUrls?: string[]'
if (!src.includes(imageUrlsLine)) {
  throw new Error('v68: imageUrls im Snapshot-Interface nicht gefunden.')
}

src = src.replace(
  imageUrlsLine,
  `${imageUrlsLine}
  extracted?: BunjangStructuredExtraction`,
)

const parseReturnAnchor = `  return {
    orderId: snapshot.orderId,
    orderUrl: snapshot.orderUrl,`

if (!src.includes(parseReturnAnchor)) {
  throw new Error('v68: Return-Block des Bunjang-Parsers nicht gefunden.')
}

src = src.replace(
  parseReturnAnchor,
  `  const extracted = snapshot.extracted

  return {
    orderId: snapshot.orderId,
    orderUrl: snapshot.orderUrl,`,
)

const replacements = [
  [
    'title: titleFromText(text, snapshot.orderId),',
    'title: extracted?.title ?? titleFromText(text, snapshot.orderId),',
  ],
  [
    "sellerName: labelledValue(text, '판매자'),",
    "sellerName: extracted?.sellerName ?? labelledValue(text, '판매자'),",
  ],
  [
    'purchasedAt: dates.purchasedAt,',
    'purchasedAt: extracted?.purchasedAt ?? dates.purchasedAt,',
  ],
  [
    'orderedAt: dates.orderedAt,',
    'orderedAt: extracted?.orderedAt ?? dates.orderedAt,',
  ],
  [
    "productAmount: amountAfterLabel(text, '상품금액'),",
    "productAmount: extracted?.productAmount ?? amountAfterLabel(text, '상품금액'),",
  ],
  [
    "domesticShippingAmount: amountAfterLabel(text, '배송비'),",
    "domesticShippingAmount: extracted?.domesticShippingAmount ?? amountAfterLabel(text, '배송비'),",
  ],
  [
    "totalAmount: amountAfterLabel(text, '총 결제금액'),",
    "totalAmount: extracted?.totalAmount ?? amountAfterLabel(text, '총 결제금액'),",
  ],
  [
    'domesticCarrier: tracking.carrier,',
    'domesticCarrier: extracted?.domesticCarrier ?? tracking.carrier,',
  ],
  [
    'domesticTrackingNumber: tracking.tracking,',
    'domesticTrackingNumber: extracted?.domesticTrackingNumber ?? tracking.tracking,',
  ],
  [
    "transactionMethod: labelledValue(text, '거래방법'),",
    "transactionMethod: extracted?.transactionMethod ?? labelledValue(text, '거래방법'),",
  ],
]

for (const [before, after] of replacements) {
  if (src.includes(before)) {
    src = src.replace(before, after)
  }
}

const backup = `${file}.bak-v68`
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup)
}

fs.writeFileSync(file, src)
console.log('v68: CardCargo-Parser bevorzugt strukturierte Detaildaten der Extension.')
