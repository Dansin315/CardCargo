// Generated/default compatibility candidates for CardCargo's existing
// shipment model. apply.sh augments these values from the local project source.
export const shipmentTableCandidates = [
  'shipments',
  'international_shipments',
  'outbound_shipments',
] as const

export const shipmentPackageTableCandidates = [
  'shipment_warehouse_packages',
  'international_shipment_packages',
  'outbound_shipment_packages',
  'shipment_packages',
  'warehouse_package_shipments',
] as const
