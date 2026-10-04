const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'components/purchase-import-form.tsx'
const file = path.join(appRoot, rel)
if (!fs.existsSync(file)) throw new Error(`Datei nicht gefunden: ${rel}`)

let src = fs.readFileSync(file, 'utf8')

const fullyApplied =
  src.includes('existingBunjangTarget') &&
  src.includes('bunjang-listing-enrichment') &&
  src.includes('resolveExistingBunjangOrder') &&
  src.includes("const resultFlag = enrichedExisting ? 'enriched=1' : 'created=1'")

if (fullyApplied) {
  console.log('v60: Dedup-Logik ist bereits vollständig vorhanden.')
  process.exit(0)
}

const backup = `${file}.bak-v60`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)

// ---------------------------------------------------------------------------
// 1. State: distinguish an already existing CardCargo order-linked purchase.
// ---------------------------------------------------------------------------
if (!src.includes('existingBunjangTarget')) {
  const messageState =
    '  const [bunjangOrderMessage, setBunjangOrderMessage] = useState<string | null>(null)'

  if (!src.includes(messageState)) {
    throw new Error(
      'v60: bunjangOrderMessage-State aus dem Bunjang-Enrichment-Patch nicht gefunden.',
    )
  }

  src = src.replace(
    messageState,
    `${messageState}
  const [existingBunjangTarget, setExistingBunjangTarget] = useState<{
    id: string
    title: string
  } | null>(null)`,
  )
}

// ---------------------------------------------------------------------------
// 2. Replace applyBunjangOrder with preflight lookup by bunjang_order_id.
// ---------------------------------------------------------------------------
if (!src.includes('async function resolveExistingBunjangOrder(')) {
  const applyStart = src.indexOf(
    '  function applyBunjangOrder(record: BunjangOrderRecord) {',
  )
  const loadStart = src.indexOf(
    '  async function loadBunjangOrderExtraction()',
    applyStart,
  )

  if (applyStart < 0 || loadStart < 0) {
    throw new Error(
      'v60: applyBunjangOrder/loadBunjangOrderExtraction-Block nicht gefunden.',
    )
  }

  const replacement = `  async function resolveExistingBunjangOrder(orderId: string) {
    const response = await fetch(
      \`/api/purchases/bunjang-order-target?orderId=\${encodeURIComponent(orderId)}\`,
      { cache: 'no-store' },
    )

    const result = (await response.json()) as {
      purchase?: { id: string; title: string } | null
      error?: string
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
          'Bestehender Bunjang-Einkauf konnte nicht geprüft werden.',
      )
    }

    return result.purchase ?? null
  }

  async function applyBunjangOrder(record: BunjangOrderRecord) {
    setSelectedBunjangOrder(record)
    setExistingBunjangTarget(null)

    setFields((current) => ({
      ...current,
      title: current.title || record.title || '',
      sellerName: current.sellerName || record.sellerName || '',
      priceAmount:
        current.priceAmount ||
        (record.productAmount === null ? '' : String(record.productAmount)),
      domesticShippingAmount:
        current.domesticShippingAmount ||
        (record.domesticShippingAmount === null
          ? ''
          : String(record.domesticShippingAmount)),
      purchasedAt: record.purchasedAt || current.purchasedAt,
      status:
        record.domesticTrackingNumber &&
        ['planned', 'ordered', 'paid'].includes(current.status)
          ? 'shipped_domestic'
          : current.status,
    }))

    try {
      const target = await resolveExistingBunjangOrder(record.orderId)
      setExistingBunjangTarget(target)

      setBunjangOrderMessage(
        target
          ? \`Bestehender CardCargo-Einkauf „\${target.title}“ gefunden. Beim Speichern werden URL, Listing-Daten und Bilder in diesem Einkauf ergänzt; es wird kein neuer Einkauf erstellt.\`
          : \`Bunjang-Bestellung \${record.orderId} übernommen. Für diese Bestellnummer existiert noch kein CardCargo-Einkauf.\`,
      )
    } catch (error) {
      setBunjangOrderMessage(
        error instanceof Error
          ? error.message
          : 'Bestehender Bunjang-Einkauf konnte nicht geprüft werden.',
      )
    }
  }

`

  src = src.slice(0, applyStart) + replacement + src.slice(loadStart)
}

