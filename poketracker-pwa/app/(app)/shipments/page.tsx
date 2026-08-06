import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { formatDate, formatMoney } from '@/lib/format'
import {
  shipmentStatusLabels,
  shippingServiceLabels,
  totalShipmentCosts,
  type ShipmentRow,
  type ShipmentStatus,
} from '@/lib/shipments'

export const metadata: Metadata = { title: 'Internationale Sendungen' }
export const dynamic = 'force-dynamic'

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; status?: string }>
}) {
  const query = await searchParams
  const { supabase } = await requireUser()
  let shipmentQuery = supabase
    .from('shipments')
    .select(
      'id, provider, external_shipment_id, carrier, shipping_service, tracking_number, status, shipped_at, estimated_delivery_at, delivered_at, total_weight_grams, international_shipping_amount, forwarding_fee_amount, import_tax_amount, currency, notes, created_at, updated_at',
    )
    .order('created_at', { ascending: false })

  if (query.status && query.status in shipmentStatusLabels) {
    shipmentQuery = shipmentQuery.eq('status', query.status)
  }

  const [{ data, error }, { data: links }] = await Promise.all([
    shipmentQuery,
    supabase.from('shipment_packages').select('shipment_id'),
  ])

  const shipments = (data ?? []) as unknown as ShipmentRow[]
  const packageCounts = new Map<string, number>()
  for (const link of links ?? []) {
    packageCounts.set(link.shipment_id, (packageCounts.get(link.shipment_id) ?? 0) + 1)
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">OLAEET → Deutschland</span>
          <h1>Internationale Sendungen</h1>
          <p>Konsolidierte Lagerpakete, Tracking, Lieferstatus, Gewicht und Kosten.</p>
        </div>
        <Link className="button button-primary" href="/shipments/new">
          + Sendung erfassen
        </Link>
      </header>

      {query.deleted === '1' ? (
        <div className="alert alert-success">Die internationale Sendung wurde gelöscht.</div>
      ) : null}

      {error ? (
        <div className="alert alert-error">
          Sendungsdaten konnten nicht geladen werden. Wurde die Migration
          <code> 0007_international_shipments.sql</code> ausgeführt?
        </div>
      ) : null}

      <nav className="filter-row" aria-label="Sendungsstatus filtern">
        <Link className={!query.status ? 'active' : ''} href="/shipments">
          Alle
        </Link>
        {(Object.entries(shipmentStatusLabels) as Array<[ShipmentStatus, string]>).map(
          ([status, label]) => (
            <Link
              className={query.status === status ? 'active' : ''}
              href={`/shipments?status=${status}`}
              key={status}
            >
              {label}
            </Link>
          ),
        )}
      </nav>

      <section className="panel">
        {shipments.length ? (
          <div className="shipment-list">
            {shipments.map((shipment) => (
              <Link className="shipment-row" href={`/shipments/${shipment.id}`} key={shipment.id}>
                <div className="shipment-identity">
                  <strong>
                    {shipment.external_shipment_id ||
                      shipment.tracking_number ||
                      shippingServiceLabels[shipment.shipping_service]}
                  </strong>
                  <span>{shippingServiceLabels[shipment.shipping_service]}</span>
                </div>
                <div className="shipment-meta">
                  <span>{shipment.tracking_number || 'Keine Trackingnummer'}</span>
                  <span>{formatDate(shipment.shipped_at || shipment.created_at)}</span>
                </div>
                <div className="shipment-metrics">
                  <strong>
                    {shipment.total_weight_grams === null
                      ? '–'
                      : `${Number(shipment.total_weight_grams).toLocaleString('de-DE')} g`}
                  </strong>
                  <span>{packageCounts.get(shipment.id) ?? 0} Pakete</span>
                </div>
                <div className="shipment-cost">
                  <strong>{formatMoney(totalShipmentCosts(shipment), shipment.currency)}</strong>
                  <span>Nebenkosten</span>
                </div>
                <span className={`status-badge status-${shipment.status}`}>
                  {shipmentStatusLabels[shipment.status]}
                </span>
                <span className="row-arrow">›</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">✈</span>
            <h2>Noch keine internationale Sendung</h2>
            <p>Fasse OLAEET-Pakete zusammen und protokolliere Versand und Kosten.</p>
            <Link className="button button-primary" href="/shipments/new">
              Erste Sendung erfassen
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
