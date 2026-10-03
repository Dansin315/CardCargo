'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

import { ShipmentInventoryImportPanel } from '@/components/shipment-inventory-import-panel'
import { ShipmentBunjangPurchaseManager } from '@/components/shipment-bunjang-purchase-manager'
type GenericRow = Record<string, unknown>

type PackageImage = {
  url: string
  filename: string
  source: string
  purchaseId?: string | null
}

type PackageDetail = GenericRow & {
  warehousePackage?: GenericRow | null
  images?: PackageImage[]
}

type PurchaseCostBucket = {
  currency: string
  purchaseCount: number
  orderCount: number
  itemAmount: number
  domesticShippingAmount: number
  serviceFeeAmount: number
  total: number
}

type CustomsCost = {
  amount: number | null
  currency: string
  updatedAt?: string | null
}

type CostSummary = {
  purchaseCount: number
  orderCount: number
  bunjang: {
    currency: string
    itemAmount: number
    domesticShippingAmount: number
    serviceFeeAmount: number
    total: number
    byCurrency: PurchaseCostBucket[]
    hasForeignCurrency: boolean
  }
  olaeet: {
    currency: string
    shippingAmount: number
    shippingFee: number
    additionalFee: number
    insuranceFee: number
    totalPayment: number
  }
  customs: CustomsCost
  totals: {
    primaryCurrency: string
    preCustomsTotal: number | null
    totalWithCustoms: number | null
    customsPending: boolean
    customsSameCurrency: boolean
    hasForeignPurchaseCurrency: boolean
  }
}

type DetailsPayload = {
  found?: boolean
  error?: string
  shipmentId?: string | null
  externalShipmentId?: string | null
  extraction?: GenericRow | null
  packages?: PackageDetail[]
  costSummary?: CostSummary
}

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function money(value: unknown, currency: unknown) {
  const amount = numberValue(value)
  if (amount === null) return '-'
  return `${new Intl.NumberFormat('de-DE').format(amount)} ${text(currency) === '-' ? 'KRW' : text(currency)}`
}