// ---------------------------------------------------------------------------
// 3. Clear the target if the user removes the selected order.
// Handles both the compact v56 callback and later formatted variants.
// ---------------------------------------------------------------------------
if (!src.includes("setExistingBunjangTarget(null)\n                    setBunjangOrderMessage('Bestellzuordnung entfernt.')")) {
  src = src.replace(
    /setSelectedBunjangOrder\(null\)(\s*)setBunjangOrderMessage\('Bestellzuordnung entfernt\.'\)/,
    `setSelectedBunjangOrder(null)$1setExistingBunjangTarget(null)$1setBunjangOrderMessage('Bestellzuordnung entfernt.')`,
  )

  // v56 originally had only setSelectedBunjangOrder(null), with no message.
  src = src.replace(
    /onClick=\{\(\) => setSelectedBunjangOrder\(null\)\}/,
    `onClick={() => {
                    setSelectedBunjangOrder(null)
                    setExistingBunjangTarget(null)
                    setBunjangOrderMessage('Bestellzuordnung entfernt.')
                  }}`,
  )
}

// ---------------------------------------------------------------------------
// 4. Make the existing/new distinction visible in the selected-order card.
// Do not rely on div vs span. Insert after the "Bestellnummer {...}" element.
// ---------------------------------------------------------------------------
if (!src.includes('<strong>Bestehender Einkauf:</strong>')) {
  const orderDisplayRe =
    /([ \t]*)<(div|span)>Bestellnummer \{selectedBunjangOrder\.orderId\}<\/\2>/

  const match = src.match(orderDisplayRe)
  if (!match || match.index === undefined) {
    throw new Error(
      'v60: Bestellnummer-Anzeige der gewählten Bunjang-Bestellung nicht gefunden.',
    )
  }

  const indent = match[1]
  const original = match[0]
  const replacement = `${original}
${indent}{existingBunjangTarget ? (
${indent}  <div>
${indent}    <strong>Bestehender Einkauf:</strong>{' '}
${indent}    {existingBunjangTarget.title} · wird ergänzt, nicht neu angelegt
${indent}  </div>
${indent}) : null}`

  src =
    src.slice(0, match.index) +
    replacement +
    src.slice(match.index + original.length)
}

