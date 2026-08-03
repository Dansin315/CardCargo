import Link from 'next/link'
import type { Metadata } from 'next'
import { PurchaseList } from '@/components/purchase-list'
import { requireUser } from '@/lib/auth'
import { addPurchaseThumbnails } from '@/lib/purchases'
import type { PurchaseRow } from '@/lib/types'

export const metadata: Metadata = { title: 'Einkäufe' }
export const dynamic = 'force-dynamic'

export default async function PurchasesPage() {
  const { supabase } = await requireUser()
  const { data } = await supabase
    .from('purchases')
    .select(
      'id, source, source_listing_id, listing_url, canonical_url, title, description, seller_name, price_amount, price_currency, domestic_shipping_amount, service_fee_amount, purchased_at, status, created_at, updated_at, purchase_images(id, storage_path, source_url, original_filename, mime_type, byte_size, position, kind)',
    )
    .order('created_at', { ascending: false })

  const purchases = await addPurchaseThumbnails(
    supabase,
    (data ?? []) as unknown as PurchaseRow[],
  )

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Beschaffung</span>
          <h1>Einkäufe</h1>
          <p>URL, Kaufdaten und private Kopien der Angebotsbilder.</p>
        </div>
        <Link className="button button-primary" href="/purchases/new">
          + Neuer Import
        </Link>
      </header>

      <section className="panel">
        <PurchaseList purchases={purchases} />
      </section>
    </div>
  )
}
