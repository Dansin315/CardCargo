import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PurchaseEditForm } from '@/components/purchase-edit-form'
import { PurchaseItemsManager } from '@/components/purchase-items-manager'
import { requireUser } from '@/lib/auth'
import { createSignedImageUrl } from '@/lib/storage'
import type { PurchaseImageCategory, PurchaseRow } from '@/lib/types'

export const metadata: Metadata = { title: 'Einkauf bearbeiten' }
export const dynamic = 'force-dynamic'

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase } = await requireUser()
  const { data, error } = await supabase
    .from('purchases')
    .select(
      'id, source, source_listing_id, listing_url, canonical_url, title, description, seller_name, price_amount, price_currency, domestic_shipping_amount, service_fee_amount, purchased_at, status, created_at, updated_at, purchase_images(id, storage_path, original_filename, position, kind, category)',
    )
    .eq('id', id)
    .single()

  if (error || !data) notFound()
  const purchase = data as unknown as PurchaseRow
  const images = await Promise.all(
    [...(purchase.purchase_images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(async (image) => ({
        id: image.id,
        signedUrl: await createSignedImageUrl(supabase, image.storage_path),
        originalFilename: image.original_filename,
        kind: image.kind,
        category: (image.category || (image.kind === 'remote' ? 'listing' : 'general')) as PurchaseImageCategory,
        position: image.position,
      })),
  )

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
          <p>Kaufdaten korrigieren, Bilder ergänzen oder manuelle Bilder entfernen.</p>
        </div>
      </header>

      <PurchaseEditForm purchase={purchase} userId={user.id} images={images} />

      <PurchaseItemsManager
        purchaseId={purchase.id}
        purchaseCurrency={purchase.price_currency}
        purchaseStatus={purchase.status}
      />
    </div>
  )
}
