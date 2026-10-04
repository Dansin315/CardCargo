const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'components/purchase-import-form.tsx'
const file = path.join(appRoot, rel)
if (!fs.existsSync(file)) throw new Error(`Datei nicht gefunden: ${rel}`)

let src = fs.readFileSync(file, 'utf8')

if (src.includes('bunjang-listing-enrichment') && src.includes('existingBunjangTarget')) {
  console.log('v59 ist bereits angewendet.')
  process.exit(0)
}

const backup = `${file}.bak-v59`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)

// Add state that makes the distinction visible in the UI.
const messageState = '  const [bunjangOrderMessage, setBunjangOrderMessage] = useState<string | null>(null)'
if (!src.includes(messageState)) {
  throw new Error('v59: bunjangOrderMessage-State aus v56 nicht gefunden.')
}

src = src.replace(
  messageState,
  `${messageState}\n  const [existingBunjangTarget, setExistingBunjangTarget] = useState<{ id: string; title: string } | null>(null)`,
)

// Replace applyBunjangOrder so selecting an extracted order also resolves an
// already-created CardCargo purchase by durable bunjang_order_id.
const applyStart = src.indexOf('  function applyBunjangOrder(record: BunjangOrderRecord) {')
const loadStart = src.indexOf('  async function loadBunjangOrderExtraction()', applyStart)
if (applyStart < 0 || loadStart < 0) {
  throw new Error('v59: applyBunjangOrder-Block aus v56 nicht gefunden.')
}

const newApply = `  async function resolveExistingBunjangOrder(orderId: string) {
    const response = await fetch(
      \`/api/purchases/bunjang-order-target?orderId=\${encodeURIComponent(orderId)}\`,
      { cache: 'no-store' },
    )
    const result = (await response.json()) as {
      purchase?: { id: string; title: string } | null
      error?: string
    }

    if (!response.ok) {
      throw new Error(result.error || 'Bestehender Bunjang-Einkauf konnte nicht geprüft werden.')
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
          ? \`Bestehender CardCargo-Einkauf „\${target.title}“ gefunden. Beim Speichern werden URL-Daten und Bilder in diesem Einkauf ergänzt; es wird kein neuer Einkauf erstellt.\`
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

src = src.slice(0, applyStart) + newApply + src.slice(loadStart)

// Add a visible badge inside the selected order card.
const selectedOrderMarker = `                <span>Bestellnummer {selectedBunjangOrder.orderId}</span>`
if (!src.includes(selectedOrderMarker)) {
  throw new Error('v59: Anzeige der gewählten Bunjang-Bestellung nicht gefunden.')
}

src = src.replace(
  selectedOrderMarker,
  `${selectedOrderMarker}\n                {existingBunjangTarget ? (\n                  <span><strong>Bestehender Einkauf:</strong> {existingBunjangTarget.title} · wird ergänzt, nicht neu angelegt</span>\n                ) : null}`,
)

// When the order assignment is removed, also clear the resolved target.
src = src.replace(
  `                    setSelectedBunjangOrder(null)\n                    setBunjangOrderMessage('Bestellzuordnung entfernt.')`,
  `                    setSelectedBunjangOrder(null)\n                    setExistingBunjangTarget(null)\n                    setBunjangOrderMessage('Bestellzuordnung entfernt.')`,
)

// Replace the create-first submit path from v56 with a preflight that enriches
// an existing order-linked purchase instead of POSTing a duplicate purchase.
const createStart = src.indexOf(`      const response = await fetch('/api/purchases', {`)
const routerRefresh = src.indexOf('      router.refresh()', createStart)
if (createStart < 0 || routerRefresh < 0) {
  throw new Error('v59: Speicherblock des URL-Imports nicht gefunden.')
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
        // Critical duplicate-prevention preflight. If this request fails, do not
        // silently fall back to creating another purchase.
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
          throw new Error(result.error || 'Der Einkauf konnte nicht gespeichert werden.')
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

      const warningQuery = warnings.length ? \`&warnings=\${warnings.length}\` : ''
      const resultFlag = enrichedExisting ? 'enriched=1' : 'created=1'
      router.push(\`/purchases/\${resultId}?\${resultFlag}\${warningQuery}\`)
      router.refresh()`

src = src.slice(0, createStart) + newSubmit + src.slice(replaceEnd)

fs.writeFileSync(file, src)
console.log('v59: URL-Import unterscheidet bestehende Order-Purchases von neuen Einkäufen.')
