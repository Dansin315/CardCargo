'use client'

import { useEffect, useState } from 'react'

export interface ExistingBunjangPurchaseMatch {
  id: string
  title: string
  orderId: string
  sourceListingId: string | null
  sellerName: string | null
  priceAmount: number | null
  purchasedAt: string | null
  domesticShippingAmount: number | null
  domesticCarrier: string | null
  domesticTrackingNumber: string | null
  status: string
  score: number
  confidence: 'exact' | 'strong' | 'possible' | 'weak'
  reasons: string[]
}

export function BunjangExistingPurchaseMatches({
  externalId,
  title,
  sellerName,
  priceAmount,
  selectedPurchaseId,
  onUse,
}: {
  externalId: string | null
  title: string
  sellerName: string
  priceAmount: number | null
  selectedPurchaseId: string | null
  onUse: (match: ExistingBunjangPurchaseMatch) => void
}) {
  const [matches, setMatches] = useState<ExistingBunjangPurchaseMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      if (!externalId && !title.trim() && !sellerName.trim() && priceAmount === null) {
        setMatches([])
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        if (externalId) params.set('externalId', externalId)
        if (title.trim()) params.set('title', title.trim())
        if (sellerName.trim()) params.set('sellerName', sellerName.trim())
        if (priceAmount !== null && Number.isFinite(priceAmount)) {
          params.set('priceAmount', String(priceAmount))
        }

        const response = await fetch(
          `/api/purchases/bunjang-existing-match?${params.toString()}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        )

        const result = (await response.json()) as {
          matches?: ExistingBunjangPurchaseMatch[]
          error?: string
        }

        if (!response.ok) {
          throw new Error(result.error || 'Bestehende Bunjang-Einkäufe konnten nicht geprüft werden.')
        }

        if (!controller.signal.aborted) {
          setMatches(result.matches ?? [])
        }
      } catch (fetchError) {
        if (controller.signal.aborted) return
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Bestehende Bunjang-Einkäufe konnten nicht geprüft werden.',
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [externalId, priceAmount, sellerName, title])

  if (loading) {
    return <p className="help-text">Bestehende CardCargo-Einkäufe werden geprüft …</p>
  }

  if (error) {
    return <div className="alert alert-warning">{error}</div>
  }

  if (!matches.length) {
    return null
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
      <p className="help-text">
        Bereits in CardCargo gespeicherte Bunjang-Bestellungen:
      </p>

      {matches.map((match) => {
        const selected = selectedPurchaseId === match.id

        return (
          <article
            key={match.id}
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
              <strong>{match.title}</strong>
              <div>
                Order #{match.orderId} · {match.sellerName || 'Verkäufer ?'} ·{' '}
                {match.priceAmount === null
                  ? 'Preis ?'
                  : `${Number(match.priceAmount).toLocaleString('de-DE')} KRW`}
              </div>
              <div>
                {match.purchasedAt || 'Kaufdatum ?'}
                {match.domesticCarrier ? ` · ${match.domesticCarrier}` : ''}
                {match.domesticTrackingNumber
                  ? ` · ${match.domesticTrackingNumber}`
                  : ''}
              </div>
              <small>
                {match.confidence === 'exact'
                  ? 'Exakter bestehender Treffer'
                  : match.confidence === 'strong'
                    ? 'Sehr wahrscheinlicher bestehender Treffer'
                    : 'Möglicher bestehender Treffer'}
                {' · '}
                {match.reasons.join(', ')}
              </small>
            </div>

            <button
              className={selected ? 'button button-primary' : 'button button-secondary'}
              type="button"
              onClick={() => onUse(match)}
            >
              {selected ? 'Wird ergänzt' : 'Bestehenden Einkauf verwenden'}
            </button>
          </article>
        )
      })}
    </div>
  )
}
