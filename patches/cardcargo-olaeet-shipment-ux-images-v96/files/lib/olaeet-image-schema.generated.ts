// Default image/link schema candidates for CardCargo v96.
// apply.sh rewrites this file with additional candidates discovered from the
// user's current CardCargo source tree.
export const packageImageTableCandidates = [
  'warehouse_package_images',
  'package_images',
  'olaeet_package_images',
  'warehouse_images',
  'package_photos',
] as const

export const packagePurchaseRelationTableCandidates = [
  'warehouse_package_purchases',
  'purchase_warehouse_packages',
  'warehouse_package_purchase_links',
  'package_purchases',
  'purchase_package_links',
] as const

export const imageBucketCandidates = [
  'listing-images',
  'warehouse-package-images',
  'package-images',
  'olaeet-images',
] as const
