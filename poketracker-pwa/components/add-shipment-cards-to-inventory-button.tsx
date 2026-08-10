'use client'

import { useState } from 'react'

interface TransferResponse {
  created?: number
  error?: string
}

export function AddShipmentCardsToInventoryButton({
  shipmentId,
}: {
  shipmentId: string
}) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function transferAllCards() {
    setPending(true)
    setMessage(null)
    setIsError(false)

    try {
      const response = await fetch(`/api/shipments/${shipmentId}/inventory`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      })

      const payload = (await response.json()) as TransferResponse

      if (!response.ok) {
        throw new Error(
          payload.error || 'Die Karten konnten nicht ins Inventar übernommen werden.',
        )
      }

      const created = Number(payload.created ?? 0)

      if (created > 0) {
        setMessage(
          created === 1
            ? '1 Karte wurde ins Inventar übernommen.'
            : `${created} Karten wurden ins Inventar übernommen.`,
        )
      } else {
        setMessage(
          'Keine neuen Karten angelegt. Alle erfassten Karten dieser Sendung sind bereits im Inventar oder die Sendung enthält noch keine erfassten Einzelkarten.',
        )
      }
    } catch (error) {
      setIsError(true)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Die Karten konnten nicht ins Inventar übernommen werden.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="shipment-inventory-transfer">
      <button
        className="button button-primary"
        type="button"
        onClick={transferAllCards}
        disabled={pending}
      >
        {pending ? 'Wird übernommen …' : 'Alle Karten ins Inventar'}
      </button>

      {message ? (
        <small
          className={isError ? 'field-error' : 'form-hint'}
          role={isError ? 'alert' : 'status'}
        >
          {message}
        </small>
      ) : null}
    </div>
  )
}
