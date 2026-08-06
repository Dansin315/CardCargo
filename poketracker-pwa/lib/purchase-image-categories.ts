import type { PurchaseImageCategory } from '@/lib/types'

export const purchaseImageCategoryLabels: Record<PurchaseImageCategory, string> = {
  listing: 'Angebot',
  general: 'Allgemein',
  chat: 'Chat / Verhandlung',
  condition: 'Zustand / Detail',
  receipt: 'Beleg / Zahlung',
  shipping: 'Versand / Tracking',
}
