'use server'

import { redirect } from 'next/navigation'
import { allowedUserEmail } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

function safeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return '/'

  try {
    const base = new URL('https://cardcargo.local')
    const target = new URL(value, base)
    if (target.origin !== base.origin || !target.pathname.startsWith('/')) return '/'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/'
  }
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const nextPath = safeNextPath(formData.get('next'))
  const allowed = allowedUserEmail()

  if (!email || !password) redirect('/login?error=missing_fields')
  if (allowed && email !== allowed) redirect('/login?error=not_allowed')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=invalid_credentials')

  const { data: isOwner, error: ownerError } = await supabase.rpc('is_app_owner')
  if (ownerError || isOwner !== true) {
    await supabase.auth.signOut()
    redirect('/login?error=not_owner')
  }

  redirect(nextPath)
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
