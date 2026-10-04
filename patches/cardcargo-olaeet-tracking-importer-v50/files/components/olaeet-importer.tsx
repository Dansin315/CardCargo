'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { parseOlaeetImportText } from '@/lib/olaeet-import'

interface ImportResponse {
  error?: string
  summary?: {
    total: number
    created: number
    updated: number
    exact: number
    unmatched: number
    conflicts: number
  }
  packages?: Array<{
    packageId: string
    externalPackageId: string | null
    domesticTrackingNumber: string | null
    action: 'created' | 'updated'
    match: 'exact' | 'unmatched' | 'conflict'
    matchedPurchases: Array<{ id: string; title: string }>
    message: string
  }>
}

export function OlaeetImporter() {
  const [rawText, setRawText] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [autoAssign, setAutoAssign] = useState(true)
  const [updatePurchaseStatus, setUpdatePurchaseStatus] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResponse | null>(null)

  const parsed = useMemo(() => parseOlaeetImportText(rawText, year), [rawText, year])

  async function readClipboard() {
    setMessage(null)
    try {
      const text = await navigator.clipboard.readText()
      setRawText(text)
      if (!text.trim()) setMessage('Die Zwischenablage ist leer.')
    } catch {
      setMessage(
        'Zwischenablage konnte nicht gelesen werden. Füge den OLAEET-Text stattdessen mit Strg+V ein.',
      )
    }
  }

  async function importRecords() {
    if (!parsed.records.length) {
      setMessage('Es wurden noch keine importierbaren OLAEET-Pakete erkannt.')
      return
    }
    setSubmitting(true)
    setMessage(null)
    setResult(null)
    try {
      const response = await fetch('/api/warehouse-packages/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          records: parsed.records,
          autoAssign,
          updatePurchaseStatus,
        }),
      })
      const data = (await response.json()) as ImportResponse
      if (!response.ok) throw new Error(data.error || 'Import fehlgeschlagen.')
      setResult(data)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>1. OLAEET-Daten übernehmen</h2>
            <p>
              Kopiere die sichtbare Paketliste aus OLAEET. Der Importer erkennt STR-ID,
              Absender, Carrier, Trackingnummer, Maße, Status und Zeitstempel.
            </p>
          </div>
        </div>

        <div className="form-grid two-columns">
          <label>
            Jahr für OLAEET-Zeitstempel
            <input
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(event) =>
                setYear(Number(event.target.value) || new Date().getFullYear())
              }
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'end', gap: 10 }}>
            <button className="button button-secondary" type="button" onClick={readClipboard}>
              Aus Zwischenablage einlesen
            </button>
          </div>

          <label className="field-wide">
            OLAEET-Seitentext oder JSON
            <textarea
              rows={14}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder={'예술/희귀/수집품\nSTR-20260818-CS39KB\n이우*\nCU Post: 460359735791\n15×19×13 cm\nPacking Requested\n08-18 11:59'}
            />
          </label>
        </div>

        {message ? <div className="alert alert-error">{message}</div> : null}
        {parsed.warnings.length ? (
          <div className="alert alert-warning">
            {parsed.warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>2. Erkannte Pakete prüfen</h2>
            <p>{parsed.records.length} Paket(e) erkannt.</p>
          </div>
        </div>

        {parsed.records.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {parsed.records.map((record, index) => (
              <article
                key={`${record.externalPackageId || 'package'}-${index}`}
                style={{
                  border: '1px solid var(--border, #ddd)',
                  borderRadius: 14,
                  padding: 14,
                  display: 'grid',
                  gap: 6,
                }}
              >
                <strong>{record.externalPackageId || 'OLAEET-Paket ohne STR-ID'}</strong>
                <span>
                  {record.senderName || 'Absender ?'} · {record.domesticCarrier || 'Carrier ?'} ·{' '}
                  {record.domesticTrackingNumber || 'Tracking ?'}
                </span>
                <span>
                  {record.lengthCm ?? '–'}×{record.widthCm ?? '–'}×{record.heightCm ?? '–'} cm
                  {' · '}
                  {record.providerStatus || 'Status ?'}
                </span>
                <span>{record.arrivedAt || 'Eingang ?'}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><p>Noch keine Pakete erkannt.</p></div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>3. Tracking-Matching</h2>
            <p>
              CardCargo vergleicht die OLAEET-Trackingnummer exakt mit den koreanischen
              Trackingnummern deiner Einkäufe. Mehrere Einkäufe dürfen dieselbe Nummer besitzen.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={autoAssign}
              onChange={(event) => setAutoAssign(event.target.checked)}
            />
            Eindeutige Tracking-Treffer automatisch dem OLAEET-Paket zuordnen
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={updatePurchaseStatus}
              onChange={(event) => setUpdatePurchaseStatus(event.target.checked)}
              disabled={!autoAssign}
            />
            Zugeordnete Einkäufe auf „Bei OLAEET“ setzen, sofern sie noch in einem früheren Status sind
          </label>
        </div>

        <button
          className="button button-primary"
          type="button"
          disabled={submitting || !parsed.records.length}
          onClick={importRecords}
        >
          {submitting
            ? 'Importiere …'
            : `${parsed.records.length} Paket${parsed.records.length === 1 ? '' : 'e'} importieren & abgleichen`}
        </button>
      </section>

      {result?.summary ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Importergebnis</h2>
              <p>
                {result.summary.exact} exakt · {result.summary.unmatched} ohne Treffer ·{' '}
                {result.summary.conflicts} Konflikt(e)
              </p>
            </div>
            <Link className="button button-secondary" href="/warehouse-packages">
              OLAEET-Pakete öffnen
            </Link>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {(result.packages ?? []).map((item) => (
              <article
                key={item.packageId}
                style={{
                  border: '1px solid var(--border, #ddd)',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <strong>
                  {item.match === 'exact' ? '✓ ' : item.match === 'conflict' ? '⚠ ' : '– '}
                  {item.externalPackageId || item.domesticTrackingNumber || 'OLAEET-Paket'}
                </strong>
                <p style={{ margin: '6px 0' }}>{item.message}</p>
                {item.matchedPurchases.length ? (
                  <ul style={{ margin: 0 }}>
                    {item.matchedPurchases.map((purchase) => (
                      <li key={purchase.id}>
                        <Link href={`/purchases/${purchase.id}`}>{purchase.title}</Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Browser-Extractor</h2>
            <p>
              Im Repository liegt unter <code>tools/olaeet-extractor</code> eine kleine
              Chrome-/Edge-Erweiterung. Sie liest nur sichtbaren Seitentext oder deine Auswahl
              und kopiert ihn in die Zwischenablage. Keine Cookies, Tokens oder Passwörter werden
              ausgelesen.
            </p>
          </div>
        </div>
        <ol>
          <li>Browser-Erweiterungen öffnen und Entwicklermodus aktivieren.</li>
          <li>„Entpackte Erweiterung laden“ → <code>tools/olaeet-extractor</code>.</li>
          <li>OLAEET-Lagerseite öffnen und auf die CardCargo-Erweiterung klicken.</li>
          <li>Hier „Aus Zwischenablage einlesen“ wählen.</li>
        </ol>
      </section>
    </div>
  )
}
