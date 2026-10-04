import type { CatalogMatchType, CatalogProvider } from '@/lib/card-catalog-types'

export type PurchaseItemSourceScope = 'purchase' | 'warehouse_package'

export interface PurchaseItemRow {
  id: string
  purchase_id: string | null
  warehouse_package_id: string | null
  item_name: string
  franchise: string
  set_name: string | null
  set_code: string | null
  pokemon_name_en: string | null
  card_number: string | null
  language: string | null
  rarity: string | null
  variant: string | null
  quantity: number
  grading_company: string | null
  grade: string | null
  seller_condition: string | null
  allocated_unit_cost: number | null
  notes: string | null
  catalog_provider: CatalogProvider | null
  catalog_card_id: string | null
  catalog_language: string | null
  catalog_match_type: CatalogMatchType | null
  catalog_image_url: string | null
  catalog_snapshot: Record<string, unknown> | null
  created_at: string
  updated_at: string
  inventory_created_count?: number
  source_scope?: PurchaseItemSourceScope
  source_purchase_id?: string | null
  source_purchase_title?: string | null
  source_package_id?: string | null
  source_package_label?: string | null
}

export const catalogProviderLabels: Record<CatalogProvider, string> = {
  tcgdex: 'TCGdex',
  pokemontcg: 'Pokémon TCG API',
}

export const catalogMatchLabels: Record<CatalogMatchType, string> = {
  exact_language: 'gleiche Katalogsprache',
  equivalent_language: 'Referenz aus anderer Sprache',
}
