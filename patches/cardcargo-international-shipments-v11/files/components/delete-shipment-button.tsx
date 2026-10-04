'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function DeleteShipmentButton({
  shipmentId,
  label,
}: {
  shipmentId: string
  label: string
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function removeShipment() {
    const confirmed = window.confirm(
      `„${label}“ wirklich löschen?\n\nDie OLAEET-Pakete bleiben erhalten und werden wieder für andere Sendungen verfügbar. Dieser Vorgang kann nicht rückgängig gemacht werden.`,
    )
    if (!confirmed) return

    setDeleting(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'DELETE',
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(result.error || 'Die Sendung konnte nicht gelöscht werden.')
      }

      router.push('/shipments?deleted=1')
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Die Sendung konnte nicht gelöscht werden.',
      )
      setDeleting(false)
    }
  }

  return (
    <div className="delete-action">
      <button
        className="button button-danger"
        type="button"
        onClick={removeShipment}
        disabled={deleting}
      >
        {deleting ? 'Löscht …' : 'Sendung löschen'}
      </button>
      {message ? <span className="inline-error">{message}</span> : null}
    </div>
  )
}
