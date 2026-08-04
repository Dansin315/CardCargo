'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import {
  addDaysToDate,
  isValidDateOnly,
  packageStatusLabels,
  packageStatuses,
  toDateInput,
  type PackagePurchaseChoice,
  type WarehousePackageRow,
} from '@/lib/warehouse-packages'

type Props = {
  mode: 'create' | 'edit'
  packageData?: WarehousePackageRow
  purchases: PackagePurchaseChoice[]
  selectedPurchaseIds?: string[]
}

function numberOrNull(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function textOrNull(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function dateOrNull(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return isValidDateOnly(normalized) ? normalized : 'invalid'
}

export function WarehousePackageForm({
  mode,
  packageData,
  purchases,
  selectedPurchaseIds = [],
}: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [arrivedAt, setArrivedAt] = useState(toDateInput(packageData?.arrived_at))
  const storageDeadlineAt = addDaysToDate(arrivedAt, 80)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)

    try {
      const form = new FormData(event.currentTarget)
      const numericValues = {
        weightGrams: numberOrNull(form.get('weightGrams')),
        lengthCm: numberOrNull(form.get('lengthCm')),
        widthCm: numberOrNull(form.get('widthCm')),
        heightCm: numberOrNull(form.get('heightCm')),
      }
      if (Object.values(numericValues).some(Number.isNaN)) {
        throw new Error('Gewicht und Maße müssen gültige Zahlen enthalten.')
      }

      const dateValues = {
        arrivedAt: dateOrNull(form.get('arrivedAt')),
        inspectedAt: dateOrNull(form.get('inspectedAt')),
        storageStartedAt: dateOrNull(form.get('storageStartedAt')),
      }
      if (Object.values(dateValues).includes('invalid')) {
        throw new Error('Mindestens ein Datum ist ungültig.')
      }

      const purchaseIds = form.getAll('purchaseIds').map(String)
      const endpoint =
        mode === 'create'
          ? '/api/warehouse-packages'
          : `/api/warehouse-packages/${packageData?.id}`
      const response = await fetch(endpoint, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          externalPackageId: textOrNull(form.get('externalPackageId')),
          customerCode: textOrNull(form.get('customerCode')),
          domesticTrackingNumber: textOrNull(form.get('domesticTrackingNumber')),
          domesticCarrier: textOrNull(form.get('domesticCarrier')),
          senderName: textOrNull(form.get('senderName')),
          packageDescription: textOrNull(form.get('packageDescription')),
          providerStatus: textOrNull(form.get('providerStatus')),
          status: String(form.get('status') ?? 'expected'),
          ...numericValues,
          ...dateValues,
          notes: textOrNull(form.get('notes')),
          purchaseIds,
        }),
      })

      const result = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !result.id) {
        throw new Error(result.error || 'Das OLAEET-Paket konnte nicht gespeichert werden.')
      }

      router.push(
        `/warehouse-packages/${result.id}?${mode === 'create' ? 'created' : 'updated'}=1`,
      )
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Das OLAEET-Paket konnte nicht gespeichert werden.',
      )
      setSubmitting(false)
    }
  }

  const selected = new Set(selectedPurchaseIds)
  const cancelHref = packageData ? `/warehouse-packages/${packageData.id}` : '/warehouse-packages'

  return (
    <form className="page-stack" onSubmit={submit}>
      {message ? <div className="alert alert-error">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Paketidentifikation</h2>
            <p>Mindestens Paket-ID oder koreanische Trackingnummer erfassen.</p>
          </div>
        </div>
        <div className="form-grid two-columns">
          <label>
            OLAEET-Paket-ID
            <input
              name="externalPackageId"
              type="text"
              maxLength={200}
              defaultValue={packageData?.external_package_id ?? ''}
            />
          </label>
          <label>
            Kundencode / Suite-Code
            <input
              name="customerCode"
              type="text"
              maxLength={100}
              defaultValue={packageData?.customer_code ?? ''}
            />
          </label>
          <label>
            Koreanische Trackingnummer
            <input
              name="domesticTrackingNumber"
              type="text"
              maxLength={200}
              defaultValue={packageData?.domestic_tracking_number ?? ''}
            />
          </label>
          <label>
            Koreanischer Paketdienst
            <input
              name="domesticCarrier"
              type="text"
              maxLength={120}
              placeholder="z. B. CJ Logistics"
              defaultValue={packageData?.domestic_carrier ?? ''}
            />
          </label>
          <label>
            Händler / Absender
            <input
              name="senderName"
              type="text"
              maxLength={200}
              defaultValue={packageData?.sender_name ?? ''}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={packageData?.status ?? 'expected'}>
              {packageStatuses.map((status) => (
                <option key={status} value={status}>
                  {packageStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-wide">
            Paketbeschreibung
            <textarea
              name="packageDescription"
              rows={3}
              maxLength={2_000}
              defaultValue={packageData?.package_description ?? ''}
            />
          </label>
          <label className="field-wide">
            OLAEET-Originalstatus
            <input
              name="providerStatus"
              type="text"
              maxLength={200}
              placeholder="Originalbezeichnung aus OLAEET"
              defaultValue={packageData?.provider_status ?? ''}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Eingang, Inspektion und Lagerung</h2>
            <p>Kalendertage sowie von OLAEET gemessene Paketdaten.</p>
          </div>
        </div>
        <div className="form-grid two-columns">
          <label>
            Eingang bei OLAEET
            <input
              name="arrivedAt"
              type="date"
              value={arrivedAt}
              onChange={(event) => setArrivedAt(event.target.value)}
            />
          </label>
          <label>
            Inspektionsdatum
            <input
              name="inspectedAt"
              type="date"
              defaultValue={toDateInput(packageData?.inspected_at)}
            />
          </label>
          <label>
            Lagerbeginn
            <input
              name="storageStartedAt"
              type="date"
              defaultValue={toDateInput(packageData?.storage_started_at)}
            />
          </label>
          <label>
            Lagerfrist
            <input
              type="date"
              value={storageDeadlineAt}
              readOnly
              aria-describedby="storage-deadline-help"
            />
            <small id="storage-deadline-help">
              Automatisch: 80 Kalendertage nach dem Eingang bei OLAEET.
            </small>
          </label>
          <label>
            Gewicht in Gramm
            <input
              name="weightGrams"
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              inputMode="decimal"
              defaultValue={packageData?.weight_grams ?? ''}
            />
          </label>
          <div className="dimension-grid field-wide">
            <label>
              Länge (cm)
              <input
                name="lengthCm"
                type="number"
                min="0"
                max="10000"
                step="0.01"
                inputMode="decimal"
                defaultValue={packageData?.length_cm ?? ''}
              />
            </label>
            <label>
              Breite (cm)
              <input
                name="widthCm"
                type="number"
                min="0"
                max="10000"
                step="0.01"
                inputMode="decimal"
                defaultValue={packageData?.width_cm ?? ''}
              />
            </label>
            <label>
              Höhe (cm)
              <input
                name="heightCm"
                type="number"
                min="0"
                max="10000"
                step="0.01"
                inputMode="decimal"
                defaultValue={packageData?.height_cm ?? ''}
              />
            </label>
          </div>
          <label className="field-wide">
            Notizen
            <textarea
              name="notes"
              rows={5}
              maxLength={10_000}
              defaultValue={packageData?.notes ?? ''}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Enthaltene Einkäufe</h2>
            <p>Es werden nur unzugeordnete Einkäufe und die bereits in diesem Paket enthaltenen Einkäufe angezeigt.</p>
          </div>
          <span className="panel-note">{purchases.length} verfügbar</span>
        </div>
        {purchases.length ? (
          <div className="purchase-checklist">
            {purchases.map((purchase) => (
              <label className="purchase-check" key={purchase.id}>
                <input
                  name="purchaseIds"
                  type="checkbox"
                  value={purchase.id}
                  defaultChecked={selected.has(purchase.id)}
                />
                <span>
                  <strong>{purchase.title}</strong>
                  <small>
                    {purchase.source_listing_id ? `Bunjang #${purchase.source_listing_id}` : 'Manuell'}
                    {' · '}
                    {purchase.purchased_at || 'ohne Kaufdatum'}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Keine zuweisbaren Einkäufe vorhanden. Bereits anderen OLAEET-Paketen zugeordnete Einkäufe werden hier nicht angezeigt.</p>
          </div>
        )}
      </section>

      <div className="form-actions">
        <Link className="button button-secondary" href={cancelHref}>
          Abbrechen
        </Link>
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting
            ? 'Speichert …'
            : mode === 'create'
              ? 'OLAEET-Paket speichern'
              : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  )
}
