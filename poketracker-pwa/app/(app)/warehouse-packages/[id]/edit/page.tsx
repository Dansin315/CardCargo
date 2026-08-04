import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WarehousePackageForm } from '@/components/warehouse-package-form'
import { requireUser } from '@/lib/auth'
import type {
  PackagePurchaseChoice,
  WarehousePackageRow,
} from '@/lib/warehouse-packages'

export const metadata: Metadata = { title: 'OLAEET-Paket bearbeiten' }
export const dynamic = 'force-dynamic'

export default async function EditWarehousePackagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase } = await requireUser()
  const [packageResult, purchasesResult, linksResult] = await Promise.all([
    supabase
      .from('warehouse_packages')
      .select(
        'id, provider, external_package_id, customer_code, domestic_tracking_number, domestic_carrier, sender_name, package_description, provider_status, status, arrived_at, inspected_at, storage_started_at, storage_deadline_at, weight_grams, length_cm, width_cm, height_cm, notes, record_source, created_at, updated_at',
      )
      .eq('id', id)
      .single(),
    supabase
      .from('purchases')
      .select('id, title, source_listing_id, purchased_at, status')
      .order('created_at', { ascending: false }),
    supabase
      .from('warehouse_package_purchases')
      .select('purchase_id')
      .eq('warehouse_package_id', id),
  ])

  if (packageResult.error || !packageResult.data) notFound()

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href={`/warehouse-packages/${id}`}>← Paketdetails</Link>
        <span>OLAEET</span>
      </div>
      <header className="page-header compact">
        <div>
          <span className="eyebrow">Lager in Korea</span>
          <h1>OLAEET-Paket bearbeiten</h1>
          <p>Status, Messwerte, Lagerdaten und Einkaufszuordnungen aktualisieren.</p>
        </div>
      </header>
      <WarehousePackageForm
        mode="edit"
        packageData={packageResult.data as unknown as WarehousePackageRow}
        purchases={(purchasesResult.data ?? []) as unknown as PackagePurchaseChoice[]}
        selectedPurchaseIds={(linksResult.data ?? []).map((link) => link.purchase_id)}
      />
    </div>
  )
}
