'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, formatMoney, purchaseStatusLabels } from '@/lib/format'
import type { PurchaseWithThumbnail } from '@/lib/purchases'
import type { PurchaseStatus } from '@/lib/types'
import { StatusBadge } from '@/components/status-badge'

export const purchaseSortOptions = [
  ['date_desc', 'Kaufdatum: neu nach alt'],
  ['date_asc', 'Kaufdatum: alt nach neu'],
  ['price_desc', 'Preis: hoch nach niedrig'],
  ['price_asc', 'Preis: niedrig nach hoch'],
  ['created_desc', 'Erfasst: neu nach alt'],
  ['created_asc', 'Erfasst: alt nach neu'],
  ['updated_desc', 'Zuletzt geändert'],
  ['seller_asc', 'Verkäufer: A–Z'],
  ['seller_desc', 'Verkäufer: Z–A'],
  ['title_asc', 'Titel: A–Z'],
  ['title_desc', 'Titel: Z–A'],
] as const

export type PurchaseSortKey = (typeof purchaseSortOptions)[number][0]

const purchaseStatuses = Object.keys(purchaseStatusLabels) as PurchaseStatus[]

function purchaseUrl(page: number, sort: PurchaseSortKey) {
  const params = new URLSearchParams()
  if (page > 1) params.set('page', String(page))
  if (sort !== 'date_desc') params.set('sort', sort)
  const suffix = params.toString()
  return suffix ? `/purchases?${suffix}` : '/purchases'
}

