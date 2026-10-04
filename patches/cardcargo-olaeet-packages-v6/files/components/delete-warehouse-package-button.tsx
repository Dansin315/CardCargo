'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function DeleteWarehousePackageButton({
  packageId,
  label,
}: {
  packageId: string
  label: string
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function removePackage() {
    const confirmed = window.confirm(
      `„${label}“ wirklich löschen?\n\nDie Zuordnungen zu Einkäufen werden entfernt. Die Einkäufe selbst bleiben erhalten. Dieser Vorgang kann nicht rückgängig gemacht werden.`,
    )
    if (!confirmed) return

    setDeleting(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/warehouse-packages/${packageId}`, {
        method: 'DELETE',
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(result.error || 'Das OLAEET-Paket konnte nicht gelöscht werden.')
      }

      router.push('/warehouse-packages?deleted=1')
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Das OLAEET-Paket konnte nicht gelöscht werden.',
      )
      setDeleting(false)
    }
  }

  return (
    <div className="delete-action">
      <button
        className="button button-danger"
        type="button"
        onClick={removePackage}
        disabled={deleting}
      >
        {deleting ? 'Löscht …' : 'Paket löschen'}
      </button>
      {message ? <span className="inline-error">{message}</span> : null}
    </div>
  )
}
