import Link from 'next/link'
import type { Metadata } from 'next'
import { WarehousePackageForm } from '@/components/warehouse-package-form'
import { requireUser } from '@/lib/auth'
import { loadPurchaseImageChoices } from '@/lib/warehouse-package-image-queries'
import {
  filterAssignablePurchases,
  type PackagePurchaseChoice,
  type WarehousePackagePurchaseLink,
} from '@/lib/warehouse-packages'

export const metadata: Metadata = { title: 'OLAEET-Paket erfassen' }
export const dynamic = 'force-dynamic'

export default async function NewWarehousePackagePage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>
}) {
  const query = await searchParams
  const { user, supabase } = await requireUser()
  const [purchasesResult, linksResult] = await Promise.all([
    supabase
      .from('purchases')
      .select('id, title, source_listing_id, purchased_at, status')
      .order('created_at', { ascending: false }),
    supabase
      .from('warehouse_package_purchases')
      .select('purchase_id, warehouse_package_id'),
  ])

  if (purchasesResult.error) throw new Error(purchasesResult.error.message)
  if (linksResult.error) throw new Error(linksResult.error.message)

  const purchases = filterAssignablePurchases(
    (purchasesResult.data ?? []) as unknown as PackagePurchaseChoice[],
    (linksResult.data ?? []) as unknown as WarehousePackagePurchaseLink[],
  )
  const selectedPurchaseIds = purchases.some((purchase) => purchase.id === query.purchase)
    ? [query.purchase as string]
    : []
  const purchaseImages = await loadPurchaseImageChoices(
    supabase,
    purchases.map((purchase) => purchase.id),
  )

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
          <p>Paketdaten protokollieren, Einkäufe auswählen und Paketbilder ergänzen.</p>
        </div>
      </header>
      <WarehousePackageForm
        mode="create"
        userId={user.id}
        purchases={purchases}
        purchaseImages={purchaseImages}
        selectedPurchaseIds={selectedPurchaseIds}
      />
    </div>
  )
}