function kg(value: unknown) {
  const amount = numberValue(value)
  return amount === null
    ? '-'
    : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(amount)} kg`
}

function dateTime(value: unknown) {
  if (!value) return '-'
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

function formatMoneyValue(value: number | null, currency: string) {
  if (value === null) return '-'
  return `${new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: currency === 'KRW' ? 0 : 2,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value)} ${currency}`
}

function finalCostLabel(summary: CostSummary) {
  const preCustoms = summary.totals.preCustomsTotal
  const primaryCurrency = summary.totals.primaryCurrency
  const customs = summary.customs

  if (preCustoms === null) return 'Mehrere Währungen'
  if (customs.amount === null) {
    return `${formatMoneyValue(preCustoms, primaryCurrency)} + Zoll offen`
  }
  if (customs.currency === primaryCurrency) {
    return formatMoneyValue(preCustoms + customs.amount, primaryCurrency)
  }
  return `${formatMoneyValue(preCustoms, primaryCurrency)} + ${formatMoneyValue(customs.amount, customs.currency)}`
}

function applyCustoms(summary: CostSummary, customs: CustomsCost): CostSummary {
  const primaryCurrency = summary.totals.primaryCurrency
  const sameCurrency = customs.amount === null || customs.currency === primaryCurrency
  const totalWithCustoms =
    summary.totals.preCustomsTotal !== null && customs.amount !== null && sameCurrency
      ? summary.totals.preCustomsTotal + customs.amount
      : null

  return {
    ...summary,
    customs,
    totals: {
      ...summary.totals,
      totalWithCustoms,
      customsPending: customs.amount === null,
      customsSameCurrency: sameCurrency,
    },
  }
}

function CustomsCostEditor({
  shipmentRef,
  customs,
  onSaved,
}: {
  shipmentRef: string
  customs: CustomsCost
  onSaved: (customs: CustomsCost) => void
}) {
  const [amount, setAmount] = useState(customs.amount === null ? '' : String(customs.amount))
  const [currency, setCurrency] = useState(customs.currency || 'EUR')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/shipments/olaeet-details', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shipmentRef,
          customsAmount: amount.trim() ? Number(amount) : null,
          customsCurrency: currency,
        }),
      })
      const json = (await response.json()) as { error?: string; customs?: CustomsCost }
      if (!response.ok || !json.customs) {
        throw new Error(json.error || 'Zollkosten konnten nicht gespeichert werden.')
      }
      onSaved(json.customs)
      setMessage('Gespeichert')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cc98-customs-editor">
      <div>
        <label htmlFor={`customs-${shipmentRef}`}>Zoll / Einfuhrabgaben</label>
        <div className="cc98-customs-controls">
          <input
            id={`customs-${shipmentRef}`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Noch offen"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <select value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="Zollwährung">
            <option value="EUR">EUR</option>
            <option value="KRW">KRW</option>
            <option value="USD">USD</option>
          </select>
          <button className="button button-secondary button-small" type="button" disabled={saving} onClick={save}>
            {saving ? 'Speichert ...' : 'Speichern'}
          </button>
        </div>
      </div>
      {message ? <small className="cc98-customs-message">{message}</small> : null}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M8.5 4.5 10 2.8h4l1.5 1.7H19a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-10a3 3 0 0 1 3-3h3.5Zm3.5 4a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
        fill="currentColor"
      />
    </svg>
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
    return <section className="panel cc94-shipment-details"><p>OLAEET-Sendungsdaten werden geladen ...</p></section>
  }

  if (!data?.found || !data.extraction) return null

  const extraction = data.extraction
  const address = objectValue(extraction.address)
  const boxes = arrayValue(extraction.boxes)
  const packages = data.packages ?? []
  const currency = extraction.currency || 'KRW'
  const packagesWithImages = packages.filter((pkg) => (pkg.images?.length ?? 0) > 0)
  const imageCount = packages.reduce((sum, pkg) => sum + (pkg.images?.length ?? 0), 0)
  const costs = data.costSummary ?? null
  const bunjangPrimary = costs?.bunjang ?? null
  const otherBunjangCurrencies = costs?.bunjang.byCurrency.filter(
    (bucket) => bucket.currency !== costs.totals.primaryCurrency,
  ) ?? []

  return (
    <section className="panel cc94-shipment-details cc96-shipment-details">
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

            <ShipmentBunjangPurchaseManager shipmentRef={shipmentRef} />

      <ShipmentInventoryImportPanel shipmentRef={shipmentRef} />

      <div className="cc94-section cc98-cost-section">
        <div className="cc98-cost-heading">
          <div>
            <h3>Gesamtkosten der internationalen Sendung</h3>
            <p>
              Bunjang-Einkäufe, koreanischer Inlandsversand, OLAEET-Versand und Gebühren sowie nachträglich erfasste Zollkosten.
            </p>
          </div>
          {costs ? (
            <span className="cc98-order-count">
              {costs.orderCount} Bunjang-Bestellung{costs.orderCount === 1 ? '' : 'en'} · {costs.purchaseCount} Einkauf{costs.purchaseCount === 1 ? '' : 'e'}
            </span>
          ) : null}
        </div>

        {costs && bunjangPrimary ? (
          <>
            <div className="cc98-cost-columns">
              <article className="cc98-cost-card">
                <div className="cc98-cost-card-head">
                  <span>Bunjang</span>
                  <strong>{formatMoneyValue(bunjangPrimary.total, costs.totals.primaryCurrency)}</strong>
                </div>
                <dl>
                  <div><dt>Artikelpreise</dt><dd>{formatMoneyValue(bunjangPrimary.itemAmount, costs.totals.primaryCurrency)}</dd></div>
                  <div><dt>Versand in Korea</dt><dd>{formatMoneyValue(bunjangPrimary.domesticShippingAmount, costs.totals.primaryCurrency)}</dd></div>
                  <div><dt>Service-/Zahlungsgebühren</dt><dd>{formatMoneyValue(bunjangPrimary.serviceFeeAmount, costs.totals.primaryCurrency)}</dd></div>
                  <div className="cc98-cost-subtotal"><dt>Bunjang gesamt</dt><dd>{formatMoneyValue(bunjangPrimary.total, costs.totals.primaryCurrency)}</dd></div>
                </dl>
              </article>

              <article className="cc98-cost-card">
                <div className="cc98-cost-card-head">
                  <span>OLAEET · international</span>
                  <strong>{formatMoneyValue(costs.olaeet.totalPayment, costs.olaeet.currency)}</strong>
                </div>
                <dl>
                  <div><dt>Shipping Amount</dt><dd>{formatMoneyValue(costs.olaeet.shippingAmount, costs.olaeet.currency)}</dd></div>
                  <div><dt>Shipping Fee</dt><dd>{formatMoneyValue(costs.olaeet.shippingFee, costs.olaeet.currency)}</dd></div>
                  <div><dt>Additional Fee</dt><dd>{formatMoneyValue(costs.olaeet.additionalFee, costs.olaeet.currency)}</dd></div>
                  <div><dt>Insurance Fee</dt><dd>{formatMoneyValue(costs.olaeet.insuranceFee, costs.olaeet.currency)}</dd></div>
                  <div className="cc98-cost-subtotal"><dt>Versand & Gebühren gesamt</dt><dd>{formatMoneyValue(costs.olaeet.totalPayment, costs.olaeet.currency)}</dd></div>
                </dl>
              </article>
            </div>

            {otherBunjangCurrencies.length ? (
              <div className="alert alert-warning cc98-currency-warning">
                Einige Bunjang-Einkäufe liegen in einer anderen Währung vor:{' '}
                {otherBunjangCurrencies.map((bucket) => `${formatMoneyValue(bucket.total, bucket.currency)} (${bucket.purchaseCount} Einkauf${bucket.purchaseCount === 1 ? '' : 'e'})`).join(', ')}.
                Ohne hinterlegten Wechselkurs werden diese Beträge nicht in die KRW-Gesamtsumme eingerechnet.
              </div>
            ) : null}

            <div className="cc98-grand-costs">
              <div className="cc98-grand-row">
                <span>Zwischensumme vor Zoll</span>
                <strong>
                  {costs.totals.preCustomsTotal === null
                    ? 'Mehrere Währungen'
                    : formatMoneyValue(costs.totals.preCustomsTotal, costs.totals.primaryCurrency)}
                </strong>
              </div>

              <CustomsCostEditor
                key={`${shipmentRef}-${costs.customs.amount ?? 'open'}-${costs.customs.currency}`}
                shipmentRef={shipmentRef}
                customs={costs.customs}
                onSaved={(customs) =>
                  setData((current) =>
                    current?.costSummary
                      ? { ...current, costSummary: applyCustoms(current.costSummary, customs) }
                      : current,
                  )
                }
              />

              <div className="cc98-grand-row cc98-grand-row-total">
                <span>Gesamtkosten inkl. Zoll</span>
                <strong>{finalCostLabel(costs)}</strong>
              </div>

              {costs.customs.amount !== null && !costs.totals.customsSameCurrency ? (
                <p className="cc98-cost-note">
                  Zoll wurde in {costs.customs.currency} erfasst. CardCargo addiert unterschiedliche Währungen nicht ohne Wechselkurs; deshalb bleibt der KRW-Betrag getrennt vom Zollbetrag.
                </p>
              ) : costs.customs.amount === null ? (
                <p className="cc98-cost-note">
                  Die endgültigen Gesamtkosten werden vervollständigt, sobald die Zoll-/Einfuhrabgaben nach Ankunft in Deutschland feststehen.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="cc94-grid cc94-cost-grid">
            <Field label="Shipping Amount" value={money(extraction.shipping_amount, currency)} />
            <Field label="Shipping Fee" value={money(extraction.shipping_fee, currency)} />
            <Field label="Additional Fee" value={money(extraction.additional_fee, currency)} />
            <Field label="Insurance Fee" value={money(extraction.insurance_fee, currency)} />
            <Field label="Total Payment" value={money(extraction.total_payment, currency)} />
          </div>
        )}
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
            <p>Direkt über die CardCargo-Paket-ID, OLAEET Storage Number und Domestic Tracking verknüpft.</p>
          </div>
          <strong>{packages.length}/{text(extraction.expected_item_count)}</strong>
        </div>

        <div className="cc94-package-list">
          {packages.map((pkg, index) => {
            const warehouse = objectValue(pkg.warehousePackage)
            const images = pkg.images ?? []
            const firstImage = images[0] ?? null
            const warehouseId = String(warehouse.id || pkg.warehouse_package_id || '')

            return (
              <article className="cc94-package cc96-package" key={String(pkg.external_package_id || index)}>
                <span className="cc94-package-index">{index + 1}</span>

                <div className="cc96-package-preview-cell">
                  {firstImage ? (
                    <span className="cc96-preview-wrap">
                      <button
                        className="cc96-preview-trigger"
                        type="button"
                        aria-label={`Erstes Bild von ${text(pkg.external_package_id)} anzeigen`}
                      >
                        <CameraIcon />
                      </button>
                      <span className="cc96-preview-popover" role="tooltip">
                        <img src={firstImage.url} alt={`Vorschau ${text(pkg.external_package_id)}`} />
                      </span>
                    </span>
                  ) : (
                    <span className="cc96-preview-empty" title="Kein archiviertes Bild gefunden">
                      <CameraIcon />
                    </span>
                  )}
                </div>

                <div className="cc94-package-main">
                  {warehouseId ? (
                    <Link className="cc96-package-link" href={`/warehouse-packages/${encodeURIComponent(warehouseId)}`}>
                      {text(pkg.external_package_id)}
                    </Link>
                  ) : (
                    <strong>{text(pkg.external_package_id)}</strong>
                  )}
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

      <div className="cc94-section cc96-package-images-section">
        <div className="cc94-package-heading">
          <div>
            <h3>Paketbilder</h3>
            <p>Archivierte OLAEET-Paketbilder und Bilder der mit dem Paket verknüpften Einkäufe.</p>
          </div>
          <strong>{imageCount} Bilder · {packagesWithImages.length}/{packages.length} Pakete</strong>
        </div>

        {packagesWithImages.length ? (
          <div className="cc96-package-image-groups">
            {packagesWithImages.map((pkg) => {
              const warehouse = objectValue(pkg.warehousePackage)
              const warehouseId = String(warehouse.id || pkg.warehouse_package_id || '')
              return (
                <article className="cc96-package-image-group" key={`images-${String(pkg.external_package_id)}`}>
                  <div className="cc96-package-image-group-head">
                    <div>
                      {warehouseId ? (
                        <Link href={`/warehouse-packages/${encodeURIComponent(warehouseId)}`}>
                          {text(pkg.external_package_id)}
                        </Link>
                      ) : (
                        <strong>{text(pkg.external_package_id)}</strong>
                      )}
                      <span>{text(pkg.domestic_tracking_number)}</span>
                    </div>
                    <small>{pkg.images?.length ?? 0} Bilder</small>
                  </div>
                  <div className="cc96-package-thumbnails">
                    {(pkg.images ?? []).map((image, imageIndex) => (
                      <figure key={`${image.url}-${imageIndex}`}>
                        <img src={image.url} alt={`${text(pkg.external_package_id)} Bild ${imageIndex + 1}`} />
                        <figcaption>{image.source}</figcaption>
                      </figure>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Noch keine archivierten Paket- oder Einkaufsbilder gefunden.</p>
          </div>
        )}
      </div>
    </section>
  )
}
