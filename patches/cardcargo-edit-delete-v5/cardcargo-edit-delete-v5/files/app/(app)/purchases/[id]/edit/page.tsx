import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PurchaseEditForm } from '@/components/purchase-edit-form'
import { requireUser } from '@/lib/auth'
import type { PurchaseRow } from '@/lib/types'

export const metadata: Metadata = { title: 'Einkauf bearbeiten' }
export const dynamic = 'force-dynamic'

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireUser()
  const { data, error } = await supabase
    .from('purchases')
    .select(
      'id, source, source_listing_id, listing_url, canonical_url, title, description, seller_name, price_amount, price_currency, domestic_shipping_amount, service_fee_amount, purchased_at, status, created_at, updated_at',
    )
    .eq('id', id)
    .single()

  if (error || !data) notFound()
  const purchase = data as unknown as PurchaseRow

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href={`/purchases/${purchase.id}`}>← Einkaufsdetails</Link>
        <span>Bunjang {purchase.source_listing_id ? `#${purchase.source_listing_id}` : ''}</span>
      </div>

      <header className="page-header compact">
        <div>
          <span className="eyebrow">Einkaufsdatensatz</span>
          <h1>Einkauf bearbeiten</h1>
          <p>Kaufdaten korrigieren oder den Bearbeitungsstand aktualisieren.</p>
        </div>
      </header>

      <PurchaseEditForm purchase={purchase} />
    </div>
  )
}
