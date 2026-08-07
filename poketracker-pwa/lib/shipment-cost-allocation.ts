export const shipmentCostAllocationMethods = [
  'package_weight',
  'purchase_value',
  'equal_purchase',
  'manual',
] as const

export type ShipmentCostAllocationMethod =
  (typeof shipmentCostAllocationMethods)[number]

export const shipmentCostAllocationMethodLabels: Record<
  ShipmentCostAllocationMethod,
  string
> = {
  package_weight: 'Nach Paketgewicht → innerhalb des Pakets nach Einkaufswert',
  purchase_value: 'Direkt nach Einkaufswert',
  equal_purchase: 'Gleichmäßig pro Einkauf',
  manual: 'Manuell',
}

export interface AllocationShipment {
  id: string
  international_shipping_amount: number | null
  forwarding_fee_amount: number | null
  import_tax_amount: number | null
  currency: string
}

export interface AllocationPackage {
  id: string
  external_package_id: string | null
  domestic_tracking_number: string | null
  weight_grams: number | null
}

export interface AllocationPurchase {
  id: string
  warehouse_package_id: string
  title: string
  price_amount: number | null
  domestic_shipping_amount: number | null
  service_fee_amount: number | null
  price_currency: string
}

export interface ShipmentPurchaseAllocation {
  purchase_id: string
  warehouse_package_id: string
  international_shipping_amount: number
  forwarding_fee_amount: number
  import_tax_amount: number
}

export interface AllocationMethods {
  shipping: ShipmentCostAllocationMethod
  forwarding: ShipmentCostAllocationMethod
  importTax: ShipmentCostAllocationMethod
}

export interface AllocationCalculationInput {
  shipment: AllocationShipment
  packages: AllocationPackage[]
  purchases: AllocationPurchase[]
  methods: AllocationMethods
  manualAllocations?: ShipmentPurchaseAllocation[]
}

export interface AllocationCalculationResult {
  allocations: ShipmentPurchaseAllocation[]
  warnings: string[]
}

export function purchaseAllocationBasis(purchase: AllocationPurchase) {
  return (
    Number(purchase.price_amount || 0) +
    Number(purchase.domestic_shipping_amount || 0) +
    Number(purchase.service_fee_amount || 0)
  )
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function allocationMap(rows: ShipmentPurchaseAllocation[] | undefined) {
  return new Map((rows ?? []).map((row) => [row.purchase_id, row]))
}

function allocateMinorUnits<T>(
  total: number,
  entries: T[],
  keyOf: (entry: T) => string,
  weightOf: (entry: T) => number,
) {
  const totalMinor = Math.round(Math.max(0, total) * 100)
  const weights = entries.map((entry) => Math.max(0, Number(weightOf(entry) || 0)))
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)

  if (!entries.length) return new Map<string, number>()
  if (weightTotal <= 0) throw new Error('Die gewählte Verteilungsbasis ist 0 oder fehlt vollständig.')

  const pieces = entries.map((entry, index) => {
    const raw = (totalMinor * weights[index]) / weightTotal
    const floor = Math.floor(raw)
    return {
      key: keyOf(entry),
      minor: floor,
      remainder: raw - floor,
      index,
    }
  })

  const remaining = totalMinor - pieces.reduce((sum, piece) => sum + piece.minor, 0)
  const ranked = [...pieces].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  )

  for (let index = 0; index < remaining; index += 1) {
    ranked[index % ranked.length].minor += 1
  }

  return new Map(pieces.map((piece) => [piece.key, piece.minor / 100]))
}

function assertComparablePurchaseCurrencies(purchases: AllocationPurchase[]) {
  const currencies = new Set(purchases.map((purchase) => purchase.price_currency))
  if (currencies.size > 1) {
    throw new Error(
      'Eine wertbasierte Verteilung ist nur möglich, wenn alle verglichenen Einkäufe dieselbe Einkaufswährung verwenden. Für Mischwährungen ist später eine Wechselkurs-Normalisierung erforderlich.',
    )
  }
}

function allocateEqual(total: number, purchases: AllocationPurchase[]) {
  return allocateMinorUnits(total, purchases, (purchase) => purchase.id, () => 1)
}

function allocateByPurchaseValue(total: number, purchases: AllocationPurchase[]) {
  assertComparablePurchaseCurrencies(purchases)
  return allocateMinorUnits(
    total,
    purchases,
    (purchase) => purchase.id,
    purchaseAllocationBasis,
  )
}

