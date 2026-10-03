'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type PreviewItem = {
  id: string
  name: string
  quantity: number
  sourceType: 'bunjang_purchase' | 'olaeet_package'
  storageNumber: string | null
  alreadyInInventory: boolean
}

type PreviewPayload = {
  error?: string
  externalShipmentId?: string
  packageCount?: number
  purchaseItemCount?: number
  cardCount?: number
  existingCardCount?: number
  newCardCount?: number
  bunjangItemCount?: number
  packageItemCount?: number
  preview?: PreviewItem[]
}

type ImportPayload = {
  error?: string
  externalShipmentId?: string
  created?: number
  linkedExisting?: number
  linkedTotal?: number
  candidateCards?: number
  errors?: string[]
  inventoryUrl?: string
}

export function ShipmentInventoryImportPanel({ shipmentRef }: { shipmentRef: string }) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [result, setResult] = useState<ImportPayload | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/shipments/inventory-import?shipmentRef=${encodeURIComponent(shipmentRef)}`)
      .then(async (response) => {
        const json = (await response.json()) as PreviewPayload
        if (!response.ok) throw new Error(json.error || 'Inventar-Kandidaten konnten nicht geladen werden.')
        return json
      })
      .then((json) => {
        if (!cancelled) setPreview(json)
      })
      .catch((error) => {
        if (!cancelled) setPreview({ error: error instanceof Error ? error.message : String(error) })
      })

    return () => {
      cancelled = true
    }
  }, [shipmentRef])

  async function importAll() {
    setBusy(true)
    setResult(null)

    try {
      const response = await fetch('/api/shipments/inventory-import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shipmentRef }),
      })
      const json = (await response.json()) as ImportPayload
      if (!response.ok) throw new Error(json.error || 'Inventar-Import fehlgeschlagen.')
      setResult(json)

      const refresh = await fetch(
        `/api/shipments/inventory-import?shipmentRef=${encodeURIComponent(shipmentRef)}`,
      )
      const refreshed = (await refresh.json()) as PreviewPayload
      if (refresh.ok) setPreview(refreshed)
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  if (!preview) {
    return (
      <div className="cc99-inventory-import">
        <p>Einzelkarten für den Inventar-Import werden geprüft ...</p>
      </div>
    )
  }

  if (preview.error) {
    return (
      <div className="cc99-inventory-import">
        <div className="alert alert-warning">{preview.error}</div>
      </div>
    )
  }

  const newCards = preview.newCardCount ?? 0
  const cardCount = preview.cardCount ?? 0
  const existing = preview.existingCardCount ?? 0
  const externalShipmentId = preview.externalShipmentId || shipmentRef

  return (
    <div className="cc99-inventory-import">
      <div className="cc99-inventory-import-head">
        <div>
          <span className="eyebrow">Inventar-Übernahme</span>
          <h3>Karten dieser Sendung ins Inventar übernehmen</h3>
          <p>
            Berücksichtigt Einzelkarten aus verknüpften Bunjang-Einkäufen und direkt im OLAEET-Paket erfasste Karten.
          </p>
        </div>
        <span className="cc99-shipment-pill">{externalShipmentId}</span>
      </div>

      <div className="cc99-inventory-stats">
        <div><span>Karten gesamt</span><strong>{cardCount}</strong></div>
        <div><span>Bereits im Inventar</span><strong>{existing}</strong></div>
        <div><span>Neu zu übernehmen</span><strong>{newCards}</strong></div>
        <div><span>Purchase Items</span><strong>{preview.purchaseItemCount ?? 0}</strong></div>
      </div>

      <div className="cc99-inventory-source-line">
        <span>{preview.bunjangItemCount ?? 0} aus Bunjang-Einkäufen</span>
        <span>{preview.packageItemCount ?? 0} direkt aus OLAEET-Paketen</span>
        <span>{preview.packageCount ?? 0} Pakete in der Sendung</span>
      </div>

      {(preview.preview?.length ?? 0) > 0 ? (
        <details className="cc99-candidate-preview">
          <summary>Beispielkarten anzeigen</summary>
          <div>
            {preview.preview?.map((item) => (
              <div key={item.id} className="cc99-candidate-row">
                <span>{item.name}</span>
                <small>
                  {item.quantity > 1 ? `${item.quantity}x · ` : ''}
                  {item.storageNumber || (item.sourceType === 'bunjang_purchase' ? 'Bunjang' : 'OLAEET')}
                  {item.alreadyInInventory ? ' · bereits vorhanden' : ''}
                </small>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="cc99-inventory-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={busy || cardCount === 0}
          onClick={() => void importAll()}
        >
          {busy
            ? 'Übernehme Karten ...'
            : newCards > 0
              ? `${newCards} Karte${newCards === 1 ? '' : 'n'} ins Inventar übernehmen`
              : 'Sendungszuordnung aktualisieren'}
        </button>

        <Link
          className="button button-secondary"
          href={`/inventory?shipment=${encodeURIComponent(externalShipmentId)}`}
        >
          Im Inventar filtern
        </Link>
      </div>

      {result?.error ? (
        <div className="alert alert-warning cc99-import-result">{result.error}</div>
      ) : result ? (
        <div className="alert alert-success cc99-import-result">
          {result.created ?? 0} Karte(n) neu übernommen; {result.linkedExisting ?? 0} vorhandene Inventory Unit(s) mit der Sendung verknüpft.
          {(result.errors?.length ?? 0) > 0 ? (
            <details>
              <summary>{result.errors?.length} Hinweis(e)</summary>
              <ul>{result.errors?.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
