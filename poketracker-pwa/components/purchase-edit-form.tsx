'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { purchaseStatusLabels } from '@/lib/format'
import type { PurchaseRow, PurchaseStatus } from '@/lib/types'

const purchaseStatuses = Object.keys(purchaseStatusLabels) as PurchaseStatus[]

function numberOrNull(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function PurchaseEditForm({ purchase }: { purchase: PurchaseRow }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)

    try {
      const form = new FormData(event.currentTarget)
      const priceAmount = numberOrNull(form.get('priceAmount'))
      const domesticShippingAmount = numberOrNull(form.get('domesticShippingAmount'))
      const serviceFeeAmount = numberOrNull(form.get('serviceFeeAmount'))

      if ([priceAmount, domesticShippingAmount, serviceFeeAmount].some(Number.isNaN)) {
        throw new Error('Preis- und Kostenfelder müssen gültige Zahlen enthalten.')
      }

      const response = await fetch(`/api/purchases/${purchase.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: String(form.get('title') ?? ''),
          description: String(form.get('description') ?? ''),
          sellerName: String(form.get('sellerName') ?? ''),
          priceAmount,
          domesticShippingAmount,
          serviceFeeAmount,
          priceCurrency: String(form.get('priceCurrency') ?? 'KRW'),
          purchasedAt: String(form.get('purchasedAt') ?? '').trim() || null,
          status: String(form.get('status') ?? 'ordered'),
        }),
      })

      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Der Einkauf konnte nicht aktualisiert werden.')

      router.push(`/purchases/${purchase.id}?updated=1`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Der Einkauf konnte nicht aktualisiert werden.')
      setSubmitting(false)
    }
  }

  return (
    <form className="page-stack" onSubmit={submit}>
      {message ? <div className="alert alert-error">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Einkaufsdaten</h2>
            <p>Die Angebots-URL und bereits archivierten Bilder bleiben unverändert.</p>
          </div>
        </div>

        <div className="form-grid two-columns">
          <label className="field-wide">
            Titel
            <input
              name="title"
              type="text"
              required
              maxLength={300}
              defaultValue={purchase.title}
            />
          </label>

          <label>
            Verkäufer
            <input
              name="sellerName"
              type="text"
              maxLength={200}
              defaultValue={purchase.seller_name ?? ''}
            />
          </label>

          <label>
            Kaufdatum
            <input name="purchasedAt" type="date" defaultValue={purchase.purchased_at ?? ''} />
          </label>

          <label>
            Artikelpreis
            <input
              name="priceAmount"
              type="number"
              min="0"
              max="999999999999"
              step="0.01"
              inputMode="decimal"
              defaultValue={purchase.price_amount ?? ''}
            />
          </label>

          <label>
            Versandkosten in Korea
            <input
              name="domesticShippingAmount"
              type="number"
              min="0"
              max="999999999999"
              step="0.01"
              inputMode="decimal"
              defaultValue={purchase.domestic_shipping_amount ?? ''}
            />
          </label>

          <label>
            Service-/Zahlungsgebühren
            <input
              name="serviceFeeAmount"
              type="number"
              min="0"
              max="999999999999"
              step="0.01"
              inputMode="decimal"
              defaultValue={purchase.service_fee_amount ?? ''}
            />
          </label>

          <label>
            Währung
            <input
              name="priceCurrency"
              type="text"
              required
              minLength={3}
              maxLength={3}
              defaultValue={purchase.price_currency}
              autoCapitalize="characters"
            />
          </label>

          <label>
            Status
            <select name="status" defaultValue={purchase.status}>
              {purchaseStatuses.map((status) => (
                <option key={status} value={status}>
                  {purchaseStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="field-wide">
            Beschreibung / Notizen
            <textarea
              name="description"
              rows={8}
              maxLength={10_000}
              defaultValue={purchase.description ?? ''}
            />
          </label>
        </div>
      </section>

      <section className="panel provenance-panel">
        <div>
          <span className="section-label">Importquelle</span>
          <strong>Bunjang {purchase.source_listing_id ? `#${purchase.source_listing_id}` : ''}</strong>
        </div>
        <a
          className="text-link"
          href={purchase.canonical_url || purchase.listing_url}
          target="_blank"
          rel="noreferrer"
        >
          Originalangebot öffnen ↗
        </a>
      </section>

      <div className="form-actions">
        <Link className="button button-secondary" href={`/purchases/${purchase.id}`}>
          Abbrechen
        </Link>
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Speichert …' : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  )
}
