import type { PackageStatus } from '@/lib/warehouse-packages'

export const shipmentStatuses = [
  'draft',
  'booked',
  'in_transit',
  'customs',
  'out_for_delivery',
  'delivered',
  'exception',
  'cancelled',
] as const

export type ShipmentStatus = (typeof shipmentStatuses)[number]

export const shipmentStatusLabels: Record<ShipmentStatus, string> = {
  draft: 'Entwurf',
  booked: 'Gebucht',
  in_transit: 'International unterwegs',
  customs: 'Zollabfertigung',
  out_for_delivery: 'In Zustellung',
  delivered: 'Zugestellt',
  exception: 'Problem / Ausnahme',
  cancelled: 'Storniert',
}

export const shippingServices = [
  'fedex_priority',
  'fedex_economy',
  'fedex_connect',
  'fedex_express',
  'ems',
  'ems_premium',
  'k_packet',
  'air_mail',
  'ocean_transport',
  'other',
] as const

export type ShippingService = (typeof shippingServices)[number]

export const shippingServiceLabels: Record<ShippingService, string> = {
  fedex_priority: 'FedEx Priority',
  fedex_economy: 'FedEx Economy',
  fedex_connect: 'FedEx Connect',
  fedex_express: 'FedEx Express',
  ems: 'EMS',
  ems_premium: 'EMS Premium',
  k_packet: 'K-Packet',
  air_mail: 'Air Mail',
  ocean_transport: 'Ocean Transport',
  other: 'Sonstiger Versanddienst',
}

export const shipmentCurrencies = ['KRW', 'USD', 'EUR'] as const
export type ShipmentCurrency = (typeof shipmentCurrencies)[number]

export function carrierForShippingService(service: ShippingService) {
  if (service.startsWith('fedex_')) return 'FedEx'
  if (service === 'ems' || service === 'ems_premium') return 'EMS'
  if (service === 'k_packet' || service === 'air_mail') return 'Korea Post'
  if (service === 'ocean_transport') return 'Ocean Transport'
  return 'Other'
}

export interface ShipmentRow {
  id: string
  provider: string
  external_shipment_id: string | null
  carrier: string | null
  shipping_service: ShippingService
  tracking_number: string | null
  status: ShipmentStatus
  shipped_at: string | null
  estimated_delivery_at: string | null
  delivered_at: string | null
  total_weight_grams: number | null
  international_shipping_amount: number | null
  forwarding_fee_amount: number | null
  import_tax_amount: number | null
  currency: ShipmentCurrency
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ShipmentWarehousePackageChoice {
  id: string
  external_package_id: string | null
  domestic_tracking_number: string | null
  sender_name: string | null
  status: PackageStatus
  arrived_at: string | null
  weight_grams: number | null
}

export interface ShipmentPackageLink {
  shipment_id: string
  warehouse_package_id: string
}

/**
 * A warehouse package may belong to only one international shipment at a time.
 * While editing, packages already linked to the current shipment remain selectable.
 */
export function filterAssignableWarehousePackages(
  packages: ShipmentWarehousePackageChoice[],
  links: ShipmentPackageLink[],
  currentShipmentId?: string,
) {
  const assignedElsewhere = new Set(
    links
      .filter((link) => link.shipment_id !== currentShipmentId)
      .map((link) => link.warehouse_package_id),
  )

  return packages.filter((warehousePackage) => !assignedElsewhere.has(warehousePackage.id))
}

export function selectedWarehousePackageIdsForShipment(
  links: ShipmentPackageLink[],
  shipmentId: string,
) {
  return links
    .filter((link) => link.shipment_id === shipmentId)
    .map((link) => link.warehouse_package_id)
}

export function shipmentLabel(shipment: Pick<ShipmentRow, 'external_shipment_id' | 'tracking_number' | 'shipping_service'>) {
  return (
    shipment.external_shipment_id ||
    shipment.tracking_number ||
    shippingServiceLabels[shipment.shipping_service]
  )
}

export function totalShipmentCosts(shipment: Pick<ShipmentRow, 'international_shipping_amount' | 'forwarding_fee_amount' | 'import_tax_amount'>) {
  return (
    Number(shipment.international_shipping_amount || 0) +
    Number(shipment.forwarding_fee_amount || 0) +
    Number(shipment.import_tax_amount || 0)
  )
}
