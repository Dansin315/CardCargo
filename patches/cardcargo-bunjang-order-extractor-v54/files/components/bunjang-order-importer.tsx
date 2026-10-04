'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { parseBunjangOrderImport } from '@/lib/bunjang-order-import'

type SyncResult = {
  error?: string
  summary?: {
    total: number
    updated: number
    created: number
    skipped: number
    conflicts: number
    olaeetMatches: number
  }
  orders?: Array<{
    orderId: string
    title: string | null
    action: string
    purchaseId: string | null
    matchMethod: string | null
    trackingNumber: string | null
    olaeetExternalId: string | null
    message: string
  }>
}

function money(value: number | null) {
  return value === null
    ? '–'
    : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)} KRW`
}

export function BunjangOrderImporter() {
  const [rawText, setRawText] = useState('')
  const [createMissing, setCreateMissing] = useState(false)
  const [autoAssignOlaeet, setAutoAssignOlaeet] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)

  const parsed = useMemo(() => parseBunjangOrderImport(rawText), [rawText])

  async function clipboard() {
    setMessage(null)
    try {
      const text = await navigator.clipboard.readText()
      setRawText(text)
      if (!text.trim()) setMessage('Zwischenablage ist leer.')
    } catch {
      setMessage('Zwischenablage konnte nicht gelesen werden. JSON mit Strg+V einfügen.')
    }
  }

  async function sync() {
    if (!parsed.records.length) return
    setSubmitting(true)
    setMessage(null)
    setResult(null)
    try {
      const response = await fetch('/api/purchases/bunjang-order-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          records: parsed.records,
          createMissing,
          autoAssignOlaeet,
        }),
      })
      const data = (await response.json()) as SyncResult
      if (!response.ok) throw new Error(data.error || 'Synchronisierung fehlgeschlagen.')
      setResult(data)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Synchronisierung fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>1. Kaufübersicht automatisch scannen</h2>
            <p>
              Der v54-Extractor sammelt die Bestelllinks der Kaufübersicht und lädt deren
              Bestelldetailseiten automatisch. Tracking wird nicht aus der Übersicht geraten.
            </p>
          </div>
        </div>
        <button className="button button-secondary" type="button" onClick={clipboard}>
          Aus Zwischenablage einlesen
        </button>
        <label style={{ marginTop: 14, display: 'block' }}>
          Extractor-JSON
          <textarea
            rows={10}
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="v54-Extractor-Daten hier einfügen …"
          />
        </label>
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
            <h2>2. Bestellungen prüfen</h2>
            <p>
              {parsed.records.length} Bestellung(en) ·{' '}
              {parsed.records.filter((record) => record.domesticTrackingNumber).length} mit Tracking
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {parsed.records.map((record) => (
            <article
              key={record.orderId}
              style={{ border: '1px solid var(--border, #ddd)', borderRadius: 14, padding: 14 }}
            >
              <strong>{record.title || `Bunjang Bestellung #${record.orderId}`}</strong>
              <div>Bestellnummer {record.orderId}</div>
              <div>
                {record.sellerName || 'Verkäufer ?'} · {record.purchasedAt || 'Bestelldatum ?'}
              </div>
              <div>
                Warenwert {money(record.productAmount)} · Versand {money(record.domesticShippingAmount)}
              </div>
              <div>
                {record.domesticCarrier || 'Carrier ?'} ·{' '}
                {record.domesticTrackingNumber || 'Tracking noch nicht vorhanden'}
              </div>
              {record.warnings.length ? <small>{record.warnings.join(' · ')}</small> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>3. CardCargo zuordnen</h2>
            <p>
              Priorität: gespeicherte Bunjang-Bestellnummer → Listing-ID → eindeutiger
              Titel/Verkäufer/Preis-Abgleich.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={createMissing}
              onChange={(event) => setCreateMissing(event.target.checked)}
            />
            Fehlende Einkäufe automatisch anlegen
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={autoAssignOlaeet}
              onChange={(event) => setAutoAssignOlaeet(event.target.checked)}
            />
            Exakte Tracking-Treffer automatisch OLAEET zuordnen
          </label>
        </div>

        <button
          className="button button-primary"
          type="button"
          disabled={submitting || !parsed.records.length}
          onClick={sync}
        >
          {submitting ? 'Synchronisiere …' : 'Bestellungen synchronisieren'}
        </button>
      </section>

      {result?.summary ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Ergebnis</h2>
              <p>
                {result.summary.updated} aktualisiert · {result.summary.created} neu ·{' '}
                {result.summary.skipped} ohne Match · {result.summary.conflicts} Konflikte ·{' '}
                {result.summary.olaeetMatches} OLAEET-Matches
              </p>
            </div>
            <Link href="/purchases" className="button button-secondary">Einkäufe öffnen</Link>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {(result.orders ?? []).map((order) => (
              <article
                key={order.orderId}
                style={{ border: '1px solid var(--border, #ddd)', borderRadius: 14, padding: 14 }}
              >
                <strong>{order.title || `Bestellung ${order.orderId}`}</strong>
                <p style={{ margin: '6px 0' }}>{order.message}</p>
                <div>
                  #{order.orderId}
                  {order.trackingNumber ? ` · ${order.trackingNumber}` : ''}
                  {order.olaeetExternalId ? ` · ${order.olaeetExternalId}` : ''}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
