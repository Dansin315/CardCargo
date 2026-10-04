'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

type ShipmentPackage = {
  externalPackageId: string
  itemCategory: string | null
  recipientMasked: string | null
  domesticTrackingNumber: string | null
  rawRowText?: string
}

type ShipmentBox = {
  boxNumber: number
  dimensions: {
    widthCm: number
    heightCm: number
    lengthCm: number
    raw: string
  } | null
  realWeightKg: number | null
  volumeWeightKg: number | null
  quoteWeightKg: number | null
}

type ShipmentPreview = {
  externalShipmentId: string
  providerStatus: string | null
  createdAt: string | null
  completedAt: string | null
  courier: string | null
  trackingNumber: string | null
  trackingNumbers?: string[]
  paymentTransactionId: string | null
  shippingAmount: number | null
  shippingFee: number | null
  additionalFee: number | null
  insuranceFee: number | null
  totalPayment: number | null
  currency: string | null
  address: {
    name: string | null
    addressLine1: string | null
    city: string | null
    country: string | null
    zipCode: string | null
    contact: string | null
  }
  packages: ShipmentPackage[]
  boxes: ShipmentBox[]
  expectedItemCount: number | null
  expectedBoxCount: number | null
  extractionComplete: boolean
  pageUrl: string | null
  rawText: string
  diagnostics?: Record<string, unknown>
}

type ExtractionPayload = {
  source?: string
  version?: string | number
  kind?: string
  extractedAt?: string
  shipments?: ShipmentPreview[]
}

type ImportResult = {
  error?: string
  shipment?: {
    externalShipmentId: string
    trackingNumber: string | null
    totalPayment: number | null
    currency: string
    packageCount: number
    boxCount: number
  }
  matchedPackages?: number
  missingPackages?: string[]
  baseShipmentTable?: string | null
  existingPackageLinkTable?: string | null
  existingPackageLinks?: number
  directPackageLinkColumn?: string | null
  directPackageLinks?: number
  fullDetailsStored?: boolean
  detailsUrl?: string | null
  warnings?: string[]
}

type Notice = {
  kind: 'info' | 'success' | 'warning' | 'error'
  text: string
}

function parseExtraction(text: string) {
  let payload: ExtractionPayload

  try {
    payload = JSON.parse(text) as ExtractionPayload
  } catch {
    throw new Error(
      'Die Zwischenablage enthält kein gültiges OLAEET-Extractor-JSON.',
    )
  }

  const shipment = payload.shipments?.[0]
  if (!shipment?.externalShipmentId) {
    throw new Error(
      'Keine internationale OLAEET-Sendung mit SHP-... ID erkannt.',
    )
  }

  if (
    !shipment.extractionComplete ||
    shipment.expectedItemCount === null ||
    shipment.expectedBoxCount === null ||
    shipment.packages.length !== shipment.expectedItemCount ||
    shipment.boxes.length !== shipment.expectedBoxCount
  ) {
    throw new Error(
      `Extraction unvollständig: ${shipment.packages.length}/${shipment.expectedItemCount ?? '?'} Pakete und ` +
        `${shipment.boxes.length}/${shipment.expectedBoxCount ?? '?'} Boxen.`,
    )
  }

  return { payload, shipment }
}

function formatAmount(value: number | null, currency: string | null) {
  if (value === null) return '–'
  return `${new Intl.NumberFormat('de-DE').format(value)} ${currency || 'KRW'}`
}

