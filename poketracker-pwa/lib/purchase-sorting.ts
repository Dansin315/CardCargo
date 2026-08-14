export const purchaseSortOptions = [
  ['date_desc', 'Kaufdatum: neu nach alt'],
  ['date_asc', 'Kaufdatum: alt nach neu'],
  ['price_desc', 'Preis: hoch nach niedrig'],
  ['price_asc', 'Preis: niedrig nach hoch'],
  ['created_desc', 'Erfasst: neu nach alt'],
  ['created_asc', 'Erfasst: alt nach neu'],
  ['updated_desc', 'Zuletzt geändert'],
  ['seller_asc', 'Verkäufer: A–Z'],
  ['seller_desc', 'Verkäufer: Z–A'],
  ['title_asc', 'Titel: A–Z'],
  ['title_desc', 'Titel: Z–A'],
] as const

export type PurchaseSortKey = (typeof purchaseSortOptions)[number][0]

export const purchaseSortKeys = new Set<PurchaseSortKey>(
  purchaseSortOptions.map(([key]) => key),
)
