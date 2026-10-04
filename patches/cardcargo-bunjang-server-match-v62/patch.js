const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'components/purchase-import-form.tsx'
const file = path.join(appRoot, rel)
if (!fs.existsSync(file)) throw new Error(`Datei nicht gefunden: ${rel}`)

let src = fs.readFileSync(file, 'utf8')

if (
  src.includes('BunjangExistingPurchaseMatches') &&
  src.includes('applyExistingBunjangPurchase') &&
  src.includes('existingBunjangTarget?.orderId')
) {
  console.log('v62 ist bereits angewendet.')
  process.exit(0)
}

const backup = `${file}.bak-v62`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)

// ---------------------------------------------------------------------------
// 1) Component import.
// ---------------------------------------------------------------------------
if (!src.includes("from '@/components/bunjang-existing-purchase-matches'")) {
  const lastImport = [...src.matchAll(/^import .*$/gm)].at(-1)
  if (!lastImport) throw new Error('v62: Keine Importzeilen gefunden.')

  const insertAt = lastImport.index + lastImport[0].length
  src =
    src.slice(0, insertAt) +
    `\nimport {
  BunjangExistingPurchaseMatches,
  type ExistingBunjangPurchaseMatch,
} from '@/components/bunjang-existing-purchase-matches'` +
    src.slice(insertAt)
}

// ---------------------------------------------------------------------------
// 2) Extend existing target state with orderId.
// ---------------------------------------------------------------------------
src = src.replace(
  /const \[existingBunjangTarget, setExistingBunjangTarget\] = useState<\{\s*id: string\s*title: string\s*\} \| null>\(null\)/m,
  `const [existingBunjangTarget, setExistingBunjangTarget] = useState<{
    id: string
    title: string
    orderId: string
  } | null>(null)`,
)

// v60 could be formatted with semicolons or multiline fields. Validate after replacement.
if (
  src.includes('existingBunjangTarget') &&
  !src.includes('orderId: string\n  } | null>(null)')
) {
  // Fallback: patch the type body more narrowly.
  src = src.replace(
    /(const \[existingBunjangTarget, setExistingBunjangTarget\] = useState<\{\s*id: string\s*title: string)(\s*\} \| null>\(null\))/m,
    `$1
    orderId: string$2`,
  )
}

// ---------------------------------------------------------------------------
// 3) Existing order lookup must store its orderId too.
// ---------------------------------------------------------------------------
src = src.replace(
  /return result\.purchase \?\? null/,
  `return result.purchase
      ? {
          ...result.purchase,
          orderId,
        }
      : null`,
)

// ---------------------------------------------------------------------------
// 4) Add a function for using a DB-stored Purchase even when local extraction
// cache has no matching Order record.
// ---------------------------------------------------------------------------
if (!src.includes('function applyExistingBunjangPurchase(')) {
  const marker = '  async function loadBunjangOrderExtraction()'
  const index = src.indexOf(marker)
  if (index < 0) {
    throw new Error('v62: loadBunjangOrderExtraction nicht gefunden.')
  }

  const helper = `  function applyExistingBunjangPurchase(
    match: ExistingBunjangPurchaseMatch,
  ) {
    setSelectedBunjangOrder(null)
    setExistingBunjangTarget({
      id: match.id,
      title: match.title,
      orderId: match.orderId,
    })

    // The already synchronized Order data is authoritative for transaction
    // fields. Listing title/description/images continue to come from the URL.
    setFields((current) => ({
      ...current,
      sellerName: match.sellerName || current.sellerName,
      priceAmount:
        match.priceAmount === null
          ? current.priceAmount
          : String(match.priceAmount),
      domesticShippingAmount:
        match.domesticShippingAmount === null
          ? current.domesticShippingAmount
          : String(match.domesticShippingAmount),
      purchasedAt: match.purchasedAt || current.purchasedAt,
      status:
        match.domesticTrackingNumber &&
        ['planned', 'ordered', 'paid'].includes(current.status)
          ? 'shipped_domestic'
          : current.status,
    }))

    setBunjangOrderMessage(
      \`Bestehender CardCargo-Einkauf „\${match.title}“ ausgewählt. Beim Speichern werden Listing-ID, URL, Beschreibung und Bilder in diesem Einkauf ergänzt; es wird kein neuer Einkauf angelegt.\`,
    )
  }

`

  src = src.slice(0, index) + helper + src.slice(index)
}

