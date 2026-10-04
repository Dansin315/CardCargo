import Link from 'next/link'
import type { Metadata } from 'next'
import { WarehousePackageForm } from '@/components/warehouse-package-form'
import { requireUser } from '@/lib/auth'
import type { PackagePurchaseChoice } from '@/lib/warehouse-packages'

export const metadata: Metadata = { title: 'OLAEET-Paket erfassen' }
export const dynamic = 'force-dynamic'

export default async function NewWarehousePackagePage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>
}) {
  const query = await searchParams
  const { supabase } = await requireUser()
  const { data } = await supabase
    .from('purchases')
    .select('id, title, source_listing_id, purchased_at, status')
    .order('created_at', { ascending: false })

  const purchases = (data ?? []) as unknown as PackagePurchaseChoice[]
  const selectedPurchaseIds = purchases.some((purchase) => purchase.id === query.purchase)
    ? [query.purchase as string]
    : []

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href="/warehouse-packages">← OLAEET-Pakete</Link>
        <span>Manuelle Erfassung</span>
      </div>
      <header className="page-header compact">
        <div>
          <span className="eyebrow">Lager in Korea</span>
          <h1>OLAEET-Paket erfassen</h1>
          <p>Paketdaten protokollieren und vorhandene Einkäufe zuordnen.</p>
        </div>
      </header>
      <WarehousePackageForm
        mode="create"
        purchases={purchases}
        selectedPurchaseIds={selectedPurchaseIds}
      />
    </div>
  )
}
