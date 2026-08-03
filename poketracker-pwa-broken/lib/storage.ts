import type { SupabaseClient } from '@supabase/supabase-js'

export async function createSignedImageUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
  expiresInSeconds = 3600,
) {
  if (!storagePath) return null
  const { data, error } = await supabase.storage
    .from('listing-images')
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error) return null
  return data.signedUrl
}
