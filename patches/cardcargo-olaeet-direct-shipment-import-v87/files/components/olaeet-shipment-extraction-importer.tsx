'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

type ShipmentPackage = {
  externalPackageId: string
  domesticTrackingNumber: string | null
}

type ShipmentPreview = {
  externalShipmentId: string
  providerStatus: string | null
  createdAt: string | null
  courier: string | null
  trackingNumber: string | null
  totalPayment: number | null
  currency: string | null
  expectedItemCount: number | null
  expectedBoxCount: number | null
  extractionComplete: boolean
  packages: ShipmentPackage[]
  boxes: Array<{ boxNumber: number }>
}

type Payload = {
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
  detailsUrl?: string
  warnings?: string[]
}

function parsePreview(text: string) {
  let payload: Payload

  try {
    payload = JSON.parse(text) as Payload
  } catch {
    throw new Error(
      'Die Zwischenablage enthält kein gültiges OLAEET-JSON.',
    )
  }

  const shipment = payload.shipments?.[0]
  if (!shipment?.externalShipmentId) {
    throw new Error(
      'Keine internationale OLAEET-Sendung (SHP-...) erkannt.',
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
      `Extraction unvollständig: ${shipment.packages.length}/` +
        `${shipment.expectedItemCount ?? '?'} Pakete und ` +
        `${shipment.boxes.length}/${shipment.expectedBoxCount ?? '?'} Boxen.`,
    )
  }

  return shipment
}

function formatAmount(
  value: number | null,
  currency: string | null,
) {
  if (value === null) return '–'
  return `${new Intl.NumberFormat('de-DE').format(value)} ${
    currency || 'KRW'
  }`
}

function findFollowingForm(marker: HTMLElement | null) {
  if (!marker) return null

  const forms = [
    ...document.querySelectorAll<HTMLFormElement>('form'),
  ]

  return (
    forms.find((form) =>
      Boolean(
        marker.compareDocumentPosition(form) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ) ?? null
  )
}

export function OlaeetShipmentExtractionImporter() {
  const markerRef = useRef<HTMLDivElement>(null)
  const [rawText, setRawText] = useState('')
  const [preview, setPreview] =
    useState<ShipmentPreview | null>(null)
  const [message, setMessage] =
    useState<string | null>(null)
  const [result, setResult] =
    useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [pasteOpen, setPasteOpen] =
    useState(false)

  // v87 no longer drives the legacy form. Hide it to make the extraction
  // importer the only normal workflow while leaving old code available as an
  // emergency fallback in source.
  useEffect(() => {
    const form = findFollowingForm(
      markerRef.current,
    )
    if (!form) return

    const section =
      form.closest<HTMLElement>('section')
    ;(section || form).style.display = 'none'
  }, [])

  const packageCoverage = useMemo(() => {
    if (!preview) return null
    return `${preview.packages.length}/${
      preview.expectedItemCount ?? '?'
    }`
  }, [preview])

  function inspect(text: string) {
    const shipment = parsePreview(text)
    setRawText(text)
    setPreview(shipment)
    setMessage(
      `${shipment.externalShipmentId}: ` +
        `${shipment.packages.length}/${shipment.expectedItemCount} Pakete und ` +
        `${shipment.boxes.length}/${shipment.expectedBoxCount} Boxen vollständig erkannt.`,
    )
    return shipment
  }

  async function importText(text: string) {
    setBusy(true)
    setMessage(null)
    setResult(null)

    try {
      inspect(text)

      const response = await fetch(
        '/api/shipments/olaeet-import',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: text,
        },
      )

      const data =
        (await response.json()) as ImportResult

      if (!response.ok) {
        throw new Error(
          data.error ||
            'OLAEET-Sendung konnte nicht importiert werden.',
        )
      }

      setResult(data)

      const matched =
        data.matchedPackages ?? 0
      const total =
        data.shipment?.packageCount ?? 0

      setMessage(
        `${data.shipment?.externalShipmentId}: Sendung gespeichert. ` +
          `${matched}/${total} OLAEET-Pakete automatisch zugeordnet.` +
          (data.missingPackages?.length
            ? ` ${data.missingPackages.length} Paket(e) fehlen noch in CardCargo.`
            : ''),
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'OLAEET-Sendung konnte nicht importiert werden.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function importClipboard() {
    try {
      const text =
        await navigator.clipboard.readText()
      await importText(text)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Zwischenablage konnte nicht gelesen werden.',
      )
    }
  }

  return (
    <section
      className="panel"
      ref={markerRef}
    >
      <div className="panel-heading">
        <div>
          <h2>
            OLAEET-Sendung aus Extraction importieren
          </h2>
          <p>
            Die Extraction wird direkt gespeichert.
            Das alte manuelle Sendungsformular wird
            nicht mehr automatisch ausgefüllt.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={importClipboard}
        >
          {busy
            ? 'Importiere …'
            : 'OLAEET-Extraction importieren'}
        </button>

        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() =>
            setPasteOpen((current) => !current)
          }
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
            onChange={(event) =>
              setRawText(event.target.value)
            }
          />
          <div style={{ marginTop: 8 }}>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || !rawText.trim()}
              onClick={() =>
                void importText(rawText)
              }
            >
              JSON importieren
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <div
          className="alert alert-info"
          style={{ marginTop: 12 }}
        >
          {message}
        </div>
      ) : null}

      {preview ? (
        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 10,
          }}
        >
          <div>
            <strong>
              {preview.externalShipmentId}
            </strong>
            <br />
            <small>
              {preview.providerStatus || 'Status –'}
            </small>
          </div>

          <div>
            <strong>
              {preview.courier || 'Courier –'}
            </strong>
            <br />
            <small>
              {preview.trackingNumber ||
                'Tracking –'}
            </small>
          </div>

          <div>
            <strong>
              {formatAmount(
                preview.totalPayment,
                preview.currency,
              )}
            </strong>
            <br />
            <small>Gesamtzahlung</small>
          </div>

          <div>
            <strong>{packageCoverage}</strong>
            <br />
            <small>
              OLAEET-Pakete vollständig
            </small>
          </div>

          <div>
            <strong>
              {preview.boxes.length}/
              {preview.expectedBoxCount ?? '?'}
            </strong>
            <br />
            <small>Boxen vollständig</small>
          </div>

          <div>
            <strong>
              {preview.createdAt || '–'}
            </strong>
            <br />
            <small>OLAEET Created At</small>
          </div>
        </div>
      ) : null}

      {result?.warnings?.length ? (
        <div
          className="alert alert-warning"
          style={{ marginTop: 12 }}
        >
          {result.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      {result?.missingPackages?.length ? (
        <div
          className="alert alert-warning"
          style={{ marginTop: 12 }}
        >
          Noch nicht in CardCargo gefundene Pakete:{' '}
          {result.missingPackages.join(', ')}
        </div>
      ) : null}

      {result?.detailsUrl ? (
        <div style={{ marginTop: 12 }}>
          <Link
            className="button button-secondary"
            href={result.detailsUrl}
          >
            Vollständige Sendungsdetails öffnen
          </Link>
        </div>
      ) : null}
    </section>
  )
}
