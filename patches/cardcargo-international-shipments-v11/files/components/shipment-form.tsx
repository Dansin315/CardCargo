'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'
import { formatDate } from '@/lib/format'
import {
  shipmentCurrencies,
  shipmentStatusLabels,
  shipmentStatuses,
  shippingServiceLabels,
  shippingServices,
  type ShipmentRow,
  type ShipmentWarehousePackageChoice,
} from '@/lib/shipments'
import { packageStatusLabels, toDateInput } from '@/lib/warehouse-packages'

type Props = {
  mode: 'create' | 'edit'
  shipmentData?: ShipmentRow
  packages: ShipmentWarehousePackageChoice[]
  selectedWarehousePackageIds?: string[]
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
  return normalized || null
}

export function ShipmentForm({
  mode,
  shipmentData,
  packages,
  selectedWarehousePackageIds = [],
}: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedPackages, setSelectedPackages] = useState<string[]>(
    selectedWarehousePackageIds,
  )
  const [totalWeight, setTotalWeight] = useState(
    shipmentData?.total_weight_grams === null ||
      shipmentData?.total_weight_grams === undefined
      ? ''
      : String(shipmentData.total_weight_grams),
  )

  const selectedWeight = useMemo(
    () =>
      packages
        .filter((warehousePackage) => selectedPackages.includes(warehousePackage.id))
        .reduce((sum, warehousePackage) => sum + Number(warehousePackage.weight_grams || 0), 0),
    [packages, selectedPackages],
  )

  function togglePackage(packageId: string) {
    setSelectedPackages((current) =>
      current.includes(packageId)
        ? current.filter((id) => id !== packageId)
        : [...current, packageId],
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)

    try {
      const form = new FormData(event.currentTarget)
      const numericValues = {
        totalWeightGrams: numberOrNull(form.get('totalWeightGrams')),
        internationalShippingAmount: numberOrNull(
          form.get('internationalShippingAmount'),
        ),
        forwardingFeeAmount: numberOrNull(form.get('forwardingFeeAmount')),
        importTaxAmount: numberOrNull(form.get('importTaxAmount')),
      }

      if (Object.values(numericValues).some(Number.isNaN)) {
        throw new Error('Gewicht und Kosten müssen gültige Zahlen enthalten.')
      }

      const endpoint =
        mode === 'create' ? '/api/shipments' : `/api/shipments/${shipmentData?.id}`
      const response = await fetch(endpoint, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          externalShipmentId: textOrNull(form.get('externalShipmentId')),
          shippingService: String(form.get('shippingService') ?? ''),
          trackingNumber: textOrNull(form.get('trackingNumber')),
          status: String(form.get('status') ?? 'draft'),
          shippedAt: dateOrNull(form.get('shippedAt')),
          estimatedDeliveryAt: dateOrNull(form.get('estimatedDeliveryAt')),
          deliveredAt: dateOrNull(form.get('deliveredAt')),
          ...numericValues,
          currency: String(form.get('currency') ?? 'KRW'),
          notes: textOrNull(form.get('notes')),
          warehousePackageIds: selectedPackages,
        }),
      })

      const result = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !result.id) {
        throw new Error(result.error || 'Die internationale Sendung konnte nicht gespeichert werden.')
      }

      router.push(`/shipments/${result.id}?${mode === 'create' ? 'created' : 'updated'}=1`)
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Die internationale Sendung konnte nicht gespeichert werden.',
      )
      setSubmitting(false)
    }
  }

  const cancelHref = shipmentData ? `/shipments/${shipmentData.id}` : '/shipments'

  return (
    <form className="page-stack" onSubmit={submit}>
      {message ? <div className="alert alert-error">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Sendungsidentifikation</h2>
            <p>Versanddienst, Trackingnummer und aktueller Status.</p>
          </div>
        </div>
        <div className="form-grid two-columns">
          <label>
            OLAEET-Sendungs-ID
            <input
              name="externalShipmentId"
              type="text"
              maxLength={200}
              defaultValue={shipmentData?.external_shipment_id ?? ''}
            />
          </label>
          <label>
            Versanddienst
            <select
              name="shippingService"
              defaultValue={shipmentData?.shipping_service ?? 'fedex_priority'}
            >
              {shippingServices.map((service) => (
                <option key={service} value={service}>
                  {shippingServiceLabels[service]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Internationale Trackingnummer
            <input
              name="trackingNumber"
              type="text"
              maxLength={250}
              defaultValue={shipmentData?.tracking_number ?? ''}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={shipmentData?.status ?? 'draft'}>
              {shipmentStatuses.map((status) => (
                <option key={status} value={status}>
                  {shipmentStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Versanddatum
            <input
              name="shippedAt"
              type="date"
              defaultValue={toDateInput(shipmentData?.shipped_at)}
            />
          </label>
          <label>
            Voraussichtliche Lieferung
            <input
              name="estimatedDeliveryAt"
              type="date"
              defaultValue={toDateInput(shipmentData?.estimated_delivery_at)}
            />
          </label>
          <label>
            Tatsächliche Lieferung
            <input
              name="deliveredAt"
              type="date"
              defaultValue={toDateInput(shipmentData?.delivered_at)}
            />
          </label>
          <label>
            Gesamtgewicht in Gramm
            <input
              name="totalWeightGrams"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              inputMode="decimal"
              value={totalWeight}
              onChange={(event) => setTotalWeight(event.target.value)}
            />
            <button
              className="button button-ghost button-small inline-field-action"
              type="button"
              onClick={() => setTotalWeight(selectedWeight ? String(selectedWeight) : '')}
              disabled={!selectedPackages.length}
            >
              Summe der Paketgewichte übernehmen
            </button>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Kosten</h2>
            <p>Alle Beträge dieser Sendung werden in derselben Währung geführt.</p>
          </div>
        </div>
        <div className="form-grid two-columns">
          <label>
            Internationale Versandkosten
            <input
              name="internationalShippingAmount"
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              inputMode="decimal"
              defaultValue={shipmentData?.international_shipping_amount ?? ''}
            />
          </label>
          <label>
            OLAEET-Servicegebühren
            <input
              name="forwardingFeeAmount"
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              inputMode="decimal"
              defaultValue={shipmentData?.forwarding_fee_amount ?? ''}
            />
          </label>
          <label>
            Zoll- und Einfuhrkosten
            <input
              name="importTaxAmount"
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              inputMode="decimal"
              defaultValue={shipmentData?.import_tax_amount ?? ''}
            />
          </label>
          <label>
            Währung
            <select name="currency" defaultValue={shipmentData?.currency ?? 'KRW'}>
              {shipmentCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="field-wide">
            Notizen
            <textarea
              name="notes"
              rows={5}
              maxLength={10_000}
              defaultValue={shipmentData?.notes ?? ''}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Enthaltene OLAEET-Pakete</h2>
            <p>
              Bereits anderen Sendungen zugeordnete Pakete werden nicht angeboten. Wird eine
              Zuordnung entfernt, ist das Paket wieder auswählbar.
            </p>
          </div>
          <span className="panel-note">{packages.length} verfügbar</span>
        </div>

        {packages.length ? (
          <div className="purchase-checklist">
            {packages.map((warehousePackage) => (
              <label className="purchase-check shipment-package-check" key={warehousePackage.id}>
                <input
                  name="warehousePackageIds"
                  type="checkbox"
                  value={warehousePackage.id}
                  checked={selectedPackages.includes(warehousePackage.id)}
                  onChange={() => togglePackage(warehousePackage.id)}
                />
                <span>
                  <strong>
                    {warehousePackage.external_package_id ||
                      warehousePackage.domestic_tracking_number ||
                      'OLAEET-Paket'}
                  </strong>
                  <small>
                    {warehousePackage.sender_name || 'Absender nicht erfasst'} ·{' '}
                    {packageStatusLabels[warehousePackage.status]} ·{' '}
                    {formatDate(warehousePackage.arrived_at)} ·{' '}
                    {warehousePackage.weight_grams === null
                      ? 'Gewicht unbekannt'
                      : `${Number(warehousePackage.weight_grams).toLocaleString('de-DE')} g`}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Es ist momentan kein nicht zugeordnetes OLAEET-Paket verfügbar.</p>
            <Link className="button button-secondary" href="/warehouse-packages/new">
              OLAEET-Paket erfassen
            </Link>
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
              ? 'Sendung speichern'
              : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  )
}
