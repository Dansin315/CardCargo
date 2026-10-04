import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { purchaseImageCategoryLabels } from '@/lib/purchase-image-categories'
import { createSignedImageUrl } from '@/lib/storage'
import type { PurchaseImageCategory } from '@/lib/types'
import type {
  ShipmentLinkedImageChoice,
  ShipmentManualImageChoice,
  ShipmentWarehousePackageChoice,
} from '@/lib/shipments'

function packageLabel(warehousePackage: ShipmentWarehousePackageChoice) {
  return (
    warehousePackage.external_package_id ||
    warehousePackage.domestic_tracking_number ||
    'OLAEET-Paket'
  )
}

export async function loadShipmentManualImages(
  supabase: SupabaseClient,
  shipmentId: string,
): Promise<ShipmentManualImageChoice[]> {
  const { data: images, error } = await supabase
    .from('shipment_images')
    .select('id, storage_path, original_filename, category, position')
    .eq('shipment_id', shipmentId)
    .order('position', { ascending: true })

  if (error) throw new Error(error.message)

  return Promise.all(
    (images ?? []).map(async (image) => ({
      id: image.id,
      original_filename: image.original_filename,
      category: image.category,
      position: image.position,
      signed_url: await createSignedImageUrl(supabase, image.storage_path),
    })),
  ) as Promise<ShipmentManualImageChoice[]>
}

export async function loadShipmentLinkedImages(
  supabase: SupabaseClient,
  packages: ShipmentWarehousePackageChoice[],
): Promise<ShipmentLinkedImageChoice[]> {
  if (!packages.length) return []

  const packageIds = packages.map((warehousePackage) => warehousePackage.id)
  const packageById = new Map(
    packages.map((warehousePackage) => [warehousePackage.id, warehousePackage]),
  )

  const [packageImagesResult, purchaseLinksResult] = await Promise.all([
    supabase
      .from('warehouse_package_images')
      .select('id, warehouse_package_id, storage_path, original_filename, position')
      .in('warehouse_package_id', packageIds)
      .order('position', { ascending: true }),
    supabase
      .from('warehouse_package_purchases')
      .select('warehouse_package_id, purchase_id')
      .in('warehouse_package_id', packageIds),
  ])

  if (packageImagesResult.error) throw new Error(packageImagesResult.error.message)
  if (purchaseLinksResult.error) throw new Error(purchaseLinksResult.error.message)

  const purchaseLinks = purchaseLinksResult.data ?? []
  const purchaseIds = [...new Set(purchaseLinks.map((link) => link.purchase_id))]
  const packageIdByPurchaseId = new Map(
    purchaseLinks.map((link) => [link.purchase_id, link.warehouse_package_id]),
  )

  const purchaseImagesResult = purchaseIds.length
    ? await supabase
        .from('purchase_images')
        .select(
          'id, purchase_id, storage_path, original_filename, position, category, kind',
        )
        .in('purchase_id', purchaseIds)
        .order('position', { ascending: true })
    : { data: [], error: null }

  if (purchaseImagesResult.error) throw new Error(purchaseImagesResult.error.message)

  const packageImages = await Promise.all(
    (packageImagesResult.data ?? []).map(async (image) => {
      const warehousePackage = packageById.get(image.warehouse_package_id)
      return {
        id: `warehouse-package:${image.id}`,
        warehouse_package_id: image.warehouse_package_id,
        purchase_id: null,
        package_label: warehousePackage ? packageLabel(warehousePackage) : 'OLAEET-Paket',
        source: 'warehouse_package' as const,
        original_filename: image.original_filename,
        category: 'warehouse_package' as const,
        position: image.position,
        signed_url: await createSignedImageUrl(supabase, image.storage_path),
      }
    }),
  )

  const purchaseImages = await Promise.all(
    (purchaseImagesResult.data ?? []).map(async (image) => {
      const warehousePackageId = packageIdByPurchaseId.get(image.purchase_id)
      const warehousePackage = warehousePackageId
        ? packageById.get(warehousePackageId)
        : undefined
      const category = (
        image.category || (image.kind === 'remote' ? 'listing' : 'general')
      ) as PurchaseImageCategory

      return {
        id: `purchase:${image.id}`,
        warehouse_package_id: warehousePackageId || '',
        purchase_id: image.purchase_id,
        package_label: warehousePackage ? packageLabel(warehousePackage) : 'OLAEET-Paket',
        source: 'purchase' as const,
        original_filename:
          image.original_filename || purchaseImageCategoryLabels[category],
        category,
        position: image.position,
        signed_url: await createSignedImageUrl(supabase, image.storage_path),
      }
    }),
  )

  return [...packageImages, ...purchaseImages]
    .filter((image) => image.warehouse_package_id && image.signed_url)
    .sort((a, b) => {
      const packageCompare = a.package_label.localeCompare(b.package_label, 'de')
      if (packageCompare !== 0) return packageCompare
      if (a.source !== b.source) return a.source === 'warehouse_package' ? -1 : 1
      return a.position - b.position
    })
}
