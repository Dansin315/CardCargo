import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DeleteShipmentButton } from '@/components/delete-shipment-button'
import { requireUser } from '@/lib/auth'
import { formatDate, formatMoney } from '@/lib/format'
import { purchaseImageCategoryLabels } from '@/lib/purchase-image-categories'
import { loadShipmentAllocationSummary } from '@/lib/shipment-cost-allocation-queries'
import {
  loadShipmentLinkedImages,
  loadShipmentManualImages,
} from '@/lib/shipment-image-queries'
import {
  shipmentImageCategoryLabels,
  shipmentLabel,
  shipmentStatusLabels,
  shippingServiceLabels,
  totalShipmentCosts,
  type ShipmentLinkedImageChoice,
  type ShipmentRow,
  type ShipmentWarehousePackageChoice,
} from '@/lib/shipments'
import { packageStatusLabels } from '@/lib/warehouse-packages'

export const metadata: Metadata = { title: 'Internationale Sendungsdetails' }
export const dynamic = 'force-dynamic'

function linkedImageLabel(image: ShipmentLinkedImageChoice) {
  if (image.source === 'warehouse_package') return 'Manuelles OLAEET-Paketbild'
  return purchaseImageCategoryLabels[
    image.category as keyof typeof purchaseImageCategoryLabels
  ]
}

