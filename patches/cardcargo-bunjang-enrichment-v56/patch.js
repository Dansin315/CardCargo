const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function read(rel) {
  const file = path.join(appRoot, rel)
  if (!fs.existsSync(file)) throw new Error(`Datei nicht gefunden: ${rel}`)
  return fs.readFileSync(file, 'utf8')
}

function write(rel, src) {
  const file = path.join(appRoot, rel)
  const old = fs.readFileSync(file, 'utf8')
  if (old === src) {
    console.log(`Bereits korrekt: ${rel}`)
    return
  }
  const backup = `${file}.bak-v56`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, src)
  console.log(`Aktualisiert: ${rel}`)
}

function patchSyncRoute() {
  const rel = 'app/api/purchases/bunjang-order-sync/route.ts'
  let src = read(rel)

  if (!src.includes('function genericBunjangTitle(')) {
    const marker = `function dateDistanceDays(left: string | null, right: string | null) {`
    const index = src.indexOf(marker)
    if (index < 0) throw new Error(`v56: dateDistanceDays in ${rel} nicht gefunden.`)

    const helper = `function genericBunjangTitle(value: string | null | undefined) {
  const title = normalized(value)
  return !title || title === normalized('예약상품') || title.startsWith('bunjangbestellung')
}

`
    src = src.slice(0, index) + helper + src.slice(index)
  }

  src = src.replace(
    'domestic_carrier: record.domesticCarrier || purchase.domestic_carrier,',
    'domestic_carrier: purchase.domestic_carrier || record.domesticCarrier,',
  )
  src = src.replace(
    'domestic_tracking_number:\n              record.domesticTrackingNumber || purchase.domestic_tracking_number,',
    'domestic_tracking_number:\n              purchase.domestic_tracking_number || record.domesticTrackingNumber,',
  )

  if (!src.includes('const enrichedTitle =')) {
    const updateMarker = `        const { data, error } = await auth.supabase
          .from('purchases')
          .update({`
    const updateIndex = src.indexOf(updateMarker)
    if (updateIndex < 0) throw new Error(`v56: Purchase-Update in ${rel} nicht gefunden.`)

    const enriched = `        const enrichedTitle =
          record.title &&
          genericBunjangTitle(purchase.title) &&
          !genericBunjangTitle(record.title)
            ? record.title
            : purchase.title

`
    src = src.slice(0, updateIndex) + enriched + src.slice(updateIndex)

    const objectMarker = `.update({
            bunjang_order_id: record.orderId,`
    if (!src.includes(objectMarker)) throw new Error(`v56: Update-Objekt in ${rel} nicht gefunden.`)
    src = src.replace(
      objectMarker,
      `.update({
            bunjang_order_id: record.orderId,
            title: enrichedTitle,`,
    )
  }

  // Preserve existing tracking if it differs and report the conflict instead of overwriting it.
  if (!src.includes('const trackingConflict =')) {
    const statusMarker = `        let nextStatus = purchase.status`
    const statusIndex = src.indexOf(statusMarker)
    if (statusIndex < 0) throw new Error(`v56: nextStatus in ${rel} nicht gefunden.`)

    const conflict = `        const currentTracking = normalizeDomesticTrackingNumber(
          purchase.domestic_tracking_number,
        )
        const extractedTracking = normalizeDomesticTrackingNumber(
          record.domesticTrackingNumber,
        )
        const trackingConflict = Boolean(
          currentTracking && extractedTracking && currentTracking !== extractedTracking,
        )

`
    src = src.slice(0, statusIndex) + conflict + src.slice(statusIndex)

    const afterUpdateMarker = `        byOrder.set(record.orderId, purchase)
      }`
    const afterIndex = src.indexOf(afterUpdateMarker, statusIndex)
    if (afterIndex < 0) throw new Error(`v56: Ende des Purchase-Updates in ${rel} nicht gefunden.`)

    const replacement = `        byOrder.set(record.orderId, purchase)

        if (trackingConflict) {
          results.push({
            orderId: record.orderId,
            title: purchase.title,
            action: 'updated',
            purchaseId: purchase.id,
            matchMethod,
            trackingNumber: purchase.domestic_tracking_number,
            olaeetExternalId: null,
            message: \
              \`Bestelldaten ergänzt; vorhandene Trackingnummer wurde nicht überschrieben. Bunjang meldet \${record.domesticTrackingNumber}.\`,
          })
          continue
        }
      }`
    src = src.slice(0, afterIndex) + replacement + src.slice(afterIndex + afterUpdateMarker.length)
  }

  write(rel, src)
}

