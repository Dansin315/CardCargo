import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DeleteWarehousePackageButton } from '@/components/delete-warehouse-package-button'
import { requireUser } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import {
  packageRecordSourceLabels,
  packageStatusLabels,
  type PackagePurchaseChoice,
  type WarehousePackageRow,
} from '@/lib/warehouse-packages'

export const metadata: Metadata = { title: 'OLAEET-Paketdetails' }
export const dynamic = 'force-dynamic'

function formatNumber(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined) return '–'
  return `${Number(value).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${suffix}`
}

export default async function WarehousePackageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; updated?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const { supabase } = await requireUser()
  const [packageResult, linksResult, shipmentResult] = await Promise.all([
    supabase
      .from('warehouse_packages')
      .select(
        'id, provider, external_package_id, customer_code, domestic_tracking_number, domestic_carrier, sender_name, package_description, provider_status, status, arrived_at, inspected_at, storage_started_at, storage_deadline_at, weight_grams, length_cm, width_cm, height_cm, notes, record_source, created_at, updated_at',
      )
      .eq('id', id)
      .single(),
    supabase
      .from('warehouse_package_purchases')
      .select('purchase_id')
      .eq('warehouse_package_id', id),
    supabase
      .from('shipment_packages')
      .select('shipment_id')
      .eq('warehouse_package_id', id)
      .limit(1)
      .maybeSingle(),
  ])

  if (packageResult.error || !packageResult.data) notFound()
  const warehousePackage = packageResult.data as unknown as WarehousePackageRow
  const purchaseIds = (linksResult.data ?? []).map((link) => link.purchase_id)
  let purchases: PackagePurchaseChoice[] = []

  if (purchaseIds.length) {
    const { data } = await supabase
      .from('purchases')
      .select('id, title, source_listing_id, purchased_at, status')
      .in('id', purchaseIds)
      .order('created_at', { ascending: false })
    purchases = (data ?? []) as unknown as PackagePurchaseChoice[]
  }

  const label =
    warehousePackage.external_package_id ||
    warehousePackage.domestic_tracking_number ||
    'OLAEET-Paket'

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href="/warehouse-packages">← OLAEET-Pakete</Link>
        <span>{warehousePackage.provider}</span>
      </div>

      {query.created === '1' ? (
        <div className="alert alert-success">Das OLAEET-Paket wurde gespeichert.</div>
      ) : null}
      {query.updated === '1' ? (
        <div className="alert alert-success">Das OLAEET-Paket wurde aktualisiert.</div>
      ) : null}

      <header className="detail-header">
        <div>
          <span className="eyebrow">Lagerpaket</span>
          <h1>{label}</h1>
          <div className="detail-meta-line">
            <span className={`status-badge status-${warehousePackage.status}`}>
              {packageStatusLabels[warehousePackage.status]}
            </span>
            <span>{warehousePackage.sender_name || 'Absender nicht erfasst'}</span>
            <span>{formatDate(warehousePackage.arrived_at || warehousePackage.created_at)}</span>
          </div>
        </div>
        <div className="detail-price-block package-summary-block">
          <span>Gewicht</span>
          <strong>{formatNumber(warehousePackage.weight_grams, 'g')}</strong>
          <span>Maße</span>
          <strong>
            {warehousePackage.length_cm === null &&
            warehousePackage.width_cm === null &&
            warehousePackage.height_cm === null
              ? '–'
              : `${warehousePackage.length_cm ?? '–'} × ${warehousePackage.width_cm ?? '–'} × ${warehousePackage.height_cm ?? '–'} cm`}
          </strong>
          <div className="detail-actions">
            <Link className="button button-primary" href={`/warehouse-packages/${id}/edit`}>
              Bearbeiten
            </Link>
            <DeleteWarehousePackageButton packageId={id} label={label} />
          </div>
        </div>
      </header>

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Paketangaben</h2>
              <p>Identifikation, Zustellung und OLAEET-Status.</p>
            </div>
          </div>
          <dl className="definition-list">
            <div><dt>OLAEET-Paket-ID</dt><dd>{warehousePackage.external_package_id || '–'}</dd></div>
            <div><dt>Kundencode</dt><dd>{warehousePackage.customer_code || '–'}</dd></div>
            <div><dt>Trackingnummer Korea</dt><dd>{warehousePackage.domestic_tracking_number || '–'}</dd></div>
            <div><dt>Paketdienst Korea</dt><dd>{warehousePackage.domestic_carrier || '–'}</dd></div>
            <div><dt>OLAEET-Originalstatus</dt><dd>{warehousePackage.provider_status || '–'}</dd></div>
            <div><dt>Erfassungsquelle</dt><dd>{packageRecordSourceLabels[warehousePackage.record_source]}</dd></div>
          </dl>
          {warehousePackage.package_description ? (
            <div className="description-block">
              <span className="section-label">Paketbeschreibung</span>
              <p>{warehousePackage.package_description}</p>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Lagerzeitpunkte</h2>
              <p>Eingang, Inspektion und Fristen.</p>
            </div>
          </div>
          <dl className="definition-list">
            <div><dt>Eingang</dt><dd>{formatDate(warehousePackage.arrived_at)}</dd></div>
            <div><dt>Inspektion</dt><dd>{formatDate(warehousePackage.inspected_at)}</dd></div>
            <div><dt>Lagerbeginn</dt><dd>{formatDate(warehousePackage.storage_started_at)}</dd></div>
            <div><dt>Lagerfrist</dt><dd>{formatDate(warehousePackage.storage_deadline_at)}</dd></div>
            <div><dt>Erfasst am</dt><dd>{formatDate(warehousePackage.created_at)}</dd></div>
            <div><dt>Aktualisiert am</dt><dd>{formatDate(warehousePackage.updated_at)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Enthaltene Einkäufe</h2>
            <p>Die Einkaufsdatensätze bleiben unabhängig vom Paket erhalten.</p>
          </div>
          <span className="panel-note">{purchases.length} verknüpft</span>
        </div>
        {purchases.length ? (
          <div className="linked-purchase-list">
            {purchases.map((purchase) => (
              <Link className="linked-purchase-row" href={`/purchases/${purchase.id}`} key={purchase.id}>
                <span>
                  <strong>{purchase.title}</strong>
                  <small>{purchase.source_listing_id ? `Bunjang #${purchase.source_listing_id}` : 'Manuell'}</small>
                </span>
                <span>{formatDate(purchase.purchased_at)}</span>
                <span className="row-arrow">›</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Diesem Paket wurde noch kein Einkauf zugeordnet.</p>
            <Link className="button button-secondary" href={`/warehouse-packages/${id}/edit`}>
              Einkäufe zuordnen
            </Link>
          </div>
        )}
      </section>

      {warehousePackage.notes ? (
        <section className="panel">
          <span className="section-label">Notizen</span>
          <p className="preserve-lines">{warehousePackage.notes}</p>
        </section>
      ) : null}

      {shipmentResult.data ? (
        <div className="alert alert-info">
          Dieses Paket ist bereits einer internationalen Sendung zugeordnet und kann erst nach dem Entfernen dieser Zuordnung gelöscht werden.
        </div>
      ) : null}
    </div>
  )
}
