import type { PurchaseStatus } from '@/lib/types'

export const purchaseStatusLabels: Record<PurchaseStatus, string> = {
  planned: 'Geplant',
  ordered: 'Bestellt',
  paid: 'Bezahlt',
  shipped_domestic: 'Versand in Korea',
  warehouse_received: 'Bei OLAEET',
  consolidated: 'Konsolidiert',
  international_transit: 'International unterwegs',
  delivered: 'Zugestellt',
  cancelled: 'Storniert',
}

export function formatMoney(amount: number | null | undefined, currency = 'KRW') {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '–'

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(amount)
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '–'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value)
  if (Number.isNaN(date.getTime())) return '–'
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date)
}
