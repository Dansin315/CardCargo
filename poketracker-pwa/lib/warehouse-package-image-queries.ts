import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSignedImageUrl } from '@/lib/storage'
import type { PurchaseImageCategory } from '@/lib/types'
import type {
  PackagePurchaseImageChoice,
  WarehousePackageManualImageChoice,
} from '@/lib/warehouse-packages'

export async function loadPurchaseImageChoices(
  supabase: SupabaseClient,
  purchaseIds: string[],
): Promise<PackagePurchaseImageChoice[]> {
  if (!purchaseIds.length) return []

  const { data: images, error } = await supabase
    .from('purchase_images')
    .select(
      'id, purchase_id, storage_path, position, category, kind',
    )
    .in('purchase_id', purchaseIds)
    .order('position', { ascending: true })

  if (error) throw new Error(error.message)

  return Promise.all(
    (images ?? []).map(async (image) => ({
      id: image.id,
      purchase_id: image.purchase_id,
      position: image.position,
      category: (
        image.category ||
        (image.kind === 'remote' ? 'listing' : 'general')
      ) as PurchaseImageCategory,
      signed_url: await createSignedImageUrl(
        supabase,
        image.storage_path,
      ),
    })),
  )
}

export async function loadWarehousePackageManualImages(
  supabase: SupabaseClient,
  packageId: string,
): Promise<WarehousePackageManualImageChoice[]> {
  const { data: images, error } = await supabase
    .from('warehouse_package_images')
    .select(
      'id, storage_path, original_filename, position',
    )
    .eq('warehouse_package_id', packageId)
    .order('position', { ascending: true })

  if (error) throw new Error(error.message)

  return Promise.all(
    (images ?? []).map(async (image) => ({
      id: image.id,
      original_filename: image.original_filename,
      position: image.position,
      signed_url: await createSignedImageUrl(
        supabase,
        image.storage_path,
      ),
    })),
  )
}
