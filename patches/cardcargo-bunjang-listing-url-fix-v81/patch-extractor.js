const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'tools/bunjang-order-extractor/popup.js'
const file = path.join(appRoot, rel)

if (!fs.existsSync(file)) {
  throw new Error(`Datei nicht gefunden: ${rel}`)
}

let src = fs.readFileSync(file, 'utf8')

if (src.includes('listing-url-fallback-v81')) {
  console.log('v81: Extractor-URL-Fallback ist bereits installiert.')
} else {
  const backup = `${file}.bak-v81`
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup)
  }

  const signature = 'func: (expectedOrderId, orderUrl) => {'
  if (!src.includes(signature)) {
    throw new Error(
      'v81: extractRenderedDetail-Funktionssignatur nicht gefunden.',
    )
  }

  src = src.replace(
    signature,
    `func: (expectedOrderId, orderUrl, summaryListingId) => {\n      // listing-url-fallback-v81`,
  )

  const oldBlock = `      const productUrls = [...document.querySelectorAll('a[href]')]
        .map((anchor) => anchor.href)
        .filter((href) => /\\/products?\\/\\d+/i.test(href))
        .slice(0, 12)`

  const newBlock = `      const productUrlSet = new Set()

      function addProductUrl(value) {
        if (!value) return

        try {
          const absolute = new URL(String(value), location.href).href
          if (/\\/products?\\/\\d+/i.test(absolute)) {
            productUrlSet.add(absolute)
          }
        } catch {
          // Ignore malformed URL candidates.
        }
      }

      // 1. Normal links.
      for (const anchor of document.querySelectorAll('a[href]')) {
        addProductUrl(anchor.getAttribute('href'))
        addProductUrl(anchor.href)
      }

      // 2. Bunjang frequently uses JS-clickable cards instead of real links.
      // Inspect common URL-bearing attributes as well.
      for (const element of document.querySelectorAll(
        '[data-href], [data-url], [data-link], [data-product-url], [onclick]',
      )) {
        for (const attribute of [
          'data-href',
          'data-url',
          'data-link',
          'data-product-url',
          'onclick',
        ]) {
          const value = element.getAttribute(attribute)
          if (!value) continue

          const matches = String(value).match(/(?:https?:\\/\\/[^\\s\\\"']+)?\\/products?\\/\\d+/gi) || []
          for (const match of matches) addProductUrl(match)
        }
      }

      // 3. Search the rendered markup for routes that are present in React/
      // Next data but are not exposed as anchor hrefs.
      const markup = String(document.documentElement?.innerHTML || '')
      const markupMatches = markup.match(
        /(?:https?:\\/\\/[^\\s\\\"'<>]+)?\\/products?\\/\\d+/gi,
      ) || []
      for (const match of markupMatches) addProductUrl(match)

      // 4. Fast summary-first extractor already captures product/listing IDs
      // from Bunjang's overview API. This is the most important fallback for
      // JS-only order-detail cards.
      if (/^\\d{5,}$/.test(String(summaryListingId || ''))) {
        addProductUrl(
          'https://m.bunjang.co.kr/products/' + summaryListingId,
        )
      }

      const productUrls = [...productUrlSet].slice(0, 12)`

  if (!src.includes(oldBlock)) {
    throw new Error(
      'v81: bisheriger productUrls-Block im Extractor nicht gefunden.',
    )
  }

  src = src.replace(oldBlock, newBlock)

  const argsPattern = /args: \[order\.orderId, order\.orderUrl\],/
  if (!argsPattern.test(src)) {
    throw new Error('v81: Extractor-args-Anker nicht gefunden.')
  }

  src = src.replace(
    argsPattern,
    `args: [\n      order.orderId,\n      order.orderUrl,\n      order?.summary?.listingId || null,\n    ],`,
  )

  // Add useful detail diagnostics if the current extractor has the v74+
  // diagnostics object.
  const diagnosticAnchor = `          trackingNumberFound:\n            Boolean(shipment.trackingNumber),`

  if (src.includes(diagnosticAnchor)) {
    src = src.replace(
      diagnosticAnchor,
      `${diagnosticAnchor}\n          listingUrlFound: productUrls.length > 0,\n          listingUrlCount: productUrls.length,\n          summaryListingId: summaryListingId || null,`,
    )
  }

  fs.writeFileSync(file, src)
  console.log(
    'v81: Extractor liest Bunjang-Produkt-URLs jetzt aus Links, JS-DOM und Summary-listingId.',
  )
}

const manifestFile = path.join(
  appRoot,
  'tools/bunjang-order-extractor/manifest.json',
)

if (fs.existsSync(manifestFile)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    manifest.version = '4.7.0'
    manifest.description =
      'Bunjang Smart-Sync mit robustem Listing-URL-Fallback fuer automatischen CardCargo Order+Listing Import.'
    fs.writeFileSync(
      manifestFile,
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
  } catch (error) {
    console.warn(
      `v81: Manifest-Version konnte nicht aktualisiert werden: ${error.message}`,
    )
  }
}
