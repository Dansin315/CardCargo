import type { SupabaseClient } from '@supabase/supabase-js'
import type { PurchaseRow } from '@/lib/types'
import { createSignedImageUrl } from '@/lib/storage'

export interface PurchaseWithThumbnail extends PurchaseRow {
  thumbnailUrl: string | null
}

export async function addPurchaseThumbnails(
  supabase: SupabaseClient,
  purchases: PurchaseRow[],
): Promise<PurchaseWithThumbnail[]> {
  return Promise.all(
    purchases.map(async (purchase) => {
      const firstImage = [...(purchase.purchase_images ?? [])].sort((a, b) => a.position - b.position)[0]
      return {
        ...purchase,
        thumbnailUrl: await createSignedImageUrl(supabase, firstImage?.storage_path),
      }
    }),
  )
}
