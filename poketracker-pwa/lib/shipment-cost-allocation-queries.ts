import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AllocationMethods,
  AllocationPackage,
  AllocationPurchase,
  AllocationShipment,
  ShipmentPurchaseAllocation,
} from '@/lib/shipment-cost-allocation'

export interface ShipmentAllocationContext {
  shipment: AllocationShipment
  packages: AllocationPackage[]
  purchases: AllocationPurchase[]
  methods: AllocationMethods
  allocations: ShipmentPurchaseAllocation[]
}

export async function loadShipmentAllocationContext(
  supabase: SupabaseClient,
  shipmentId: string,
): Promise<ShipmentAllocationContext | null> {
  const { data: shipment, error: shipmentError } = await supabase
    .from('shipments')
    .select(
      'id, international_shipping_amount, forwarding_fee_amount, import_tax_amount, currency',
    )
    .eq('id', shipmentId)
    .maybeSingle()

  if (shipmentError) throw new Error(shipmentError.message)
  if (!shipment) return null

  const { data: shipmentLinks, error: shipmentLinksError } = await supabase
    .from('shipment_packages')
    .select('warehouse_package_id')
    .eq('shipment_id', shipmentId)

  if (shipmentLinksError) throw new Error(shipmentLinksError.message)
  const packageIds = (shipmentLinks ?? []).map((row) => row.warehouse_package_id)

  let packages: AllocationPackage[] = []
  let purchases: AllocationPurchase[] = []

  if (packageIds.length) {
    const [packageResult, purchaseLinksResult] = await Promise.all([
      supabase
        .from('warehouse_packages')
        .select('id, external_package_id, domestic_tracking_number, weight_grams')
        .in('id', packageIds),
      supabase
        .from('warehouse_package_purchases')
        .select('warehouse_package_id, purchase_id')
        .in('warehouse_package_id', packageIds),
    ])

    if (packageResult.error) throw new Error(packageResult.error.message)
    if (purchaseLinksResult.error) throw new Error(purchaseLinksResult.error.message)

    packages = (packageResult.data ?? []) as unknown as AllocationPackage[]
    const purchaseLinks = purchaseLinksResult.data ?? []
    const purchaseIds = purchaseLinks.map((row) => row.purchase_id)

    if (purchaseIds.length) {
      const { data: purchaseRows, error: purchaseError } = await supabase
        .from('purchases')
        .select(
          'id, title, price_amount, domestic_shipping_amount, service_fee_amount, price_currency',
        )
        .in('id', purchaseIds)

      if (purchaseError) throw new Error(purchaseError.message)
      const packageByPurchase = new Map(
        purchaseLinks.map((row) => [row.purchase_id, row.warehouse_package_id]),
      )

      purchases = (purchaseRows ?? []).map((purchase) => ({
        ...purchase,
        warehouse_package_id: packageByPurchase.get(purchase.id) as string,
      })) as unknown as AllocationPurchase[]
    }
  }

  const [settingsResult, allocationsResult] = await Promise.all([
    supabase
      .from('shipment_cost_allocation_settings')
      .select('shipping_method, forwarding_method, import_method')
      .eq('shipment_id', shipmentId)
      .maybeSingle(),
    supabase
      .from('shipment_purchase_cost_allocations')
      .select(
        'purchase_id, warehouse_package_id, international_shipping_amount, forwarding_fee_amount, import_tax_amount',
      )
      .eq('shipment_id', shipmentId),
  ])

  if (settingsResult.error) throw new Error(settingsResult.error.message)
  if (allocationsResult.error) throw new Error(allocationsResult.error.message)

  const methods: AllocationMethods = settingsResult.data
    ? {
        shipping: settingsResult.data.shipping_method as AllocationMethods['shipping'],
        forwarding: settingsResult.data.forwarding_method as AllocationMethods['forwarding'],
        importTax: settingsResult.data.import_method as AllocationMethods['importTax'],
      }
    : {
        shipping: 'package_weight',
        forwarding: 'equal_purchase',
        importTax: 'purchase_value',
      }

  return {
    shipment: shipment as unknown as AllocationShipment,
    packages,
    purchases,
    methods,
    allocations: (allocationsResult.data ?? []).map((row) => ({
      purchase_id: row.purchase_id,
      warehouse_package_id: row.warehouse_package_id,
      international_shipping_amount: Number(row.international_shipping_amount || 0),
      forwarding_fee_amount: Number(row.forwarding_fee_amount || 0),
      import_tax_amount: Number(row.import_tax_amount || 0),
    })),
  }
}

export async function loadShipmentAllocationSummary(
  supabase: SupabaseClient,
  shipmentId: string,
) {
  const { data, error } = await supabase
    .from('shipment_purchase_cost_allocations')
    .select(
      'purchase_id, international_shipping_amount, forwarding_fee_amount, import_tax_amount',
    )
    .eq('shipment_id', shipmentId)

  if (error) throw new Error(error.message)

  const rows = data ?? []
  return {
    purchaseCount: rows.length,
    shipping: rows.reduce(
      (sum, row) => sum + Number(row.international_shipping_amount || 0),
      0,
    ),
    forwarding: rows.reduce(
      (sum, row) => sum + Number(row.forwarding_fee_amount || 0),
      0,
    ),
    importTax: rows.reduce((sum, row) => sum + Number(row.import_tax_amount || 0), 0),
  }
}

export async function loadPurchaseShipmentCostAllocation(
  supabase: SupabaseClient,
  purchaseId: string,
) {
  const { data: allocation, error } = await supabase
    .from('shipment_purchase_cost_allocations')
    .select(
      'shipment_id, warehouse_package_id, international_shipping_amount, forwarding_fee_amount, import_tax_amount',
    )
    .eq('purchase_id', purchaseId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!allocation) return null

  const { data: shipment, error: shipmentError } = await supabase
    .from('shipments')
    .select('id, external_shipment_id, tracking_number, shipping_service, currency')
    .eq('id', allocation.shipment_id)
    .maybeSingle()

  if (shipmentError) throw new Error(shipmentError.message)
  if (!shipment) return null

  return {
    shipment,
    allocation: {
      shipment_id: allocation.shipment_id,
      warehouse_package_id: allocation.warehouse_package_id,
      international_shipping_amount: Number(allocation.international_shipping_amount || 0),
      forwarding_fee_amount: Number(allocation.forwarding_fee_amount || 0),
      import_tax_amount: Number(allocation.import_tax_amount || 0),
    },
  }
}
