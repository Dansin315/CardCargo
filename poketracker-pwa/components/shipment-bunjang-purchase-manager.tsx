'use client'

import { useEffect, useMemo, useState } from 'react'

type PurchaseView = {
  id: string
  orderId: string | null
  title: string
  sellerName: string | null
  purchasedAt: string | null
  priceAmount: number | null
  priceCurrency: string
  domesticShippingAmount: number | null
  domesticTrackingNumber: string | null
  status: string | null
  itemCount: number
  assigned: boolean
}

type Payload = {
  shipment?: {
    id: string
    externalShipmentId: string
  }
  assigned?: PurchaseView[]
  candidates?: PurchaseView[]
  error?: string
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) return '–'
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency || 'KRW',
      maximumFractionDigits: currency === 'KRW' ? 0 : 2,
    }).format(value)
  } catch {
    return `${new Intl.NumberFormat('de-DE').format(value)} ${currency || ''}`.trim()
  }
}

function formatDate(value: string | null) {
  if (!value) return '–'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('de-DE').format(date)
}

function rowLabel(row: PurchaseView) {
  return row.orderId ? `Bestellung ${row.orderId}` : row.title
}

export function ShipmentBunjangPurchaseManager({
  shipmentRef,
  compact = false,
}: {
  shipmentRef: string
  compact?: boolean
}) {
  const [assigned, setAssigned] = useState<PurchaseView[]>([])
  const [candidates, setCandidates] = useState<PurchaseView[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ shipmentRef })

    fetch(`/api/shipments/bunjang-purchases?${params.toString()}`)
      .then(async (response) => {
        const json = (await response.json()) as Payload
        if (!response.ok) throw new Error(json.error || 'Bunjang-Einkäufe konnten nicht geladen werden.')
        return json
      })
      .then((json) => {
        if (cancelled) return
        setAssigned(Array.isArray(json.assigned) ? json.assigned : [])
        setCandidates(Array.isArray(json.candidates) ? json.candidates : [])
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [shipmentRef])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const unassignedCandidates = useMemo(
    () => candidates.filter((row) => !row.assigned),
    [candidates],
  )
  const assignedItemCount = useMemo(
    () => assigned.reduce((sum, row) => sum + (row.itemCount || 0), 0),
    [assigned],
  )

  async function search() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const params = new URLSearchParams({ shipmentRef })
      if (query.trim()) params.set('q', query.trim())
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const response = await fetch(`/api/shipments/bunjang-purchases?${params.toString()}`)
      const json = (await response.json()) as Payload
      if (!response.ok) throw new Error(json.error || 'Suche fehlgeschlagen.')
      setAssigned(Array.isArray(json.assigned) ? json.assigned : [])
      setCandidates(Array.isArray(json.candidates) ? json.candidates : [])
      setSelected([])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  async function mutate(action: 'add' | 'remove', purchaseIds: string[], addedVia = 'manual') {
    if (!purchaseIds.length) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/shipments/bunjang-purchases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shipmentRef, action, purchaseIds, addedVia }),
      })
      const json = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(json.error || 'Änderung konnte nicht gespeichert werden.')
      await search()
      setMessage(
        action === 'add'
          ? `${purchaseIds.length} Bunjang-Einkauf${purchaseIds.length === 1 ? '' : 'e'} hinzugefügt.`
          : `${purchaseIds.length} Bunjang-Einkauf${purchaseIds.length === 1 ? '' : 'e'} entfernt.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  function selectAllVisible() {
    setSelected(unassignedCandidates.map((row) => row.id))
  }

  if (loading) {
    return (
      <section className={`panel cc106-purchase-manager${compact ? ' cc106-purchase-manager--compact' : ''}`}>
        <p>Bunjang-Einkäufe werden geladen …</p>
      </section>
    )
  }

  return (
    <section className={`panel cc106-purchase-manager${compact ? ' cc106-purchase-manager--compact' : ''}`}>
      <div className="panel-heading cc106-heading">
        <div>
          <span className="eyebrow">Bunjang · manuelle Sendungszuordnung</span>
          <h2>Bunjang-Einkäufe hinzufügen</h2>
          <p>
            Einzelne Bestellungen auswählen oder alle Einkäufe eines Zeitraums übernehmen. Die Zuordnung kann später jederzeit ergänzt oder entfernt werden.
          </p>
        </div>
        <div className="cc106-summary">
          <strong>{assigned.length}</strong>
          <span>Einkäufe</span>
          <small>{assignedItemCount} Einzelkarten</small>
        </div>
      </div>

      {error ? <div className="alert alert-error cc106-notice">{error}</div> : null}
      {message ? <div className="alert alert-success cc106-notice">{message}</div> : null}

      {assigned.length ? (
        <div className="cc106-assigned">
          <div className="cc106-subheading">
            <div>
              <h3>Zugeordnet</h3>
              <p>Diese Einkäufe gehören aktuell zur internationalen Sendung.</p>
            </div>
            <span>{assigned.length}</span>
          </div>
          <div className="cc106-assigned-list">
            {assigned.map((row) => (
              <article className="cc106-assigned-row" key={row.id}>
                <div className="cc106-purchase-copy">
                  <strong>{rowLabel(row)}</strong>
                  <span>{row.title}</span>
                  <small>
                    {formatDate(row.purchasedAt)} · {row.itemCount} Karte{row.itemCount === 1 ? '' : 'n'}
                    {row.sellerName ? ` · ${row.sellerName}` : ''}
                  </small>
                </div>
                <div className="cc106-purchase-price">
                  <strong>{formatMoney(row.priceAmount, row.priceCurrency)}</strong>
                  {row.domesticTrackingNumber ? <small>{row.domesticTrackingNumber}</small> : null}
                </div>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  disabled={busy}
                  onClick={() => mutate('remove', [row.id])}
                >
                  Entfernen
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="cc106-empty-assigned">Noch keine zusätzlichen Bunjang-Einkäufe manuell zugeordnet.</div>
      )}

      <div className="cc106-search-block">
        <div className="cc106-subheading">
          <div>
            <h3>Einkäufe suchen</h3>
            <p>Bestellnummer/Titel einzeln suchen oder einen Zeitraum setzen.</p>
          </div>
        </div>

        <div className="cc106-search-grid">
          <label className="cc106-search-wide">
            <span>Bestellung, Titel, Verkäufer oder Tracking</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="z. B. 424191752 oder Mew"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void search()
                }
              }}
            />
          </label>
          <label>
            <span>Von</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span>Bis</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button className="button button-secondary" type="button" disabled={busy} onClick={() => void search()}>
            {busy ? 'Lädt …' : 'Suchen'}
          </button>
        </div>

        <div className="cc106-actionbar">
          <span>{unassignedCandidates.length} nicht zugeordnete Treffer</span>
          <div>
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={!unassignedCandidates.length || busy}
              onClick={selectAllVisible}
            >
              Alle Treffer markieren
            </button>
            <button
              className="button button-primary button-small"
              type="button"
              disabled={!selected.length || busy}
              onClick={() => void mutate('add', selected, from || to ? 'date_range' : 'manual')}
            >
              {selected.length ? `${selected.length} hinzufügen` : 'Auswahl hinzufügen'}
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={!unassignedCandidates.length || busy || (!from && !to)}
              onClick={() =>
                void mutate(
                  'add',
                  unassignedCandidates.map((row) => row.id),
                  'date_range',
                )
              }
            >
              Zeitraum komplett übernehmen
            </button>
          </div>
        </div>

        <div className="cc106-table-wrap">
          <table className="cc106-purchase-table">
            <thead>
              <tr>
                <th aria-label="Auswahl" />
                <th>Bestellung</th>
                <th>Datum</th>
                <th>Karten</th>
                <th>Kaufpreis</th>
                <th>Tracking</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((row) => (
                <tr key={row.id} className={row.assigned ? 'is-assigned' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.assigned || selectedSet.has(row.id)}
                      disabled={row.assigned || busy}
                      onChange={() => toggle(row.id)}
                      aria-label={`${rowLabel(row)} auswählen`}
                    />
                  </td>
                  <td>
                    <strong>{rowLabel(row)}</strong>
                    <small>{row.title}</small>
                    {row.assigned ? <span className="cc106-assigned-badge">bereits zugeordnet</span> : null}
                  </td>
                  <td>{formatDate(row.purchasedAt)}</td>
                  <td>{row.itemCount}</td>
                  <td>{formatMoney(row.priceAmount, row.priceCurrency)}</td>
                  <td>{row.domesticTrackingNumber || '–'}</td>
                </tr>
              ))}
              {!candidates.length ? (
                <tr>
                  <td colSpan={6} className="cc106-empty-row">
                    Keine Bunjang-Einkäufe für die aktuelle Suche gefunden.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <p className="cc106-footnote">
        Zugeordnete Einkäufe fließen in die Sendungskosten ein. Ihre Purchase Items werden von „Karten ins Inventar übernehmen“ mit derselben SHP-Sendungsreferenz importiert und sind danach automatisch mit „Umsatz“ kompatibel.
      </p>
    </section>
  )
}
