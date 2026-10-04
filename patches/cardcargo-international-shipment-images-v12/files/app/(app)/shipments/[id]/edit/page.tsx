import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShipmentForm } from '@/components/shipment-form'
import { requireUser } from '@/lib/auth'
import {
  loadShipmentLinkedImages,
  loadShipmentManualImages,
} from '@/lib/shipment-image-queries'
import {
  filterAssignableWarehousePackages,
  selectedWarehousePackageIdsForShipment,
  type ShipmentPackageLink,
  type ShipmentRow,
  type ShipmentWarehousePackageChoice,
} from '@/lib/shipments'

export const metadata: Metadata = { title: 'Internationale Sendung bearbeiten' }
export const dynamic = 'force-dynamic'

export default async function EditShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, user } = await requireUser()
  const [shipmentResult, packagesResult, linksResult] = await Promise.all([
    supabase
      .from('shipments')
      .select(
        'id, provider, external_shipment_id, carrier, shipping_service, tracking_number, status, shipped_at, estimated_delivery_at, delivered_at, total_weight_grams, international_shipping_amount, forwarding_fee_amount, import_tax_amount, currency, notes, created_at, updated_at',
      )
      .eq('id', id)
      .single(),
    supabase
      .from('warehouse_packages')
      .select(
        'id, external_package_id, domestic_tracking_number, sender_name, status, arrived_at, weight_grams',
      )
      .order('created_at', { ascending: false }),
    supabase.from('shipment_packages').select('shipment_id, warehouse_package_id'),
  ])

  if (shipmentResult.error || !shipmentResult.data) notFound()
  if (packagesResult.error) throw new Error(packagesResult.error.message)
  if (linksResult.error) throw new Error(linksResult.error.message)

  const links = (linksResult.data ?? []) as unknown as ShipmentPackageLink[]
  const packages = filterAssignableWarehousePackages(
    (packagesResult.data ?? []) as unknown as ShipmentWarehousePackageChoice[],
    links,
    id,
  )
  const [linkedImages, manualImages] = await Promise.all([
    loadShipmentLinkedImages(supabase, packages),
    loadShipmentManualImages(supabase, id),
  ])

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href={`/shipments/${id}`}>← Sendungsdetails</Link>
        <span>OLAEET</span>
      </div>
      <header className="page-header compact">
        <div>
          <span className="eyebrow">OLAEET → Deutschland</span>
          <h1>Internationale Sendung bearbeiten</h1>
          <p>
            Status, Tracking, Paketzuordnungen, Bilder, Gewicht und Kosten aktualisieren.
          </p>
        </div>
      </header>
      <ShipmentForm
        mode="edit"
        userId={user.id}
        shipmentData={shipmentResult.data as unknown as ShipmentRow}
        packages={packages}
        linkedImages={linkedImages}
        manualImages={manualImages}
        selectedWarehousePackageIds={selectedWarehousePackageIdsForShipment(links, id)}
      />
    </div>
  )
}