function patchOrderImporterCache() {
  const rel = 'components/bunjang-order-importer.tsx'
  let src = read(rel)

  if (!src.includes('BUNJANG_ORDER_CACHE_KEY')) {
    const importMarker = `import { parseBunjangOrderImport } from '@/lib/bunjang-order-import'`
    if (!src.includes(importMarker)) throw new Error(`v56: Parser-Import in ${rel} nicht gefunden.`)
    src = src.replace(
      importMarker,
      `${importMarker}\nimport { BUNJANG_ORDER_CACHE_KEY } from '@/lib/bunjang-order-match'`,
    )
  }

  if (!src.includes('function rememberExtraction(')) {
    const clipboardMarker = `  async function clipboard() {`
    const index = src.indexOf(clipboardMarker)
    if (index < 0) throw new Error(`v56: clipboard() in ${rel} nicht gefunden.`)

    const helper = `  function rememberExtraction(text: string) {
    const parsedText = parseBunjangOrderImport(text)
    if (parsedText.records.length) {
      localStorage.setItem(BUNJANG_ORDER_CACHE_KEY, text)
    }
  }

  function updateRawText(text: string) {
    setRawText(text)
    rememberExtraction(text)
  }

`
    src = src.slice(0, index) + helper + src.slice(index)
  }

  src = src.replace('      setRawText(text)', '      updateRawText(text)')
  src = src.replace(
    'onChange={(event) => setRawText(event.target.value)}',
    'onChange={(event) => updateRawText(event.target.value)}',
  )

  const syncMarker = `  async function sync() {
    if (!parsed.records.length) return`
  if (src.includes(syncMarker) && !src.includes('rememberExtraction(rawText)\n    setSubmitting')) {
    src = src.replace(
      syncMarker,
      `  async function sync() {
    if (!parsed.records.length) return
    rememberExtraction(rawText)`,
    )
  }

  write(rel, src)
}

