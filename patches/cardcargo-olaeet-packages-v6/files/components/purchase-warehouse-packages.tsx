import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import {
  packageStatusLabels,
  type PackageStatus,
  type WarehousePackageRow,
} from '@/lib/warehouse-packages'

export async function PurchaseWarehousePackages({ purchaseId }: { purchaseId: string }) {
  const { supabase } = await requireUser()
  const { data: links } = await supabase
    .from('warehouse_package_purchases')
    .select('warehouse_package_id')
    .eq('purchase_id', purchaseId)

  const packageIds = (links ?? []).map((link) => link.warehouse_package_id)
  let packages: WarehousePackageRow[] = []

  if (packageIds.length) {
    const { data } = await supabase
      .from('warehouse_packages')
      .select(
        'id, provider, external_package_id, customer_code, domestic_tracking_number, domestic_carrier, sender_name, package_description, provider_status, status, arrived_at, inspected_at, storage_started_at, storage_deadline_at, weight_grams, length_cm, width_cm, height_cm, notes, record_source, created_at, updated_at',
      )
      .in('id', packageIds)
      .order('created_at', { ascending: false })
    packages = (data ?? []) as unknown as WarehousePackageRow[]
  }

  return (
    <section className="panel next-step-card">
      <span className="eyebrow">OLAEET-Lager</span>
      <h2>{packages.length ? 'Zugeordnete OLAEET-Pakete' : 'Mit OLAEET-Paket verknüpfen'}</h2>
      {packages.length ? (
        <div className="linked-package-list">
          {packages.map((warehousePackage) => (
            <Link
              className="linked-package-row"
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
              <span className={`status-badge status-${warehousePackage.status}`}>
                {packageStatusLabels[warehousePackage.status as PackageStatus]}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p>
          Lege ein OLAEET-Paket an und ordne diesen Einkauf direkt im Paketformular zu.
        </p>
      )}
      <Link
        className="button button-secondary"
        href={`/warehouse-packages/new?purchase=${purchaseId}`}
      >
        {packages.length ? 'Weiteres Paket zuordnen' : 'OLAEET-Paket anlegen'}
      </Link>
    </section>
  )
}
