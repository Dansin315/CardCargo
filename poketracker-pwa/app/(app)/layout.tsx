import type { ReactNode } from 'react'
import { AppShell } from '@/components/app-shell'
import { requireUser } from '@/lib/auth'

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser()
  return <AppShell email={user.email || 'Single User'}>{children}</AppShell>
}
