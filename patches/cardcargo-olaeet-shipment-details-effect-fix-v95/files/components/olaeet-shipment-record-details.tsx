'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

type GenericRow = Record<string, unknown>

type DetailsPayload = {
  found?: boolean
  error?: string
  shipmentId?: string | null
  externalShipmentId?: string | null
  extraction?: GenericRow | null
  packages?: Array<GenericRow & { warehousePackage?: GenericRow | null }>
}

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '–' : String(value)
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function money(value: unknown, currency: unknown) {
  const amount = numberValue(value)
  if (amount === null) return '–'
  return `${new Intl.NumberFormat('de-DE').format(amount)} ${text(currency) === '–' ? 'KRW' : text(currency)}`
}

function kg(value: unknown) {
  const amount = numberValue(value)
  return amount === null
    ? '–'
    : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(amount)} kg`
}

function dateTime(value: unknown) {
  if (!value) return '–'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function objectValue(value: unknown): GenericRow {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GenericRow)
    : {}
}

function arrayValue(value: unknown): GenericRow[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is GenericRow =>
          Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
      )
    : []
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="cc94-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function OlaeetShipmentRecordDetails() {
  const pathname = usePathname()
  const shipmentRef = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean)
    const shipmentsIndex = parts.lastIndexOf('shipments')
    if (shipmentsIndex < 0 || !parts[shipmentsIndex + 1]) return null
    return decodeURIComponent(parts[shipmentsIndex + 1])
  }, [pathname])

  if (!shipmentRef || shipmentRef === 'new' || shipmentRef === 'olaeet') {
    return null
  }

  // Remount the loader whenever the route points to another shipment.
  // This keeps the initial loading state in sync without synchronously
  // calling setState from an effect (react-hooks/set-state-in-effect).
  return <OlaeetShipmentRecordDetailsLoader key={shipmentRef} shipmentRef={shipmentRef} />
}

function OlaeetShipmentRecordDetailsLoader({ shipmentRef }: { shipmentRef: string }) {
  const [data, setData] = useState<DetailsPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/shipments/olaeet-details?shipmentRef=${encodeURIComponent(shipmentRef)}`)
      .then(async (response) => {
        const json = (await response.json()) as DetailsPayload
        if (!response.ok) throw new Error(json.error || 'OLAEET-Daten konnten nicht geladen werden.')
        return json
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((error) => {
        if (!cancelled) setData({ error: error instanceof Error ? error.message : String(error) })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [shipmentRef])

  if (loading) {
    return <section className="panel cc94-shipment-details"><p>OLAEET-Sendungsdaten werden geladen …</p></section>
  }

  if (!data?.found || !data.extraction) {
    return null
  }

  const extraction = data.extraction
  const address = objectValue(extraction.address)
  const boxes = arrayValue(extraction.boxes)
  const packages = data.packages ?? []
  const currency = extraction.currency || 'KRW'

  return (
    <section className="panel cc94-shipment-details">
      <div className="panel-heading cc94-heading">
        <div>
          <span className="eyebrow">OLAEET · International shipment</span>
          <h2>{text(extraction.external_shipment_id)}</h2>
          <p>
            {text(extraction.provider_status)} · {packages.length}/{text(extraction.expected_item_count)} Pakete ·{' '}
            {boxes.length}/{text(extraction.expected_box_count)} Boxen
          </p>
        </div>
        <div className="cc94-tracking">
          <span>Internationales Tracking</span>
          <strong>{text(extraction.tracking_number)}</strong>
        </div>
      </div>

      <div className="cc94-grid">
        <Field label="Sendungsnummer" value={text(extraction.external_shipment_id)} />
        <Field label="OLAEET Status" value={text(extraction.provider_status)} />
        <Field label="Courier" value={text(extraction.courier)} />
        <Field label="Created At" value={dateTime(extraction.provider_created_at)} />
        <Field label="Completed At" value={dateTime(extraction.provider_completed_at)} />
        <Field label="Payment Transaction ID" value={text(extraction.payment_transaction_id)} />
      </div>

      <div className="cc94-section">
        <h3>Kosten</h3>
        <div className="cc94-grid cc94-cost-grid">
          <Field label="Shipping Amount" value={money(extraction.shipping_amount, currency)} />
          <Field label="Shipping Fee" value={money(extraction.shipping_fee, currency)} />
          <Field label="Additional Fee" value={money(extraction.additional_fee, currency)} />
          <Field label="Insurance Fee" value={money(extraction.insurance_fee, currency)} />
          <Field label="Total Payment" value={money(extraction.total_payment, currency)} />
        </div>
      </div>

      <div className="cc94-section">
        <h3>Empfänger</h3>
        <div className="cc94-grid">
          <Field label="Name" value={text(address.name)} />
          <Field label="Adresse" value={text(address.addressLine1)} />
          <Field label="Stadt" value={text(address.city)} />
          <Field label="PLZ" value={text(address.zipCode)} />
          <Field label="Land" value={text(address.country)} />
          <Field label="Kontakt" value={text(address.contact)} />
        </div>
      </div>

      <div className="cc94-section">
        <h3>Boxen ({boxes.length})</h3>
        <div className="cc94-boxes">
          {boxes.map((box, index) => {
            const dimensions = objectValue(box.dimensions)
            return (
              <article className="cc94-box" key={String(box.boxNumber || index)}>
                <strong>Box {text(box.boxNumber || index + 1)}</strong>
                <span>{text(dimensions.raw)}</span>
                <span>Real: {kg(box.realWeightKg)}</span>
                <span>Volume: {kg(box.volumeWeightKg)}</span>
                <span>Quote: {kg(box.quoteWeightKg)}</span>
              </article>
            )
          })}
        </div>
      </div>

      <div className="cc94-section">
        <div className="cc94-package-heading">
          <div>
            <h3>OLAEET-Pakete</h3>
            <p>Schnellprüfung der tatsächlich dieser internationalen Sendung zugewiesenen Warehouse-Pakete.</p>
          </div>
          <strong>{packages.length}/{text(extraction.expected_item_count)}</strong>
        </div>

        <div className="cc94-package-list">
          {packages.map((pkg, index) => {
            const warehouse = objectValue(pkg.warehousePackage)
            return (
              <article className="cc94-package" key={String(pkg.external_package_id || index)}>
                <span className="cc94-package-index">{index + 1}</span>
                <div className="cc94-package-main">
                  <strong>{text(pkg.external_package_id)}</strong>
                  <span>{text(pkg.item_category)} · {text(pkg.recipient_masked)}</span>
                </div>
                <div className="cc94-package-meta">
                  <strong>{text(pkg.domestic_tracking_number)}</strong>
                  <span>{text(warehouse.status)}</span>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