function formatWeight(value: number | null) {
  return value === null ? '–' : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(value)} kg`
}

function formatDateTime(value: string | null) {
  if (!value) return '–'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function findFollowingForm(marker: HTMLElement | null) {
  if (!marker) return null
  const forms = [...document.querySelectorAll<HTMLFormElement>('form')]
  return (
    forms.find((form) =>
      Boolean(
        marker.compareDocumentPosition(form) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ) ?? null
  )
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <small style={{ opacity: 0.65 }}>{label}</small>
      <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

export function OlaeetShipmentExtractionImporter() {
  const markerRef = useRef<HTMLDivElement>(null)
  const [rawText, setRawText] = useState('')
  const [payload, setPayload] = useState<ExtractionPayload | null>(null)
  const [shipment, setShipment] = useState<ShipmentPreview | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)

  useEffect(() => {
    const form = findFollowingForm(markerRef.current)
    if (!form) return
    const section = form.closest<HTMLElement>('section')
    ;(section || form).style.display = 'none'
  }, [])

  const packageCoverage = useMemo(() => {
    if (!shipment) return '–'
    return `${shipment.packages.length}/${shipment.expectedItemCount ?? '?'}`
  }, [shipment])

  function loadText(text: string) {
    const parsed = parseExtraction(text)
    setRawText(text)
    setPayload(parsed.payload)
    setShipment(parsed.shipment)
    setResult(null)
    setNotice({
      kind: 'success',
      text:
        `${parsed.shipment.externalShipmentId}: Extraction vollständig übernommen. ` +
        `${parsed.shipment.packages.length}/${parsed.shipment.expectedItemCount} Pakete und ` +
        `${parsed.shipment.boxes.length}/${parsed.shipment.expectedBoxCount} Boxen erkannt. ` +
        'Prüfe die Details und speichere die Sendung anschließend.',
    })
  }

  async function loadClipboard() {
    setBusy(true)
    try {
      const text = await navigator.clipboard.readText()
      loadText(text)
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Zwischenablage konnte nicht gelesen werden.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function saveShipment() {
    if (!payload || !shipment || !rawText.trim()) return

    setBusy(true)
    setResult(null)
    setNotice({
      kind: 'info',
      text: `${shipment.externalShipmentId} wird in CardCargo gespeichert …`,
    })

    try {
      const response = await fetch('/api/shipments/olaeet-import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: rawText,
      })

      const data = (await response.json()) as ImportResult
      if (!response.ok) {
        throw new Error(
          data.error || 'OLAEET-Sendung konnte nicht gespeichert werden.',
        )
      }

      setResult(data)

      const matched = data.matchedPackages ?? 0
      const total = data.shipment?.packageCount ?? shipment.packages.length
      const warnings = data.warnings?.length ?? 0

      setNotice({
        kind: warnings || data.missingPackages?.length ? 'warning' : 'success',
        text:
          `${shipment.externalShipmentId} wurde gespeichert. ` +
          `${matched}/${total} OLAEET-Pakete wurden erkannt und zugeordnet.` +
          (data.missingPackages?.length
            ? ` ${data.missingPackages.length} Paket(e) fehlen noch in CardCargo.`
            : '') +
          (data.fullDetailsStored
            ? ' Die vollständige Extraction wurde dauerhaft archiviert.'
            : ' Die Hauptsendung wurde gespeichert; die optionale v87-Detailtabelle ist nicht installiert.'),
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'OLAEET-Sendung konnte nicht gespeichert werden.',
      })
    } finally {
      setBusy(false)
    }
  }

  const alertClass =
    notice?.kind === 'error'
      ? 'alert alert-error'
      : notice?.kind === 'warning'
        ? 'alert alert-warning'
        : notice?.kind === 'success'
          ? 'alert alert-success'
          : 'alert alert-info'

  return (
    <section className="panel" ref={markerRef}>
      <div className="panel-heading">
        <div>
          <h2>OLAEET-Sendung aus Extraction importieren</h2>
          <p>
            Übernimm zuerst die Extraction aus der Zwischenablage. CardCargo zeigt
            anschließend alle gelesenen OLAEET-Daten zur Kontrolle an. Erst der
            separate Speichern-Button schreibt die Sendung in CardCargo.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={loadClipboard}
        >
          {shipment ? 'Extraction erneut übernehmen' : 'Aus Zwischenablage übernehmen'}
        </button>

        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => setPasteOpen((current) => !current)}
        >
          JSON einfügen
        </button>
      </div>

      {pasteOpen ? (
        <div style={{ marginTop: 12 }}>
          <textarea
            rows={8}
            value={rawText}
            placeholder="OLAEET-Extractor-JSON hier einfügen …"
            onChange={(event) => setRawText(event.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy || !rawText.trim()}
              onClick={() => {
                try {
                  loadText(rawText)
                } catch (error) {
                  setNotice({
                    kind: 'error',
                    text:
                      error instanceof Error
                        ? error.message
                        : 'Extraction konnte nicht gelesen werden.',
                  })
                }
              }}
            >
              JSON übernehmen
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className={alertClass} style={{ marginTop: 12 }}>
          {notice.text}
        </div>
      ) : null}

      {shipment ? (
        <div style={{ marginTop: 18, display: 'grid', gap: 16 }}>
          <section
            style={{
              border: '1px solid var(--border, #ddd)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 14,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>{shipment.externalShipmentId}</h3>
                <div style={{ opacity: 0.7 }}>
                  {shipment.providerStatus || 'Status –'} · {packageCoverage} Pakete ·{' '}
                  {shipment.boxes.length}/{shipment.expectedBoxCount ?? '?'} Boxen
                </div>
              </div>

              <button
                className="button button-primary"
                type="button"
                disabled={busy}
                onClick={saveShipment}
              >
                {busy ? 'Speichere …' : 'Internationale Sendung speichern'}
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                gap: 14,
              }}
            >
              <DetailValue label="OLAEET Status" value={shipment.providerStatus || '–'} />
              <DetailValue label="Created At" value={formatDateTime(shipment.createdAt)} />
              <DetailValue label="Completed At" value={formatDateTime(shipment.completedAt)} />
              <DetailValue label="Courier" value={shipment.courier || '–'} />
              <DetailValue label="Internationales Tracking" value={shipment.trackingNumber || '–'} />
              <DetailValue label="Payment Transaction ID" value={shipment.paymentTransactionId || '–'} />
              <DetailValue label="OLAEET-URL" value={shipment.pageUrl || '–'} />
            </div>
          </section>

          <section
            style={{
              border: '1px solid var(--border, #ddd)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Kosten</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 14,
              }}
            >
              <DetailValue label="Shipping Amount" value={formatAmount(shipment.shippingAmount, shipment.currency)} />
              <DetailValue label="Shipping Fee" value={formatAmount(shipment.shippingFee, shipment.currency)} />
              <DetailValue label="Additional Fee" value={formatAmount(shipment.additionalFee, shipment.currency)} />
              <DetailValue label="Insurance Fee" value={formatAmount(shipment.insuranceFee, shipment.currency)} />
              <DetailValue label="Total Payment" value={formatAmount(shipment.totalPayment, shipment.currency)} />
            </div>
          </section>

          <section
            style={{
              border: '1px solid var(--border, #ddd)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Empfänger & Adresse</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                gap: 14,
              }}
            >
              <DetailValue label="Name" value={shipment.address.name || '–'} />
              <DetailValue label="Adresse" value={shipment.address.addressLine1 || '–'} />
              <DetailValue label="Stadt" value={shipment.address.city || '–'} />
              <DetailValue label="Land" value={shipment.address.country || '–'} />
              <DetailValue label="PLZ" value={shipment.address.zipCode || '–'} />
              <DetailValue label="Kontakt" value={shipment.address.contact || '–'} />
            </div>
          </section>

          <section
            style={{
              border: '1px solid var(--border, #ddd)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              Boxen ({shipment.boxes.length}/{shipment.expectedBoxCount ?? '?'})
            </h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {shipment.boxes.map((box) => (
                <article
                  key={box.boxNumber}
                  style={{
                    border: '1px solid var(--border, #ddd)',
                    borderRadius: 12,
                    padding: 12,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 10,
                  }}
                >
                  <DetailValue label="Box" value={`Box ${box.boxNumber}`} />
                  <DetailValue label="Maße W×H×L" value={box.dimensions?.raw || '–'} />
                  <DetailValue label="Real Weight" value={formatWeight(box.realWeightKg)} />
                  <DetailValue label="Volume Weight" value={formatWeight(box.volumeWeightKg)} />
                  <DetailValue label="Quote Weight" value={formatWeight(box.quoteWeightKg)} />
                </article>
              ))}
            </div>
          </section>

          <section
            style={{
              border: '1px solid var(--border, #ddd)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              Enthaltene OLAEET-Pakete ({shipment.packages.length}/{shipment.expectedItemCount ?? '?'})
            </h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {shipment.packages.map((pkg, index) => (
                <article
                  key={pkg.externalPackageId}
                  style={{
                    border: '1px solid var(--border, #ddd)',
                    borderRadius: 12,
                    padding: 12,
                    display: 'grid',
                    gridTemplateColumns: 'minmax(40px, auto) minmax(0, 1fr) minmax(170px, auto)',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <strong>{index + 1}</strong>
                  <div style={{ minWidth: 0 }}>
                    <strong>{pkg.externalPackageId}</strong>
                    <div style={{ opacity: 0.7, overflowWrap: 'anywhere' }}>
                      {pkg.itemCategory || 'Kategorie –'} · {pkg.recipientMasked || 'Empfänger –'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{pkg.domesticTrackingNumber || 'Tracking –'}</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <details
            style={{
              border: '1px solid var(--border, #ddd)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
              Technische Extraction-Details anzeigen
            </summary>
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <div>
                <strong>Diagnostics</strong>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {JSON.stringify(shipment.diagnostics ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <strong>Raw Text</strong>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 420, overflow: 'auto' }}>
                  {shipment.rawText || '–'}
                </pre>
              </div>
            </div>
          </details>

          {result ? (
            <section
              style={{
                border: '1px solid var(--border, #ddd)',
                borderRadius: 16,
                padding: 16,
              }}
            >
              <h3 style={{ marginTop: 0 }}>Speicherergebnis</h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12,
                }}
              >
                <DetailValue label="CardCargo Shipment-Tabelle" value={result.baseShipmentTable || '–'} />
                <DetailValue label="Zugeordnete Pakete" value={`${result.matchedPackages ?? 0}/${shipment.packages.length}`} />
                <DetailValue label="Bestehende Relation" value={result.existingPackageLinkTable || result.directPackageLinkColumn || '–'} />
                <DetailValue label="Vollständiges Detailarchiv" value={result.fullDetailsStored ? 'Gespeichert' : 'Optionales v87-Archiv nicht installiert'} />
              </div>

              {result.warnings?.length ? (
                <div className="alert alert-warning" style={{ marginTop: 12 }}>
                  {result.warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              ) : null}

              {result.missingPackages?.length ? (
                <div className="alert alert-warning" style={{ marginTop: 12 }}>
                  Nicht gefundene OLAEET-Pakete: {result.missingPackages.join(', ')}
                </div>
              ) : null}

              {result.detailsUrl ? (
                <div style={{ marginTop: 12 }}>
                  <Link className="button button-secondary" href={result.detailsUrl}>
                    Vollständige gespeicherte Sendungsdetails öffnen
                  </Link>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