function allocateByPackageWeight(total: number, packages: AllocationPackage[], purchases: AllocationPurchase[]) {
  const usedPackageIds = new Set(purchases.map((purchase) => purchase.warehouse_package_id))
  const usedPackages = packages.filter((warehousePackage) => usedPackageIds.has(warehousePackage.id))
  const missingWeight = usedPackages.find(
    (warehousePackage) => Number(warehousePackage.weight_grams || 0) <= 0,
  )

  if (missingWeight) {
    throw new Error(
      `Für das OLAEET-Paket ${missingWeight.external_package_id || missingWeight.domestic_tracking_number || missingWeight.id} fehlt ein positives Gewicht.`,
    )
  }

  const packageAmounts = allocateMinorUnits(
    total,
    usedPackages,
    (warehousePackage) => warehousePackage.id,
    (warehousePackage) => Number(warehousePackage.weight_grams || 0),
  )

  const result = new Map<string, number>()

  for (const warehousePackage of usedPackages) {
    const packagePurchases = purchases.filter(
      (purchase) => purchase.warehouse_package_id === warehousePackage.id,
    )
    if (!packagePurchases.length) continue

    const packageAmount = packageAmounts.get(warehousePackage.id) ?? 0
    const valueTotal = packagePurchases.reduce(
      (sum, purchase) => sum + purchaseAllocationBasis(purchase),
      0,
    )

    const purchaseAmounts = valueTotal > 0
      ? allocateByPurchaseValue(packageAmount, packagePurchases)
      : allocateEqual(packageAmount, packagePurchases)

    for (const purchase of packagePurchases) {
      result.set(purchase.id, purchaseAmounts.get(purchase.id) ?? 0)
    }
  }

  return result
}

function componentAllocation(
  total: number,
  method: ShipmentCostAllocationMethod,
  packages: AllocationPackage[],
  purchases: AllocationPurchase[],
  manual: Map<string, ShipmentPurchaseAllocation>,
  component: keyof Pick<
    ShipmentPurchaseAllocation,
    'international_shipping_amount' | 'forwarding_fee_amount' | 'import_tax_amount'
  >,
) {
  if (method === 'manual') {
    return new Map(
      purchases.map((purchase) => [
        purchase.id,
        money(Number(manual.get(purchase.id)?.[component] || 0)),
      ]),
    )
  }
  if (method === 'package_weight') return allocateByPackageWeight(total, packages, purchases)
  if (method === 'purchase_value') return allocateByPurchaseValue(total, purchases)
  return allocateEqual(total, purchases)
}

export function calculateShipmentCostAllocations(
  input: AllocationCalculationInput,
): AllocationCalculationResult {
  const { shipment, packages, purchases, methods } = input
  const warnings: string[] = []
  const manual = allocationMap(input.manualAllocations)

  if (!purchases.length) return { allocations: [], warnings: ['Keine Einkäufe in dieser Sendung.'] }

  const shipping = componentAllocation(
    Number(shipment.international_shipping_amount || 0),
    methods.shipping,
    packages,
    purchases,
    manual,
    'international_shipping_amount',
  )
  const forwarding = componentAllocation(
    Number(shipment.forwarding_fee_amount || 0),
    methods.forwarding,
    packages,
    purchases,
    manual,
    'forwarding_fee_amount',
  )
  const importTax = componentAllocation(
    Number(shipment.import_tax_amount || 0),
    methods.importTax,
    packages,
    purchases,
    manual,
    'import_tax_amount',
  )

  const allocations = purchases.map((purchase) => ({
    purchase_id: purchase.id,
    warehouse_package_id: purchase.warehouse_package_id,
    international_shipping_amount: money(shipping.get(purchase.id) ?? 0),
    forwarding_fee_amount: money(forwarding.get(purchase.id) ?? 0),
    import_tax_amount: money(importTax.get(purchase.id) ?? 0),
  }))

  return { allocations, warnings }
}

export function allocationRowTotal(row: ShipmentPurchaseAllocation) {
  return money(
    row.international_shipping_amount +
      row.forwarding_fee_amount +
      row.import_tax_amount,
  )
}

export function allocationTotals(rows: ShipmentPurchaseAllocation[]) {
  return rows.reduce(
    (totals, row) => ({
      shipping: money(totals.shipping + Number(row.international_shipping_amount || 0)),
      forwarding: money(totals.forwarding + Number(row.forwarding_fee_amount || 0)),
      importTax: money(totals.importTax + Number(row.import_tax_amount || 0)),
    }),
    { shipping: 0, forwarding: 0, importTax: 0 },
  )
}