export function PurchaseListWorkspace({
  purchases,
  page,
  totalPages,
  totalCount,
  sort,
}: {
  purchases: PurchaseWithThumbnail[]
  page: number
  totalPages: number
  totalCount: number
  sort: PurchaseSortKey
}) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [applyStatus, setApplyStatus] = useState(false)
  const [status, setStatus] = useState<PurchaseStatus>('warehouse_received')
  const [applyPurchasedAt, setApplyPurchasedAt] = useState(false)
  const [purchasedAt, setPurchasedAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const visibleIds = useMemo(() => purchases.map((purchase) => purchase.id), [purchases])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id))
      return [...new Set([...current, ...visibleIds])]
    })
  }

  function toggleOne(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  }

  async function applyBulkEdit() {
    if (!selectedIds.length) {
      setMessage('Wähle mindestens einen Einkauf aus.')
      return
    }
    if (!applyStatus && !applyPurchasedAt) {
      setMessage('Wähle mindestens ein Feld für die Massenbearbeitung aus.')
      return
    }

    const changes: { status?: PurchaseStatus; purchasedAt?: string | null } = {}
    if (applyStatus) changes.status = status
    if (applyPurchasedAt) changes.purchasedAt = purchasedAt || null

    setSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch('/api/purchases/bulk', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, changes }),
      })
      const result = (await response.json()) as { error?: string; updated?: number }
      if (!response.ok) throw new Error(result.error || 'Massenbearbeitung fehlgeschlagen.')
      setMessage(`${result.updated ?? selectedIds.length} Einkauf/Einkäufe aktualisiert.`)
      setSelectedIds([])
      setBulkOpen(false)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Massenbearbeitung fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!totalCount) {
    return (
      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">+</span>
        <h3>Noch keine Einkäufe</h3>
        <p>Importiere dein erstes Bunjang-Angebot inklusive Angebotsbildern.</p>
        <Link className="button button-primary" href="/purchases/new">Einkauf importieren</Link>
      </div>
    )
  }

  return (
    <div className="purchase-workspace">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-left">
          <label className="purchase-sort-control">
            <span>Sortieren nach</span>
            <select
              value={sort}
              onChange={(event) => router.push(purchaseUrl(1, event.target.value as PurchaseSortKey))}
            >
              {purchaseSortOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <span className="panel-note">{totalCount} Einkäufe · 10 pro Seite</span>
        </div>
        <div className="purchase-toolbar-actions">
          <span className="panel-note">{selectedIds.length} ausgewählt</span>
          <button
            className="button button-secondary"
            type="button"
            disabled={!selectedIds.length}
            onClick={() => setBulkOpen((value) => !value)}
          >
            Massenbearbeitung
          </button>
        </div>
      </div>

      {message ? <div className={message.includes('aktualisiert') ? 'alert alert-success' : 'alert alert-error'}>{message}</div> : null}

      {bulkOpen ? (
        <section className="purchase-bulk-panel" aria-label="Massenbearbeitung Einkäufe">
          <div className="purchase-bulk-heading">
            <div>
              <strong>Massenbearbeitung</strong>
              <span>Nur aktivierte Felder werden geändert.</span>
            </div>
            <button className="button button-ghost button-small" type="button" onClick={() => setBulkOpen(false)}>Schließen</button>
          </div>
          <div className="purchase-bulk-grid">
            <label className="purchase-bulk-field">
              <span><input type="checkbox" checked={applyStatus} onChange={(event) => setApplyStatus(event.target.checked)} /> Status ändern</span>
              <select disabled={!applyStatus} value={status} onChange={(event) => setStatus(event.target.value as PurchaseStatus)}>
                {purchaseStatuses.map((entry) => <option key={entry} value={entry}>{purchaseStatusLabels[entry]}</option>)}
              </select>
            </label>
            <label className="purchase-bulk-field">
              <span><input type="checkbox" checked={applyPurchasedAt} onChange={(event) => setApplyPurchasedAt(event.target.checked)} /> Kaufdatum ändern</span>
              <input disabled={!applyPurchasedAt} type="date" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} />
            </label>
          </div>
          <div className="purchase-bulk-actions">
            <button className="button button-primary" type="button" disabled={submitting || (!applyStatus && !applyPurchasedAt)} onClick={applyBulkEdit}>
              {submitting ? 'Wird angewendet …' : `Auf ${selectedIds.length} Einkauf/Einkäufe anwenden`}
            </button>
          </div>
        </section>
      ) : null}

      <div className="purchase-select-all">
        <label>
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
          Alle 10 auf dieser Seite auswählen
        </label>
      </div>

      <div className="purchase-list purchase-list-manage">
        {purchases.map((purchase) => (
          <article className="purchase-manage-row" key={purchase.id}>
            <label className="purchase-select-cell" title="Einkauf auswählen">
              <input
                type="checkbox"
                checked={selectedIds.includes(purchase.id)}
                onChange={() => toggleOne(purchase.id)}
                aria-label={`${purchase.title} auswählen`}
              />
            </label>
            <Link className="purchase-row purchase-row-managed" href={`/purchases/${purchase.id}`}>
              <div className="purchase-thumb">
                {purchase.thumbnailUrl ? <img src={purchase.thumbnailUrl} alt="" /> : <span aria-hidden="true">CC</span>}
              </div>
              <div className="purchase-main">
                <strong>{purchase.title}</strong>
                <span>{purchase.seller_name || 'Verkäufer nicht erfasst'} · {formatDate(purchase.purchased_at || purchase.created_at)}</span>
              </div>
              <StatusBadge status={purchase.status} />
              <strong className="purchase-price">{formatMoney(purchase.price_amount, purchase.price_currency)}</strong>
              <span className="row-arrow" aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </div>

      <nav className="purchase-pagination" aria-label="Seitennavigation Einkäufe">
        <Link className={`button button-secondary button-small ${page <= 1 ? 'is-disabled' : ''}`} aria-disabled={page <= 1} href={page <= 1 ? purchaseUrl(1, sort) : purchaseUrl(page - 1, sort)}>← Zurück</Link>
        <div className="purchase-page-numbers">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((entry) => (
            <Link className={entry === page ? 'purchase-page-number active' : 'purchase-page-number'} key={entry} href={purchaseUrl(entry, sort)} aria-current={entry === page ? 'page' : undefined}>{entry}</Link>
          ))}
        </div>
        <Link className={`button button-secondary button-small ${page >= totalPages ? 'is-disabled' : ''}`} aria-disabled={page >= totalPages} href={page >= totalPages ? purchaseUrl(totalPages, sort) : purchaseUrl(page + 1, sort)}>Weiter →</Link>
      </nav>
    </div>
  )
}
