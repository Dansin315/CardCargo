import Link from 'next/link'
import type { Metadata } from 'next'
import { PurchaseList } from '@/components/purchase-list'
import { formatMoney } from '@/lib/format'
import { requireUser } from '@/lib/auth'
import { addPurchaseThumbnails } from '@/lib/purchases'
import type { PurchaseRow } from '@/lib/types'

export const metadata: Metadata = { title: 'Übersicht' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { supabase } = await requireUser()
  const { data: purchaseData } = await supabase
    .from('purchases')
    .select(
      'id, source, source_listing_id, listing_url, canonical_url, title, description, seller_name, price_amount, price_currency, domestic_shipping_amount, service_fee_amount, purchased_at, status, created_at, updated_at, purchase_images(id, storage_path, source_url, original_filename, mime_type, byte_size, position, kind)',
    )
    .order('created_at', { ascending: false })

  const purchases = (purchaseData ?? []) as unknown as PurchaseRow[]
  const recent = await addPurchaseThumbnails(supabase, purchases.slice(0, 5))
  const openPurchases = purchases.filter(
    (purchase) => purchase.status !== 'delivered' && purchase.status !== 'cancelled',
  ).length
  const totalKrw = purchases
    .filter((purchase) => purchase.price_currency === 'KRW')
    .reduce((sum, purchase) => sum + Number(purchase.price_amount || 0), 0)
  const archivedImages = purchases.reduce(
    (sum, purchase) => sum + (purchase.purchase_images?.length ?? 0),
    0,
  )

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Single-User-Dashboard</span>
          <h1>Übersicht</h1>
          <p>Deine Bunjang-Einkäufe und archivierten Angebotsdaten an einem Ort.</p>
        </div>
        <Link className="button button-primary" href="/purchases/new">
          + Einkauf importieren
        </Link>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <span>Einkäufe gesamt</span>
          <strong>{purchases.length}</strong>
          <small>Alle erfassten Angebote</small>
        </article>
        <article className="stat-card">
          <span>Offene Vorgänge</span>
          <strong>{openPurchases}</strong>
          <small>Noch nicht zugestellt</small>
        </article>
        <article className="stat-card">
          <span>Artikelwert in KRW</span>
          <strong>{formatMoney(totalKrw, 'KRW')}</strong>
          <small>Ohne Versand und Gebühren</small>
        </article>
        <article className="stat-card accent">
          <span>Archivierte Bilder</span>
          <strong>{archivedImages}</strong>
          <small>Privat in Supabase Storage</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Letzte Einkäufe</h2>
            <p>Neueste Importe und Status</p>
          </div>
          <Link className="text-link" href="/purchases">
            Alle anzeigen →
          </Link>
        </div>
        <PurchaseList purchases={recent} />
      </section>

      <section className="roadmap-strip">
        <div>
          <span className="eyebrow">Nächste Module</span>
          <strong>OLAEET-Pakete → Sendungen → Inventar</strong>
        </div>
        <p>Das Datenmodell ist dafür bereits vorbereitet; die aktuelle Oberfläche konzentriert sich auf den vollständigen Einkaufimport.</p>
      </section>
    </div>
  )
}
