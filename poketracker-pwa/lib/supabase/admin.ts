import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { requireServerEnv } from '@/lib/env'

export function createAdminClient() {
  return createClient(
    requireServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireServerEnv('SUPABASE_SECRET_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}
