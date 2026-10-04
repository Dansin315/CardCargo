const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function patchFile(rel, transform) {
  const file = path.join(appRoot, rel)
  if (!fs.existsSync(file)) {
    throw new Error(`Datei nicht gefunden: ${rel}`)
  }

  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)

  if (after === before) {
    console.log(`Keine Aenderung notwendig: ${rel}`)
    return
  }

  const backup = `${file}.bak-v61`
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup)
  }

  fs.writeFileSync(file, after)
  console.log(`Aktualisiert: ${rel}`)
}

patchFile('components/purchase-import-form.tsx', (source) => {
  let src = source

  // The click on "Bestelldaten übernehmen" must treat the Bunjang order as the
  // authoritative source for transactional values. The listing remains the
  // authoritative source for title/description/images.
  const oldBlock = `      title: current.title || record.title || '',
      sellerName: current.sellerName || record.sellerName || '',
      priceAmount:
        current.priceAmount ||
        (record.productAmount === null ? '' : String(record.productAmount)),
      domesticShippingAmount:
        current.domesticShippingAmount ||
        (record.domesticShippingAmount === null
          ? ''
          : String(record.domesticShippingAmount)),
      purchasedAt: record.purchasedAt || current.purchasedAt,`

  const newBlock = `      title: current.title || record.title || '',
      sellerName: record.sellerName || current.sellerName,
      priceAmount:
        record.productAmount === null
          ? current.priceAmount
          : String(record.productAmount),
      domesticShippingAmount:
        record.domesticShippingAmount === null
          ? current.domesticShippingAmount
          : String(record.domesticShippingAmount),
      purchasedAt: record.purchasedAt || current.purchasedAt,`

  if (src.includes(oldBlock)) {
    src = src.replace(oldBlock, newBlock)
  } else if (
    !src.includes(
      "record.productAmount === null\n          ? current.priceAmount\n          : String(record.productAmount)",
    )
  ) {
    throw new Error(
      'v61: applyBunjangOrder-Feldblock in purchase-import-form.tsx nicht gefunden.',
    )
  }

  // Clarify the UI message so the source priority is visible.
  src = src.replace(
    /Bunjang-Bestellung \\?\$\{record\.orderId\} übernommen\. Carrier und Tracking werden beim Speichern mit dem Einkauf verknüpft\./g,
    'Bunjang-Bestellung ${record.orderId} übernommen. Kaufpreis, Verkäufer, Kaufdatum und Versandkosten stammen jetzt aus den Bestelldaten; Carrier und Tracking werden beim Speichern verknüpft.',
  )

  return src
})

patchFile(
  'app/api/purchases/[id]/bunjang-order-enrichment/route.ts',
  (source) => {
    let src = source

    // Order enrichment happens after a normal URL-created purchase. Therefore
    // the order values must replace listing transaction values.
    const replacements = [
      [
        'seller_name: purchase.seller_name || record.sellerName,',
        'seller_name: record.sellerName || purchase.seller_name,',
      ],
      [
        'price_amount: purchase.price_amount ?? record.productAmount,',
        'price_amount: record.productAmount ?? purchase.price_amount,',
      ],
      [
        `domestic_shipping_amount:
          purchase.domestic_shipping_amount ?? record.domesticShippingAmount,`,
        `domestic_shipping_amount:
          record.domesticShippingAmount ?? purchase.domestic_shipping_amount,`,
      ],
      [
        'purchased_at: purchase.purchased_at || record.purchasedAt,',
        'purchased_at: record.purchasedAt || purchase.purchased_at,',
      ],
    ]

    for (const [oldValue, newValue] of replacements) {
      if (src.includes(oldValue)) {
        src = src.replace(oldValue, newValue)
      }
    }

    if (!src.includes('price_amount: record.productAmount ?? purchase.price_amount,')) {
      throw new Error(
        'v61: Order-Enrichment-Preisprioritaet konnte nicht gesetzt werden.',
      )
    }

    return src
  },
)

patchFile('app/api/purchases/bunjang-order-sync/route.ts', (source) => {
  let src = source

  // Same authority rule when the order sync enriches a purchase that was
  // originally created from the URL importer.
  const replacements = [
    [
      'seller_name: purchase.seller_name || record.sellerName,',
      'seller_name: record.sellerName || purchase.seller_name,',
    ],
    [
      'price_amount: purchase.price_amount ?? record.productAmount,',
      'price_amount: record.productAmount ?? purchase.price_amount,',
    ],
    [
      `domestic_shipping_amount:
              purchase.domestic_shipping_amount ??
              record.domesticShippingAmount,`,
      `domestic_shipping_amount:
              record.domesticShippingAmount ??
              purchase.domestic_shipping_amount,`,
    ],
    [
      'purchased_at: purchase.purchased_at || record.purchasedAt,',
      'purchased_at: record.purchasedAt || purchase.purchased_at,',
    ],
  ]

  for (const [oldValue, newValue] of replacements) {
    if (src.includes(oldValue)) {
      src = src.replace(oldValue, newValue)
    }
  }

  if (!src.includes('price_amount: record.productAmount ?? purchase.price_amount,')) {
    throw new Error(
      'v61: Order-Sync-Preisprioritaet konnte nicht gesetzt werden.',
    )
  }

  return src
})

console.log('')
console.log('v61: Bunjang Order ist jetzt fuer Transaktionsdaten autoritativ.')