// ---------------------------------------------------------------------------
// 5. Replace create-first submit flow.
// Existing order target -> enrich existing purchase.
// No existing order target -> normal create + order enrichment.
// ---------------------------------------------------------------------------
if (!src.includes('bunjang-listing-enrichment')) {
  const createStart = src.indexOf(
    `      const response = await fetch('/api/purchases', {`,
  )
  const routerRefresh = src.indexOf('      router.refresh()', createStart)

  if (createStart < 0 || routerRefresh < 0) {
    throw new Error(
      'v60: URL-Import-Speicherblock konnte nicht gefunden werden.',
    )
  }

  const replaceEnd = routerRefresh + '      router.refresh()'.length

  const newSubmit = `      const listingPayload = {
        source: 'bunjang' as const,
        listingUrl: url,
        canonicalUrl: preview?.canonicalUrl ?? url,
        externalId: preview?.externalId ?? null,
        title: fields.title,
        description: fields.description,
        sellerName: fields.sellerName,
        priceAmount: numericPrice,
        domesticShippingAmount: numericDomesticShipping,
        priceCurrency: fields.priceCurrency.toUpperCase(),
        purchasedAt: fields.purchasedAt || null,
        status: fields.status,
        remoteImageUrls: selectedRemoteImages,
        stagedImages,
      }

      let resultId: string | null = null
      let warnings: string[] = []
      let enrichedExisting = false

      if (selectedBunjangOrder) {
        // Resolve immediately before saving. Do not trust only the UI state:
        // another sync may have created the purchase since the order was selected.
        const existingTarget = await resolveExistingBunjangOrder(
          selectedBunjangOrder.orderId,
        )

        setExistingBunjangTarget(existingTarget)

        if (existingTarget) {
          const enrichmentResponse = await fetch(
            \`/api/purchases/\${existingTarget.id}/bunjang-listing-enrichment\`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                orderId: selectedBunjangOrder.orderId,
                listing: listingPayload,
              }),
            },
          )

          const enrichmentResult = (await enrichmentResponse.json()) as {
            id?: string
            error?: string
            warnings?: string[]
          }

          if (!enrichmentResponse.ok || !enrichmentResult.id) {
            throw new Error(
              enrichmentResult.error ||
                'Der bestehende Einkauf konnte nicht um die Listing-Daten ergänzt werden.',
            )
          }

          resultId = enrichmentResult.id
          warnings = enrichmentResult.warnings ?? []
          enrichedExisting = true
        }
      }

      if (!resultId) {
        const response = await fetch('/api/purchases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(listingPayload),
        })

        const result = (await response.json()) as {
          id?: string
          error?: string
          warnings?: string[]
        }

        if (!response.ok || !result.id) {
          throw new Error(
            result.error || 'Der Einkauf konnte nicht gespeichert werden.',
          )
        }

        resultId = result.id
        warnings = result.warnings ?? []

        if (selectedBunjangOrder) {
          try {
            const enrichmentResponse = await fetch(
              \`/api/purchases/\${resultId}/bunjang-order-enrichment\`,
              {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  record: selectedBunjangOrder,
                  autoAssignOlaeet: true,
                }),
              },
            )

            const enrichmentResult = (await enrichmentResponse.json()) as {
              error?: string
              warnings?: string[]
            }

            if (!enrichmentResponse.ok) {
              warnings.push(
                enrichmentResult.error ||
                  'Bunjang-Bestelldaten konnten nicht vollständig ergänzt werden.',
              )
            } else {
              warnings.push(...(enrichmentResult.warnings ?? []))
            }
          } catch (error) {
            warnings.push(
              error instanceof Error
                ? error.message
                : 'Bunjang-Bestelldaten-Enrichment fehlgeschlagen.',
            )
          }
        }
      }

      const warningQuery = warnings.length
        ? \`&warnings=\${warnings.length}\`
        : ''
      const resultFlag = enrichedExisting ? 'enriched=1' : 'created=1'

      router.push(
        \`/purchases/\${resultId}?\${resultFlag}\${warningQuery}\`,
      )
      router.refresh()`

  src = src.slice(0, createStart) + newSubmit + src.slice(replaceEnd)
}

// ---------------------------------------------------------------------------
// 6. Remove now-obsolete v56 post-create enrichment if a partial previous
// patch left it behind after the new flow.
// ---------------------------------------------------------------------------
if (src.includes('let enrichmentWarningCount = 0')) {
  const start = src.indexOf('      let enrichmentWarningCount = 0')
  const routerLineStart = src.indexOf('      router.push(', start)

  if (start >= 0 && routerLineStart >= 0) {
    // Only remove if the old block is outside our new v60 submit path.
    const before = src.slice(Math.max(0, start - 500), start)
    if (!before.includes('const resultFlag = enrichedExisting')) {
      // Conservative: leave it rather than deleting unrelated code.
      console.log(
        'v60 Hinweis: alter v56-Enrichment-Block erkannt, aber nicht automatisch entfernt.',
      )
    }
  }
}

fs.writeFileSync(file, src)
console.log('v60: URL-Import-Dedup erfolgreich in purchase-import-form.tsx eingebaut.')
