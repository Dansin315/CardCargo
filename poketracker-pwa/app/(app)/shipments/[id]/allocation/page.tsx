import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShipmentCostAllocationForm } from '@/components/shipment-cost-allocation-form'
import { requireUser } from '@/lib/auth'
import { loadShipmentAllocationContext } from '@/lib/shipment-cost-allocation-queries'

import { OlaeetShipmentRecordDetails } from '@/components/olaeet-shipment-record-details'
export const metadata: Metadata = { title: 'Sendungskosten verteilen' }
export const dynamic = 'force-dynamic'

export default async function ShipmentCostAllocationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase } = await requireUser()
  const context = await loadShipmentAllocationContext(supabase, id)
  if (!context) notFound()

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href={`/shipments/${id}`}>← Zur Sendung</Link>
        <span>Kostenallokation</span>
      </div>

      <header className="page-header">
        <div>
          <span className="eyebrow">Internationale Sendung</span>
          <h1>Sendungskosten verteilen</h1>
          <p>
            Versand-, OLAEET- und Importkosten auf die enthaltenen Bunjang-Einkäufe verteilen.
          </p>
        </div>
      </header>
      <OlaeetShipmentRecordDetails />

      {!context.purchases.length ? (
        <section className="panel">
          <div className="empty-state">
            <p>
              In den OLAEET-Paketen dieser Sendung sind noch keine Bunjang-Einkäufe verknüpft.
            </p>
          </div>
        </section>
      ) : (
        <ShipmentCostAllocationForm
          shipment={context.shipment}
          packages={context.packages}
          purchases={context.purchases}
          initialMethods={context.methods}
          initialAllocations={context.allocations}
        />
      )}
    </div>
  )
}