// ---------------------------------------------------------------------------
// 5) Insert DB matches in section 3 even when local cache has no match.
// ---------------------------------------------------------------------------
if (!src.includes('<BunjangExistingPurchaseMatches')) {
  const localEmptyText = `              <p className="help-text">
                Keine ausreichend ähnliche Bestellung im lokalen Bunjang-Cache gefunden.
              </p>`

  const noCacheText = `              <p className="help-text">
                Noch keine Bunjang-Order-Extraction im Browser gespeichert. Führe den
                Order-Extractor aus und lade die Daten hier oder auf der Seite
                „Bunjang Bestellungen synchronisieren“ ein.
              </p>`

  let insertionPoint = -1

  if (src.includes(localEmptyText)) {
    insertionPoint = src.indexOf(localEmptyText) + localEmptyText.length
  } else if (src.includes(noCacheText)) {
    insertionPoint = src.indexOf(noCacheText) + noCacheText.length
  } else {
    // Robust fallback: insert before closing of section 3, directly before
    // the "Angebotsbilder archivieren" section.
    const imageHeading = '<h2>Angebotsbilder archivieren</h2>'
    const imageIndex = src.indexOf(imageHeading)
    if (imageIndex < 0) {
      throw new Error('v62: Abschnitt 4 Angebotsbilder nicht gefunden.')
    }
    const sectionStart = src.lastIndexOf('<section className="panel">', imageIndex)
    if (sectionStart < 0) {
      throw new Error('v62: Start von Abschnitt 4 nicht gefunden.')
    }
    insertionPoint = sectionStart
  }

  const matcher = `
            <BunjangExistingPurchaseMatches
              externalId={preview?.externalId ?? null}
              title={fields.title}
              sellerName={fields.sellerName}
              priceAmount={
                fields.priceAmount.trim()
                  ? Number(fields.priceAmount)
                  : null
              }
              selectedPurchaseId={existingBunjangTarget?.id ?? null}
              onUse={applyExistingBunjangPurchase}
            />
`

  src =
    src.slice(0, insertionPoint) +
    matcher +
    src.slice(insertionPoint)
}

// ---------------------------------------------------------------------------
// 6) Submit: existing DB target is enough to enrich. A local selected order
// is no longer required.
// ---------------------------------------------------------------------------
const oldConditional = `      if (selectedBunjangOrder) {
        // Resolve immediately before saving. Do not trust only the UI state:
        // another sync may have created the purchase since the order was selected.
        const existingTarget = await resolveExistingBunjangOrder(
          selectedBunjangOrder.orderId,
        )

        setExistingBunjangTarget(existingTarget)

        if (existingTarget) {`

if (src.includes(oldConditional)) {
  src = src.replace(
    oldConditional,
    `      let targetForListing = existingBunjangTarget

      if (selectedBunjangOrder) {
        // Resolve immediately before saving. Do not trust only the UI state:
        // another sync may have created the purchase since the order was selected.
        const resolvedTarget = await resolveExistingBunjangOrder(
          selectedBunjangOrder.orderId,
        )

        if (resolvedTarget) {
          targetForListing = resolvedTarget
          setExistingBunjangTarget(resolvedTarget)
        }
      }

      if (targetForListing) {`,
  )

  src = src.replace(
    /`\/api\/purchases\/\$\{existingTarget\.id\}\/bunjang-listing-enrichment`/,
    '`/api/purchases/${targetForListing.id}/bunjang-listing-enrichment`',
  )

  src = src.replace(
    /orderId: selectedBunjangOrder\.orderId,\s*listing: listingPayload,/,
    `orderId: targetForListing.orderId,
                listing: listingPayload,`,
  )

  // There was an extra closing brace from the old nested if selectedOrder -> if target.
  const afterEnrich = `          enrichedExisting = true
        }
      }

      if (!resultId) {`
  if (src.includes(afterEnrich)) {
    src = src.replace(
      afterEnrich,
      `          enrichedExisting = true
        }

      if (!resultId) {`,
    )
  }
} else if (!src.includes('let targetForListing = existingBunjangTarget')) {
  throw new Error(
    'v62: v60-Speicherlogik nicht gefunden. Bitte v60 vor v62 anwenden.',
  )
}

// ---------------------------------------------------------------------------
// 7) If a local Order lookup sets a target, make sure orderId survives.
// resolveExistingBunjangOrder() now adds it; validate target type.
// ---------------------------------------------------------------------------
if (!src.includes('existingBunjangTarget?.orderId')) {
  // The submit path reads targetForListing.orderId, so add an explicit harmless
  // UI reference only as a patch-completeness marker is unnecessary.
  // Instead validate targetForListing.orderId is present.
  if (!src.includes('orderId: targetForListing.orderId')) {
    throw new Error('v62: targetForListing.orderId fehlt nach Submit-Patch.')
  }
}

// Use the direct string as idempotency marker without changing UI.
src += `\n/* v62 existingBunjangTarget?.orderId is used through targetForListing.orderId */\n`

fs.writeFileSync(file, src)
console.log('v62: Server-seitige Bunjang-Bestellmatches in URL-Import integriert.')
