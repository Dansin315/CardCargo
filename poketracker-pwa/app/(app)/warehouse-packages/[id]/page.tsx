import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { purchaseImageCategoryLabels } from '@/lib/purchase-image-categories'
import { DeleteWarehousePackageButton } from '@/components/delete-warehouse-package-button'
import { PurchaseItemsManager } from '@/components/purchase-items-manager'
import { requireUser } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import {
  shipmentStatusLabels,
  shippingServiceLabels,
  type ShipmentRow,
} from '@/lib/shipments'
import {
  loadPurchaseImageChoices,
  loadWarehousePackageManualImages,
} from '@/lib/warehouse-package-image-queries'
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
    const { data, error } = await supabase
      .from('purchases')
      .select('id, title, source_listing_id, purchased_at, status')
      .in('id', purchaseIds)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    purchases = (data ?? []) as unknown as PackagePurchaseChoice[]
  }

  const [purchaseImages, manualImages] = await Promise.all([
    loadPurchaseImageChoices(supabase, purchaseIds),
    loadWarehousePackageManualImages(supabase, id),
  ])

  let linkedShipment: ShipmentRow | null = null
  if (shipmentResult.data?.shipment_id) {
    const { data, error } = await supabase
      .from('shipments')
      .select(
        'id, provider, external_shipment_id, carrier, shipping_service, tracking_number, status, shipped_at, estimated_delivery_at, delivered_at, total_weight_grams, international_shipping_amount, forwarding_fee_amount, import_tax_amount, currency, notes, created_at, updated_at',
      )
      .eq('id', shipmentResult.data.shipment_id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    linkedShipment = data as unknown as ShipmentRow | null
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

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Paketbilder</h2>
            <p>Manuelle OLAEET-Bilder und Bilder der aktuell zugewiesenen Bunjang-Einkäufe.</p>
          </div>
          <span className="panel-note">
            {manualImages.length + purchaseImages.length} Datei
            {manualImages.length + purchaseImages.length === 1 ? '' : 'en'}
          </span>
        </div>

        {manualImages.length || purchaseImages.length ? (
          <div className="detail-gallery">
            {manualImages.map((image) => (
              <figure key={`manual-${image.id}`}>
                {image.signed_url ? (
                  <img src={image.signed_url} alt={image.original_filename || 'Manuelles OLAEET-Paketbild'} />
                ) : (
                  <div className="missing-image">Bild nicht verfügbar</div>
                )}
                <figcaption>
                  <span>{image.original_filename || `Paketbild ${image.position}`}</span>
                  <span>Manuell zum OLAEET-Paket hinzugefügt</span>
                </figcaption>
              </figure>
            ))}
            {purchaseImages.map((image) => {
              const purchase = purchases.find((item) => item.id === image.purchase_id)
              return (
                <figure key={`purchase-${image.id}`}>
                  {image.signed_url ? (
                    <img src={image.signed_url} alt={`Angebotsbild von ${purchase?.title ?? 'Bunjang-Einkauf'}`} />
                  ) : (
                    <div className="missing-image">Bild nicht verfügbar</div>
                  )}
                  <figcaption>
                    <span>{purchase?.title ?? 'Bunjang-Einkauf'}</span>
                    <span>{purchaseImageCategoryLabels[image.category]} · über Einkaufszuordnung</span>
                  </figcaption>
                </figure>
              )
            })}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Für dieses OLAEET-Paket sind noch keine Bilder vorhanden.</p>
            <Link className="button button-secondary" href={`/warehouse-packages/${id}/edit`}>
              Bilder hinzufügen
            </Link>
          </div>
        )}
      </section>

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
            <p>Wird eine Zuordnung entfernt, verschwinden auch deren Bilder aus dieser Paketansicht.</p>
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

      <PurchaseItemsManager
        warehousePackageId={id}
        purchaseCurrency="KRW"
        purchaseStatus={warehousePackage.status}
      />

      {warehousePackage.notes ? (
        <section className="panel">
          <span className="section-label">Notizen</span>
          <p className="preserve-lines">{warehousePackage.notes}</p>
        </section>
      ) : null}

      <section className="panel shipment-link-panel">
        <div className="panel-heading">
          <div>
            <h2>Internationale Sendung</h2>
            <p>Zuordnung für den Versand von OLAEET nach Deutschland.</p>
          </div>
        </div>
        {linkedShipment ? (
          <Link className="linked-shipment-card" href={`/shipments/${linkedShipment.id}`}>
            <span>
              <strong>
                {linkedShipment.external_shipment_id ||
                  linkedShipment.tracking_number ||
                  shippingServiceLabels[linkedShipment.shipping_service]}
              </strong>
              <small>
                {shippingServiceLabels[linkedShipment.shipping_service]} ·{' '}
                {linkedShipment.tracking_number || 'Keine Trackingnummer'}
              </small>
            </span>
            <span className={`status-badge status-${linkedShipment.status}`}>
              {shipmentStatusLabels[linkedShipment.status]}
            </span>
            <span className="row-arrow">›</span>
          </Link>
        ) : (
          <div className="empty-state compact-empty">
            <p>Dieses OLAEET-Paket ist noch keiner internationalen Sendung zugeordnet.</p>
            <Link className="button button-secondary" href={`/shipments/new?package=${id}`}>
              Einer Sendung zuordnen
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
