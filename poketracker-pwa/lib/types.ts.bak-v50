export type PurchaseStatus =
  | 'planned'
  | 'ordered'
  | 'paid'
  | 'shipped_domestic'
  | 'warehouse_received'
  | 'consolidated'
  | 'international_transit'
  | 'delivered'
  | 'cancelled'

export type ListingSource = 'bunjang' | 'manual' | 'other'

export interface ListingPreview {
  source: ListingSource
  listingUrl: string
  canonicalUrl: string
  externalId: string | null
  title: string
  description: string
  sellerName: string
  priceAmount: number | null
  domesticShippingAmount: number | null
  priceCurrency: string
  imageUrls: string[]
  warnings: string[]
}

export type PurchaseImageCategory =
  | 'listing'
  | 'general'
  | 'chat'
  | 'condition'
  | 'receipt'
  | 'shipping'

export interface StagedImageInput {
  path: string
  originalName: string
  mimeType: string
  byteSize: number
}

export interface PurchaseImageRow {
  id: string
  storage_path: string
  source_url: string | null
  original_filename: string | null
  mime_type: string | null
  byte_size: number | null
  position: number
  kind: 'remote' | 'manual'
  category?: PurchaseImageCategory
}

export interface PurchaseRow {
  id: string
  source: ListingSource
  source_listing_id: string | null
  listing_url: string
  canonical_url: string | null
  title: string
  description: string | null
  seller_name: string | null
  price_amount: number | null
  price_currency: string
  domestic_shipping_amount: number | null
  service_fee_amount: number | null
  purchased_at: string | null
  status: PurchaseStatus
  created_at: string
  updated_at: string
  purchase_images?: PurchaseImageRow[]
}