export default async function ShipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; updated?: string; allocation?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const { supabase } = await requireUser()
  const [shipmentResult, linksResult] = await Promise.all([
    supabase
      .from('shipments')
      .select(
        'id, provider, external_shipment_id, carrier, shipping_service, tracking_number, status, shipped_at, estimated_delivery_at, delivered_at, total_weight_grams, international_shipping_amount, forwarding_fee_amount, import_tax_amount, currency, notes, created_at, updated_at',
      )
      .eq('id', id)
      .single(),
    supabase
      .from('shipment_packages')
      .select('warehouse_package_id')
      .eq('shipment_id', id),
  ])

  if (shipmentResult.error || !shipmentResult.data) notFound()
  if (linksResult.error) throw new Error(linksResult.error.message)

  const shipment = shipmentResult.data as unknown as ShipmentRow
  const packageIds = (linksResult.data ?? []).map((link) => link.warehouse_package_id)
  let packages: ShipmentWarehousePackageChoice[] = []

  if (packageIds.length) {
    const { data, error } = await supabase
      .from('warehouse_packages')
      .select(
        'id, external_package_id, domestic_tracking_number, sender_name, status, arrived_at, weight_grams',
      )
      .in('id', packageIds)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    packages = (data ?? []) as unknown as ShipmentWarehousePackageChoice[]
  }

  const [manualImages, linkedImages, allocationSummary] = await Promise.all([
    loadShipmentManualImages(supabase, id),
    loadShipmentLinkedImages(supabase, packages),
    loadShipmentAllocationSummary(supabase, id),
  ])
  const label = shipmentLabel(shipment)
  const costTotal = totalShipmentCosts(shipment)

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href="/shipments">← Internationale Sendungen</Link>
        <span>{shipment.provider}</span>
      </div>

      {query.created === '1' ? (
        <div className="alert alert-success">Die internationale Sendung wurde gespeichert.</div>
      ) : null}
      {query.updated === '1' ? (
        <div className="alert alert-success">Die internationale Sendung wurde aktualisiert.</div>
      ) : null}
      {query.allocation === '1' ? (
        <div className="alert alert-success">Die Sendungskosten wurden auf die Einkäufe verteilt.</div>
      ) : null}

      <header className="detail-header">
        <div>
          <span className="eyebrow">Internationale Sendung</span>
          <h1>{label}</h1>
          <div className="detail-meta-line">
            <span className={`status-badge status-${shipment.status}`}>
              {shipmentStatusLabels[shipment.status]}
            </span>
            <span>{shippingServiceLabels[shipment.shipping_service]}</span>
            <span>{formatDate(shipment.shipped_at || shipment.created_at)}</span>
          </div>
        </div>
        <div className="detail-price-block shipment-summary-block">
          <span>Gesamtgewicht</span>
          <strong>
            {shipment.total_weight_grams === null
              ? '–'
              : `${Number(shipment.total_weight_grams).toLocaleString('de-DE')} g`}
          </strong>
          <span>Sendungskosten</span>
          <strong>{formatMoney(costTotal, shipment.currency)}</strong>
          <div className="detail-actions">
            <Link className="button button-primary" href={`/shipments/${id}/edit`}>
              Bearbeiten
            </Link>
            <DeleteShipmentButton shipmentId={id} label={label} />
          </div>
        </div>
      </header>

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Sendungsangaben</h2>
              <p>Identifikation, Versanddienst und Tracking.</p>
            </div>
          </div>
          <dl className="definition-list">
            <div><dt>OLAEET-Sendungs-ID</dt><dd>{shipment.external_shipment_id || '–'}</dd></div>
            <div><dt>Versanddienst</dt><dd>{shippingServiceLabels[shipment.shipping_service]}</dd></div>
            <div><dt>Dienstleister</dt><dd>{shipment.carrier || '–'}</dd></div>
            <div><dt>Trackingnummer</dt><dd>{shipment.tracking_number || '–'}</dd></div>
            <div><dt>Status</dt><dd>{shipmentStatusLabels[shipment.status]}</dd></div>
            <div><dt>Pakete</dt><dd>{packages.length}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Versandzeitpunkte</h2>
              <p>Versand, erwartete und tatsächliche Lieferung.</p>
            </div>
          </div>
          <dl className="definition-list">
            <div><dt>Versanddatum</dt><dd>{formatDate(shipment.shipped_at)}</dd></div>
            <div><dt>Erwartete Lieferung</dt><dd>{formatDate(shipment.estimated_delivery_at)}</dd></div>
            <div><dt>Geliefert am</dt><dd>{formatDate(shipment.delivered_at)}</dd></div>
            <div><dt>Erfasst am</dt><dd>{formatDate(shipment.created_at)}</dd></div>
            <div><dt>Aktualisiert am</dt><dd>{formatDate(shipment.updated_at)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Kostenübersicht</h2>
            <p>Verteilung der Sendungskosten auf die enthaltenen Bunjang-Einkäufe.</p>
          </div>
          <span className="panel-note">{shipment.currency}</span>
        </div>
        <div className="shipment-cost-grid">
          <div><span>Internationaler Versand</span><strong>{formatMoney(shipment.international_shipping_amount, shipment.currency)}</strong></div>
          <div><span>OLAEET-Servicegebühren</span><strong>{formatMoney(shipment.forwarding_fee_amount, shipment.currency)}</strong></div>
          <div><span>Zoll und Einfuhr</span><strong>{formatMoney(shipment.import_tax_amount, shipment.currency)}</strong></div>
          <div className="shipment-cost-total"><span>Gesamte Sendungskosten</span><strong>{formatMoney(costTotal, shipment.currency)}</strong></div>
        </div>
        <div className="allocation-summary">
          <span>Allokierte Einkäufe: <strong>{allocationSummary.purchaseCount}</strong></span>
          <span>Allokiert gesamt: <strong>{formatMoney(
            allocationSummary.shipping + allocationSummary.forwarding + allocationSummary.importTax,
            shipment.currency,
          )}</strong></span>
          <Link className="button button-secondary" href={`/shipments/${id}/allocation`}>
            {allocationSummary.purchaseCount ? 'Kostenallokation bearbeiten' : 'Kosten verteilen'}
          </Link>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Enthaltene OLAEET-Pakete</h2>
            <p>Jedes Lagerpaket kann gleichzeitig höchstens einer internationalen Sendung angehören.</p>
          </div>
          <span className="panel-note">{packages.length} verknüpft</span>
        </div>

        {packages.length ? (
          <div className="linked-purchase-list">
            {packages.map((warehousePackage) => (
              <Link
                className="linked-purchase-row"
                href={`/warehouse-packages/${warehousePackage.id}`}
                key={warehousePackage.id}
              >
                <span>
                  <strong>
                    {warehousePackage.external_package_id ||
                      warehousePackage.domestic_tracking_number ||
                      'OLAEET-Paket'}
                  </strong>
                  <small>{warehousePackage.sender_name || 'Absender nicht erfasst'}</small>
                </span>
                <span>{packageStatusLabels[warehousePackage.status]}</span>
                <span>
                  {warehousePackage.weight_grams === null
                    ? '–'
                    : `${Number(warehousePackage.weight_grams).toLocaleString('de-DE')} g`}
                </span>
                <span className="row-arrow">›</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Dieser Sendung wurde noch kein OLAEET-Paket zugeordnet.</p>
            <Link className="button button-secondary" href={`/shipments/${id}/edit`}>
              Pakete zuordnen
            </Link>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Eigene Sendungsbilder</h2>
            <p>
              Manuell archivierte Konsolidierungs-, Karton-, Etikett-, Zoll- und Schadensbilder.
            </p>
          </div>
          <span className="panel-note">{manualImages.length} Bilder</span>
        </div>

        {manualImages.length ? (
          <div className="shipment-image-grid">
            {manualImages.map((image) => (
              <article className="shipment-image-card" key={image.id}>
                {image.signed_url ? (
                  <img src={image.signed_url} alt={image.original_filename || 'Sendungsbild'} />
                ) : null}
                <div>
                  <strong>{shipmentImageCategoryLabels[image.category]}</strong>
                  <small>{image.original_filename || 'Manuell hochgeladen'}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Für diese Sendung wurden noch keine eigenen Bilder gespeichert.</p>
            <Link className="button button-secondary" href={`/shipments/${id}/edit`}>
              Sendungsbilder hinzufügen
            </Link>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Bilder aus enthaltenen Paketen und Einkäufen</h2>
            <p>
              Diese Bilder werden dynamisch eingeblendet und nicht kopiert. Wird ein OLAEET-Paket
              aus der Sendung entfernt, verschwinden dessen Bilder hier automatisch.
            </p>
          </div>
          <span className="panel-note">{linkedImages.length} Bilder</span>
        </div>

        {linkedImages.length ? (
          <div className="shipment-image-grid">
            {linkedImages.map((image) => (
              <article className="shipment-image-card" key={image.id}>
                {image.signed_url ? (
                  <img src={image.signed_url} alt={image.original_filename || image.package_label} />
                ) : null}
                <div>
                  <strong>{image.package_label}</strong>
                  <small>{linkedImageLabel(image)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Die enthaltenen OLAEET-Pakete besitzen derzeit keine anzeigbaren Bilder.</p>
          </div>
        )}
      </section>

      {shipment.notes ? (
        <section className="panel">
          <span className="section-label">Notizen</span>
          <p className="preserve-lines">{shipment.notes}</p>
        </section>
      ) : null}
    </div>
  )
}
