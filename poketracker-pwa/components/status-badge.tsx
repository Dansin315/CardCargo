import { purchaseStatusLabels } from '@/lib/format'
import type { PurchaseStatus } from '@/lib/types'

export function StatusBadge({ status }: { status: PurchaseStatus }) {
  return <span className={`status-badge status-${status}`}>{purchaseStatusLabels[status]}</span>
}
