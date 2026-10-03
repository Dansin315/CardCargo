'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function PurchaseDomesticTrackingEditor({
  purchaseId,
  domesticCarrier,
  domesticTrackingNumber,
}: {
  purchaseId: string
  domesticCarrier: string | null
  domesticTrackingNumber: string | null
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)

    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch(`/api/purchases/${purchaseId}/domestic-tracking`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domesticCarrier: String(form.get('domesticCarrier') ?? '').trim() || null,
          domesticTrackingNumber:
            String(form.get('domesticTrackingNumber') ?? '').trim() || null,
        }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(result.error || 'Trackingdaten konnten nicht gespeichert werden.')
      }
      setMessage('Koreanische Trackingdaten gespeichert.')
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Trackingdaten konnten nicht gespeichert werden.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border, #ddd)' }}>
      <div style={{ marginBottom: 12 }}>
        <strong>Koreanischer Inlandsversand</strong>
        <p style={{ margin: '4px 0 0' }}>
          Diese Trackingnummer ist der primäre Schlüssel für die automatische OLAEET-Zuordnung.
        </p>
      </div>
      <form className="form-grid two-columns" onSubmit={submit}>
        <label>
          Carrier
          <input
            name="domesticCarrier"
            type="text"
            maxLength={120}
            defaultValue={domesticCarrier ?? ''}
            placeholder="z. B. CU Post, GS Postbox, Korea Post"
          />
        </label>
        <label>
          Trackingnummer
          <input
            name="domesticTrackingNumber"
            type="text"
            maxLength={200}
            defaultValue={domesticTrackingNumber ?? ''}
            placeholder="z. B. 460359735791"
            autoComplete="off"
          />
        </label>
        <div className="field-wide" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="button button-secondary" type="submit" disabled={saving}>
            {saving ? 'Speichern …' : 'Tracking speichern'}
          </button>
          {message ? <span>{message}</span> : null}
        </div>
      </form>
    </div>
  )
}
