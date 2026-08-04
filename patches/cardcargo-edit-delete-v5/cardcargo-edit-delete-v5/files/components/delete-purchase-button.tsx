'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeletePurchaseButton({ purchaseId, title }: { purchaseId: string; title: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function removePurchase() {
    const confirmed = window.confirm(
      `„${title}“ wirklich löschen?\n\nDer Einkauf, seine Positionen, Paketzuordnungen und archivierten Bilder werden entfernt. Dieser Vorgang kann nicht rückgängig gemacht werden.`,
    )
    if (!confirmed) return

    setDeleting(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/purchases/${purchaseId}`, { method: 'DELETE' })
      const result = (await response.json()) as { error?: string; warnings?: string[] }
      if (!response.ok) throw new Error(result.error || 'Der Einkauf konnte nicht gelöscht werden.')

      const cleanupWarnings = result.warnings?.length ?? 0
      router.push(`/purchases?deleted=1${cleanupWarnings ? `&cleanup=${cleanupWarnings}` : ''}`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Der Einkauf konnte nicht gelöscht werden.')
      setDeleting(false)
    }
  }

  return (
    <div className="delete-action">
      <button
        className="button button-danger"
        type="button"
        onClick={removePurchase}
        disabled={deleting}
      >
        {deleting ? 'Löscht …' : 'Einkauf löschen'}
      </button>
      {message ? <span className="inline-error">{message}</span> : null}
    </div>
  )
}