function patchPurchaseImportForm() {
  const rel = 'components/purchase-import-form.tsx'
  let src = read(rel)

  if (src.includes('Bestelldaten übernehmen') && src.includes('BUNJANG_ORDER_CACHE_KEY')) {
    console.log(`URL-Import bereits mit v56 erweitert: ${rel}`)
    return
  }

  const typeImport = `import type { ListingPreview, PurchaseStatus, StagedImageInput } from '@/lib/types'`
  if (!src.includes(typeImport)) throw new Error(`v56: types-Import in ${rel} nicht gefunden.`)
  src = src.replace(
    typeImport,
    `${typeImport}\nimport { parseBunjangOrderImport, type BunjangOrderRecord } from '@/lib/bunjang-order-import'\nimport { BUNJANG_ORDER_CACHE_KEY, rankBunjangOrderMatches } from '@/lib/bunjang-order-match'`,
  )

  const messageState = `  const [message, setMessage] = useState<string | null>(null)`
  if (!src.includes(messageState)) throw new Error(`v56: message-State in ${rel} nicht gefunden.`)
  src = src.replace(
    messageState,
    `${messageState}\n  const [cachedBunjangOrders, setCachedBunjangOrders] = useState<BunjangOrderRecord[]>([])\n  const [selectedBunjangOrder, setSelectedBunjangOrder] = useState<BunjangOrderRecord | null>(null)\n  const [bunjangOrderMessage, setBunjangOrderMessage] = useState<string | null>(null)`,
  )

  const firstEffect = `  useEffect(() => {
    localImagesRef.current = localImages`
  if (!src.includes(firstEffect)) throw new Error(`v56: useEffect-Anker in ${rel} nicht gefunden.`)
  src = src.replace(
    firstEffect,
    `  useEffect(() => {
    try {
      const cached = localStorage.getItem(BUNJANG_ORDER_CACHE_KEY)
      if (!cached) return
      const parsed = parseBunjangOrderImport(cached)
      if (parsed.records.length) setCachedBunjangOrders(parsed.records)
    } catch {
      // Order cache is optional.
    }
  }, [])

${firstEffect}`,
  )

  const submitMarker = `  async function submitPurchase(event: FormEvent<HTMLFormElement>) {`
  const submitIndex = src.indexOf(submitMarker)
  if (submitIndex < 0) throw new Error(`v56: submitPurchase in ${rel} nicht gefunden.`)

  const helpers = `  function applyBunjangOrder(record: BunjangOrderRecord) {
    setSelectedBunjangOrder(record)
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
    setBunjangOrderMessage(
      \`Bunjang-Bestellung \${record.orderId} übernommen. Carrier und Tracking werden nach dem Speichern verknüpft.\`,
    )
  }

  async function loadBunjangOrderExtraction() {
    setBunjangOrderMessage(null)
    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseBunjangOrderImport(text)
      if (!parsed.records.length) {
        throw new Error(
          parsed.warnings[0] ||
            'Keine Bunjang-Bestellungen in der Zwischenablage erkannt.',
        )
      }
      localStorage.setItem(BUNJANG_ORDER_CACHE_KEY, text)
      setCachedBunjangOrders(parsed.records)
      setBunjangOrderMessage(
        \`\${parsed.records.length} Bunjang-Bestellung(en) geladen. Wähle den passenden Treffer.\`,
      )
    } catch (error) {
      setBunjangOrderMessage(
        error instanceof Error
          ? error.message
          : 'Bunjang-Extraction konnte nicht geladen werden.',
      )
    }
  }

`
  src = src.slice(0, submitIndex) + helpers + src.slice(submitIndex)

  // Add post-create enrichment without touching the existing URL/grouping API.
  const routerPushRe = /^([ \t]*)router\.push\(\`\/purchases\/\$\{result\.id\}\?(?:created=1|\$\{resultState\})\$\{warningQuery\}\`\)/m
  const routerMatch = src.match(routerPushRe)
  if (!routerMatch) {
    throw new Error(`v56: router.push-Erfolgszeile in ${rel} nicht gefunden.`)
  }

  const routerLine = routerMatch[0]
  const indent = routerMatch[1]
  const updatedRouterLine = routerLine.replace('${warningQuery}', '${combinedWarningQuery}')
  const enrichment = `${indent}let enrichmentWarningCount = 0
${indent}if (selectedBunjangOrder) {
${indent}  try {
${indent}    const enrichmentResponse = await fetch(
${indent}      \`/api/purchases/\${result.id}/bunjang-order-enrichment\`,
${indent}      {
${indent}        method: 'PATCH',
${indent}        headers: { 'content-type': 'application/json' },
${indent}        body: JSON.stringify({
${indent}          record: selectedBunjangOrder,
${indent}          autoAssignOlaeet: true,
${indent}        }),
${indent}      },
${indent}    )
${indent}    const enrichmentResult = (await enrichmentResponse.json()) as {
${indent}      error?: string
${indent}      warnings?: string[]
${indent}    }
${indent}    if (!enrichmentResponse.ok) enrichmentWarningCount += 1
${indent}    enrichmentWarningCount += enrichmentResult.warnings?.length ?? 0
${indent}  } catch {
${indent}    enrichmentWarningCount += 1
${indent}  }
${indent}}

${indent}const combinedWarningQuery =
${indent}  warningCount + enrichmentWarningCount
${indent}    ? \`&warnings=\${warningCount + enrichmentWarningCount}\`
${indent}    : ''
${updatedRouterLine}`

  src = src.replace(routerPushRe, enrichment)

  // The old warningQuery variable is now redundant.
  src = src.replace(
    /^[ \t]*const warningQuery = warningCount \? `&warnings=\$\{warningCount\}` : ''\r?\n/m,
    '',
  )

  const returnMarker = `  return (\n    <div className="import-flow">`
  const returnIndex = src.indexOf(returnMarker)
  if (returnIndex < 0) throw new Error(`v56: return-Anker in ${rel} nicht gefunden.`)

  const matches = `  const bunjangOrderMatches = rankBunjangOrderMatches(
    {
      externalId: preview?.externalId ?? null,
      title: fields.title,
      sellerName: fields.sellerName,
      priceAmount: fields.priceAmount.trim() ? Number(fields.priceAmount) : null,
    },
    cachedBunjangOrders,
  )

`
  src = src.slice(0, returnIndex) + matches + src.slice(returnIndex)

  const imageHeading = '<h2>Angebotsbilder archivieren</h2>'
  const headingIndex = src.indexOf(imageHeading)
  if (headingIndex < 0) throw new Error(`v56: Angebotsbilder-Überschrift in ${rel} nicht gefunden.`)
  const sectionStart = src.lastIndexOf('<section className="panel">', headingIndex)
  if (sectionStart < 0) throw new Error(`v56: Angebotsbilder-Section in ${rel} nicht gefunden.`)

  const panel = `          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="step-number">3</span>
                <h2>Bunjang-Bestelldaten</h2>
              </div>
              <span className="panel-note">URL-Import + Order-Extraction</span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <button
                className="button button-secondary"
                type="button"
                onClick={loadBunjangOrderExtraction}
              >
                Extraction aus Zwischenablage laden
              </button>
              {selectedBunjangOrder ? (
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => setSelectedBunjangOrder(null)}
                >
                  Bestellzuordnung entfernen
                </button>
              ) : null}
            </div>

            {bunjangOrderMessage ? (
              <div className="alert alert-info">{bunjangOrderMessage}</div>
            ) : null}

            {selectedBunjangOrder ? (
              <article style={{ border: '1px solid var(--border, #ddd)', borderRadius: 14, padding: 14 }}>
                <strong>
                  Zugeordnet: {selectedBunjangOrder.title || \`Bestellung \${selectedBunjangOrder.orderId}\`}
                </strong>
                <div>Bestellnummer {selectedBunjangOrder.orderId}</div>
                <div>
                  {selectedBunjangOrder.sellerName || 'Verkäufer ?'} ·{' '}
                  {selectedBunjangOrder.purchasedAt || 'Kaufdatum ?'}
                </div>
                <div>
                  {selectedBunjangOrder.domesticCarrier || 'Carrier ?'} ·{' '}
                  {selectedBunjangOrder.domesticTrackingNumber || 'Tracking noch nicht vorhanden'}
                </div>
              </article>
            ) : bunjangOrderMatches.length ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {bunjangOrderMatches.slice(0, 5).map((match) => (
                  <article
                    key={match.record.orderId}
                    style={{
                      border: '1px solid var(--border, #ddd)',
                      borderRadius: 14,
                      padding: 14,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong>{match.record.title || \`Bestellung \${match.record.orderId}\`}</strong>
                      <div>
                        #{match.record.orderId} · {match.record.sellerName || 'Verkäufer ?'} ·{' '}
                        {match.record.productAmount === null
                          ? 'Preis ?'
                          : \`\${match.record.productAmount.toLocaleString('de-DE')} KRW\`}
                      </div>
                      <small>
                        {match.confidence === 'exact'
                          ? 'Exakter Treffer'
                          : match.confidence === 'strong'
                            ? 'Sehr wahrscheinlicher Treffer'
                            : 'Möglicher Treffer'}
                        {' · '}
                        {match.reasons.join(', ')}
                      </small>
                    </div>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => applyBunjangOrder(match.record)}
                    >
                      Bestelldaten übernehmen
                    </button>
                  </article>
                ))}
              </div>
            ) : cachedBunjangOrders.length ? (
              <p className="help-text">Keine passende Bestellung im lokalen Extraction-Cache gefunden.</p>
            ) : (
              <p className="help-text">
                Führe den Bunjang Order Extractor aus und lade die Extraction hier oder auf der
                Seite „Bunjang Bestellungen synchronisieren“ ein.
              </p>
            )}
          </section>

`

  src = src.slice(0, sectionStart) + panel + src.slice(sectionStart)

  // Renumber image archive step if it still says 3.
  const newHeadingIndex = src.indexOf(imageHeading, sectionStart + panel.length)
  const step3 = '<span className="step-number">3</span>'
  const stepIndex = src.lastIndexOf(step3, newHeadingIndex)
  if (stepIndex >= 0 && stepIndex > sectionStart) {
    src = src.slice(0, stepIndex) + '<span className="step-number">4</span>' + src.slice(stepIndex + step3.length)
  }

  write(rel, src)
}

patchSyncRoute()
patchOrderImporterCache()
patchPurchaseImportForm()
console.log('v56: Bunjang-Sync und URL-Import erfolgreich erweitert.')
