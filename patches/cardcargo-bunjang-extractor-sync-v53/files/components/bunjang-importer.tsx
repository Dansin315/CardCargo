'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { parseBunjangImportText } from '@/lib/bunjang-import'

interface SyncResult {
  error?: string
  summary?: { total: number; updated: number; created: number; skipped: number; exact: number; pending: number; conflicts: number }
  purchases?: Array<{
    listingId: string
    purchaseId: string | null
    title: string | null
    action: 'updated' | 'created' | 'skipped'
    trackingNumber: string | null
    olaeetMatch: 'exact' | 'pending' | 'conflict' | 'disabled'
    olaeetExternalId: string | null
    message: string
  }>
}

function formatPrice(value: number | null) {
  if (value === null) return '–'
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)} KRW`
}

export function BunjangImporter() {
  const [rawText, setRawText] = useState('')
  const [createMissing, setCreateMissing] = useState(false)
  const [updateShippingStatus, setUpdateShippingStatus] = useState(true)
  const [autoAssignOlaeet, setAutoAssignOlaeet] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)

  const parsed = useMemo(() => parseBunjangImportText(rawText), [rawText])

  async function readClipboard() {
    setMessage(null)
    try {
      const text = await navigator.clipboard.readText()
      setRawText(text)
      if (!text.trim()) setMessage('Die Zwischenablage ist leer.')
    } catch {
      setMessage('Zwischenablage konnte nicht gelesen werden. Füge die Extractor-Daten stattdessen mit Strg+V ein.')
    }
  }

  async function sync() {
    if (!parsed.records.length) {
      setMessage('Es wurden noch keine Bunjang-Einkäufe erkannt.')
      return
    }
    setSubmitting(true)
    setMessage(null)
    setResult(null)
    try {
      const response = await fetch('/api/purchases/bunjang-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ records: parsed.records, createMissing, updateShippingStatus, autoAssignOlaeet }),
      })
      const data = (await response.json()) as SyncResult
      if (!response.ok) throw new Error(data.error || 'Bunjang-Synchronisierung fehlgeschlagen.')
      setResult(data)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bunjang-Synchronisierung fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>1. Bunjang-Daten extrahieren</h2>
            <p>Öffne deine Bunjang-Käufe oder eine Bestelldetailseite und klicke auf die lokale CardCargo-Browser-Erweiterung.</p>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <button className="button button-secondary" type="button" onClick={readClipboard}>Aus Zwischenablage einlesen</button>
        </div>
        <label>
          Bunjang-Extractor-Daten
          <textarea rows={12} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="Hier Extractor-JSON einfügen …" />
        </label>
        {message ? <div className="alert alert-error">{message}</div> : null}
        {parsed.warnings.length ? <div className="alert alert-warning">{parsed.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div> : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>2. Erkannte Einkäufe prüfen</h2>
            <p>{parsed.records.length} erkannt · {parsed.records.filter((item) => item.domesticTrackingNumber).length} mit Tracking</p>
          </div>
        </div>
        {parsed.records.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {parsed.records.map((record) => (
              <article key={record.listingId} style={{ border: '1px solid var(--border, #ddd)', borderRadius: 14, padding: 14, display: 'grid', gap: 6 }}>
                <strong>{record.title || `Bunjang #${record.listingId}`}</strong>
                <span>Bunjang #{record.listingId}</span>
                <span>{record.sellerName || 'Verkäufer ?'} · {record.purchasedAt || 'Kaufdatum ?'} · {formatPrice(record.priceAmount)}</span>
                <span>{record.domesticCarrier || 'Carrier ?'} · {record.domesticTrackingNumber || 'Tracking noch nicht erkannt'}</span>
                {record.warnings.length ? <small>{record.warnings.join(' · ')}</small> : null}
              </article>
            ))}
          </div>
        ) : <div className="empty-state"><p>Noch keine Bunjang-Einkäufe erkannt.</p></div>}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>3. Mit CardCargo synchronisieren</h2>
            <p>Vorhandene Einkäufe werden über die Bunjang-ID erkannt und nur um fehlende bzw. neue Versanddaten ergänzt.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={createMissing} onChange={(event) => setCreateMissing(event.target.checked)} />
            <span><strong>Fehlende Bunjang-Einkäufe anlegen</strong><br />Neue Datensätze werden zunächst ohne archiviertes Angebotsbild angelegt.</span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={updateShippingStatus} onChange={(event) => setUpdateShippingStatus(event.target.checked)} />
            <span>Status bei Tracking auf „In Korea versendet“ und bei OLAEET-Match auf „Bei OLAEET“ setzen.</span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={autoAssignOlaeet} onChange={(event) => setAutoAssignOlaeet(event.target.checked)} />
            <span><strong>OLAEET automatisch zuordnen</strong><br />Exakt gleiche Trackingnummern werden sofort verbunden; Konflikte werden nicht blind umgehängt.</span>
          </label>
        </div>
        <button className="button button-primary" type="button" disabled={submitting || !parsed.records.length} onClick={sync}>
          {submitting ? 'Synchronisiere …' : `${parsed.records.length} Einkauf${parsed.records.length === 1 ? '' : 'e'} synchronisieren`}
        </button>
      </section>

      {result?.summary ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Synchronisierung abgeschlossen</h2>
              <p>{result.summary.updated} aktualisiert · {result.summary.created} neu · {result.summary.skipped} übersprungen · {result.summary.exact} OLAEET-Match(es)</p>
            </div>
            <Link className="button button-secondary" href="/purchases">Einkäufe öffnen</Link>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {(result.purchases ?? []).map((item) => (
              <article key={`${item.listingId}-${item.purchaseId || 'missing'}`} style={{ border: '1px solid var(--border, #ddd)', borderRadius: 14, padding: 14 }}>
                <strong>{item.olaeetMatch === 'exact' ? '✓ ' : item.olaeetMatch === 'conflict' ? '⚠ ' : '– '}{item.title || `Bunjang #${item.listingId}`}</strong>
                <p style={{ margin: '6px 0' }}>{item.message}</p>
                <div>Bunjang #{item.listingId}{item.trackingNumber ? ` · Tracking ${item.trackingNumber}` : ''}{item.olaeetExternalId ? ` · ${item.olaeetExternalId}` : ''}</div>
                {item.purchaseId ? <div style={{ marginTop: 8 }}><Link href={`/purchases/${item.purchaseId}`}>Einkauf öffnen</Link></div> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Browser-Erweiterung installieren</h2>
            <p>Nach dem Patch liegt sie unter <code>tools/bunjang-extractor</code>. Es werden keine Cookies, Passwörter oder Login-Tokens exportiert.</p>
          </div>
        </div>
        <ol>
          <li>Chrome/Edge → Erweiterungen → Entwicklermodus.</li>
          <li>„Entpackte Erweiterung laden“ → <code>tools/bunjang-extractor</code>.</li>
          <li>Bunjang-Kaufübersicht oder Bestelldetail öffnen.</li>
          <li>CardCargo Bunjang Extractor → „Bunjang-Daten kopieren“.</li>
          <li>Hier „Aus Zwischenablage einlesen“.</li>
        </ol>
      </section>
    </div>
  )
}
