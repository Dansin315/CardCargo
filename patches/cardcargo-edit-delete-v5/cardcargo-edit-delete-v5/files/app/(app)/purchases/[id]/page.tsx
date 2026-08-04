import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/status-badge'
import { DeletePurchaseButton } from '@/components/delete-purchase-button'
import { formatDate, formatMoney } from '@/lib/format'
import { requireUser } from '@/lib/auth'
import { createSignedImageUrl } from '@/lib/storage'
import type { PurchaseRow } from '@/lib/types'

export const metadata: Metadata = { title: 'Einkaufsdetails' }
export const dynamic = 'force-dynamic'

export default async function PurchaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; updated?: string; warnings?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const parsedWarningCount = Number.parseInt(query.warnings || '0', 10)
  const warningCount = Number.isFinite(parsedWarningCount)
    ? Math.min(99, Math.max(0, parsedWarningCount))
    : 0
  const { supabase } = await requireUser()
  const { data, error } = await supabase
    .from('purchases')
    .select(
      'id, source, source_listing_id, listing_url, canonical_url, title, description, seller_name, price_amount, price_currency, domestic_shipping_amount, service_fee_amount, purchased_at, status, created_at, updated_at, purchase_images(id, storage_path, source_url, original_filename, mime_type, byte_size, position, kind)',
    )
    .eq('id', id)
    .single()

  if (error || !data) notFound()
  const purchase = data as unknown as PurchaseRow
  const images = await Promise.all(
    [...(purchase.purchase_images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(async (image) => ({
        ...image,
        signedUrl: await createSignedImageUrl(supabase, image.storage_path),
      })),
  )

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href="/purchases">← Einkäufe</Link>
        <span>Bunjang {purchase.source_listing_id ? `#${purchase.source_listing_id}` : ''}</span>
      </div>

      {query.created === '1' ? (
        <div className="alert alert-success">
          Einkauf und {images.length} Angebotsbild{images.length === 1 ? '' : 'er'} wurden erfolgreich gespeichert.
        </div>
      ) : null}

      {query.updated === '1' ? (
        <div className="alert alert-success">Der Einkauf wurde erfolgreich aktualisiert.</div>
      ) : null}

      {warningCount > 0 ? (
        <div className="alert alert-warning">
          {warningCount} Importhinweis{warningCount === 1 ? '' : 'e'}: Mindestens eine erkannte oder hochgeladene Bilddatei wurde übersprungen oder bereinigt.
        </div>
      ) : null}

      <header className="detail-header">
        <div>
          <span className="eyebrow">Einkaufsdatensatz</span>
          <h1>{purchase.title}</h1>
          <div className="detail-meta-line">
            <StatusBadge status={purchase.status} />
            <span>{purchase.seller_name || 'Verkäufer nicht erfasst'}</span>
            <span>{formatDate(purchase.purchased_at || purchase.created_at)}</span>
          </div>
        </div>
        <div className="detail-price-block">
          <span>Artikelpreis</span>
          <strong>{formatMoney(purchase.price_amount, purchase.price_currency)}</strong>
          <span>Versand in Korea</span>
          <strong>
            {formatMoney(purchase.domestic_shipping_amount, purchase.price_currency)}
          </strong>
          <span>Service-/Zahlungsgebühren</span>
          <strong>{formatMoney(purchase.service_fee_amount, purchase.price_currency)}</strong>
          <span>Gesamtsumme</span>
          <strong>
            {formatMoney(
              Number(purchase.price_amount || 0) +
                Number(purchase.domestic_shipping_amount || 0) +
                Number(purchase.service_fee_amount || 0),
              purchase.price_currency,
            )}
          </strong>
          <a
            className="button button-secondary"
            href={purchase.canonical_url || purchase.listing_url}
            target="_blank"
            rel="noreferrer"
          >
            Originalangebot öffnen ↗
          </a>
          <div className="detail-actions">
            <Link className="button button-primary" href={`/purchases/${purchase.id}/edit`}>
              Bearbeiten
            </Link>
            <DeletePurchaseButton purchaseId={purchase.id} title={purchase.title} />
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Archivierte Angebotsbilder</h2>
            <p>Private Kopien im Supabase-Storage, nicht nur externe Links.</p>
          </div>
          <span className="panel-note">{images.length} Datei{images.length === 1 ? '' : 'en'}</span>
        </div>

        <div className="detail-gallery">
          {images.map((image, index) => (
            <figure key={image.id}>
              {image.signedUrl ? (
                <img src={image.signedUrl} alt={`Archiviertes Angebotsbild ${index + 1}`} />
              ) : (
                <div className="missing-image">Bild nicht verfügbar</div>
              )}
              <figcaption>
                <span>Bild {index + 1}</span>
                <span>{image.kind === 'remote' ? 'Automatisch archiviert' : 'Manuell hochgeladen'}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Angaben</h2>
              <p>Aus dem Angebot übernommen und beim Import geprüft.</p>
            </div>
          </div>
          <dl className="definition-list">
            <div>
              <dt>Quelle</dt>
              <dd>Bunjang</dd>
            </div>
            <div>
              <dt>Externe ID</dt>
              <dd>{purchase.source_listing_id || 'Nicht erkannt'}</dd>
            </div>
            <div>
              <dt>Kaufdatum</dt>
              <dd>{formatDate(purchase.purchased_at)}</dd>
            </div>
            <div>
              <dt>Versandkosten in Korea</dt>
              <dd>
                {formatMoney(purchase.domestic_shipping_amount, purchase.price_currency)}
              </dd>
            </div>
            <div>
              <dt>Service-/Zahlungsgebühren</dt>
              <dd>{formatMoney(purchase.service_fee_amount, purchase.price_currency)}</dd>
            </div>
            <div>
              <dt>Erfasst am</dt>
              <dd>{formatDate(purchase.created_at)}</dd>
            </div>
          </dl>
          {purchase.description ? (
            <div className="description-block">
              <span className="section-label">Beschreibung / Notizen</span>
              <p>{purchase.description}</p>
            </div>
          ) : null}
        </section>

        <section className="panel next-step-card">
          <span className="eyebrow">Nächster Prozessschritt</span>
          <h2>Mit OLAEET-Paket verknüpfen</h2>
          <p>
            Das Datenmodell enthält bereits Lagerpakete, internationale Sendungen und Inventareinheiten. Die entsprechende Oberfläche folgt nach dem Einkaufsmodul.
          </p>
          <button className="button button-secondary" type="button" disabled>
            OLAEET-Zuordnung folgt
          </button>
        </section>
      </div>
    </div>
  )
}
