import 'server-only'

import type { User } from '@supabase/supabase-js'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { allowedUserEmail } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

function emailIsAllowed(user: User) {
  return user.email?.toLowerCase() === allowedUserEmail()
}

export const requireUser = cache(async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !emailIsAllowed(user)) redirect('/login')

  const { data: isOwner, error: ownerError } = await supabase.rpc('is_app_owner')
  if (ownerError || isOwner !== true) redirect('/login?error=not_owner')

  return { user, supabase }
})

export async function getApiUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user || !emailIsAllowed(user)) {
    return {
      user: null,
      supabase,
      error: error?.message ?? 'Nicht autorisiert',
      status: 401,
    } as const
  }

  const { data: isOwner, error: ownerError } = await supabase.rpc('is_app_owner')
  if (ownerError || isOwner !== true) {
    return {
      user: null,
      supabase,
      error: 'Das angemeldete Konto ist nicht als App-Owner eingerichtet.',
      status: 403,
    } as const
  }

  return { user, supabase, error: null, status: 200 } as const
}
