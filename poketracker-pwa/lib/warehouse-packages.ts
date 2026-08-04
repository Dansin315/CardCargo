export const packageStatuses = [
  'expected',
  'received',
  'inspected',
  'ready_for_consolidation',
  'consolidated',
  'returned',
] as const

export type PackageStatus = (typeof packageStatuses)[number]

export const packageStatusLabels: Record<PackageStatus, string> = {
  expected: 'Erwartet',
  received: 'Eingetroffen',
  inspected: 'Inspiziert',
  ready_for_consolidation: 'Bereit zur Konsolidierung',
  consolidated: 'Konsolidiert',
  returned: 'Zurückgesendet',
}

export type PackageRecordSource = 'manual' | 'csv' | 'xlsx' | 'email' | 'api'

export const packageRecordSourceLabels: Record<PackageRecordSource, string> = {
  manual: 'Manuell',
  csv: 'CSV-Import',
  xlsx: 'Excel-Import',
  email: 'E-Mail-Import',
  api: 'API',
}

export interface WarehousePackageRow {
  id: string
  provider: string
  external_package_id: string | null
  customer_code: string | null
  domestic_tracking_number: string | null
  domestic_carrier: string | null
  sender_name: string | null
  package_description: string | null
  provider_status: string | null
  status: PackageStatus
  arrived_at: string | null
  inspected_at: string | null
  storage_started_at: string | null
  storage_deadline_at: string | null
  weight_grams: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  notes: string | null
  record_source: PackageRecordSource
  created_at: string
  updated_at: string
}

export interface PackagePurchaseChoice {
  id: string
  title: string
  source_listing_id: string | null
  purchased_at: string | null
  status: string
}

export interface WarehousePackagePurchaseLink {
  purchase_id: string
  warehouse_package_id: string
}

export interface PackagePurchaseImageChoice {
  id: string
  purchase_id: string
  position: number
  signed_url: string | null
}

export interface WarehousePackageManualImageChoice {
  id: string
  original_filename: string | null
  position: number
  signed_url: string | null
}

/**
 * A purchase may belong to only one OLAEET package at a time.
 * On an edit page, purchases already linked to the current package remain visible.
 */
export function filterAssignablePurchases(
  purchases: PackagePurchaseChoice[],
  links: WarehousePackagePurchaseLink[],
  currentPackageId?: string,
) {
  const assignedToAnotherPackage = new Set(
    links
      .filter((link) => link.warehouse_package_id !== currentPackageId)
      .map((link) => link.purchase_id),
  )

  return purchases.filter((purchase) => !assignedToAnotherPackage.has(purchase.id))
}

export function selectedPurchaseIdsForPackage(
  links: WarehousePackagePurchaseLink[],
  packageId: string,
) {
  return links
    .filter((link) => link.warehouse_package_id === packageId)
    .map((link) => link.purchase_id)
}


export function filterPurchaseImagesForSelection(
  images: PackagePurchaseImageChoice[],
  selectedPurchaseIds: string[],
) {
  const selected = new Set(selectedPurchaseIds)
  return images.filter((image) => selected.has(image.purchase_id))
}

export function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function addDaysToDate(value: string | null | undefined, days: number) {
  if (!value || !isValidDateOnly(value) || !Number.isInteger(days)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function toDateInput(value: string | null | undefined) {
  if (!value) return ''
  if (isValidDateOnly(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}
