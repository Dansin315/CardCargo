import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import {
  packageStatusLabels,
  type PackageStatus,
  type WarehousePackageRow,
} from '@/lib/warehouse-packages'

export const metadata: Metadata = { title: 'OLAEET-Pakete' }
export const dynamic = 'force-dynamic'

export default async function WarehousePackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; status?: string }>
}) {
  const query = await searchParams
  const { supabase } = await requireUser()
  let packageQuery = supabase
    .from('warehouse_packages')
    .select(
      'id, provider, external_package_id, customer_code, domestic_tracking_number, domestic_carrier, sender_name, package_description, provider_status, status, arrived_at, inspected_at, storage_started_at, storage_deadline_at, weight_grams, length_cm, width_cm, height_cm, notes, record_source, created_at, updated_at',
    )
    .order('created_at', { ascending: false })

  if (query.status && query.status in packageStatusLabels) {
    packageQuery = packageQuery.eq('status', query.status)
  }

  const [{ data, error }, { data: links }] = await Promise.all([
    packageQuery,
    supabase.from('warehouse_package_purchases').select('warehouse_package_id'),
  ])

  const packages = (data ?? []) as unknown as WarehousePackageRow[]
  const linkCounts = new Map<string, number>()
  for (const link of links ?? []) {
    linkCounts.set(
      link.warehouse_package_id,
      (linkCounts.get(link.warehouse_package_id) ?? 0) + 1,
    )
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Lager in Korea</span>
          <h1>OLAEET-Pakete</h1>
          <p>Wareneingänge, Maße, Status und zugeordnete Bunjang-Einkäufe.</p>
        </div>
        <Link className="button button-secondary" href="/warehouse-packages/import">
          OLAEET importieren
        </Link>
        <Link className="button button-primary" href="/warehouse-packages/new">
          + Paket erfassen
        </Link>
      </header>

      {query.deleted === '1' ? (
        <div className="alert alert-success">Das OLAEET-Paket wurde gelöscht.</div>
      ) : null}

      {error ? (
        <div className="alert alert-error">
          Paketdaten konnten nicht geladen werden. Wurde die Migration
          <code> 0002_olaeet_packages.sql</code> ausgeführt?
        </div>
      ) : null}

      <nav className="filter-row" aria-label="Paketstatus filtern">
        <Link className={!query.status ? 'active' : ''} href="/warehouse-packages">
          Alle
        </Link>
        {(Object.entries(packageStatusLabels) as Array<[PackageStatus, string]>).map(
          ([status, label]) => (
            <Link
              className={query.status === status ? 'active' : ''}
              href={`/warehouse-packages?status=${status}`}
              key={status}
            >
              {label}
            </Link>
          ),
        )}
      </nav>

      <section className="panel">
        {packages.length ? (
          <div className="package-list">
            {packages.map((warehousePackage) => (
              <Link
                className="package-row"
                href={`/warehouse-packages/${warehousePackage.id}`}
                key={warehousePackage.id}
              >
                <div className="package-identity">
                  <strong>
                    {warehousePackage.external_package_id ||
                      warehousePackage.domestic_tracking_number ||
                      'OLAEET-Paket'}
                  </strong>
                  <span>{warehousePackage.sender_name || 'Absender nicht erfasst'}</span>
                </div>
                <div className="package-meta">
                  <span>{warehousePackage.domestic_tracking_number || 'Keine Trackingnummer'}</span>
                  <span>{formatDate(warehousePackage.arrived_at)}</span>
                </div>
                <div className="package-metrics">
                  <strong>
                    {warehousePackage.weight_grams === null
                      ? '–'
                      : `${Number(warehousePackage.weight_grams).toLocaleString('de-DE')} g`}
                  </strong>
                  <span>{linkCounts.get(warehousePackage.id) ?? 0} Einkäufe</span>
                </div>
                <span className={`status-badge status-${warehousePackage.status}`}>
                  {packageStatusLabels[warehousePackage.status]}
                </span>
                <span className="row-arrow">›</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">□</span>
            <h2>Noch keine OLAEET-Pakete</h2>
            <p>Erfasse den ersten Wareneingang und verknüpfe ihn mit deinen Einkäufen.</p>
            <Link className="button button-primary" href="/warehouse-packages/new">
              Erstes Paket erfassen
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
