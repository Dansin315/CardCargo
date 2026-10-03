import type { Metadata } from 'next'
import { RevenueWorkspace } from '@/components/revenue-workspace'

export const metadata: Metadata = {
  title: 'Umsatz · CardCargo',
}

export default function RevenuePage() {
  return <RevenueWorkspace />
}
