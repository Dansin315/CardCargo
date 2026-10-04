export type InventoryColumnSpec = {
  name: string
  notNull: boolean
  hasDefault: boolean
  defaultValue: string | null
}

export const inventoryUnitColumnSpecs: InventoryColumnSpec[] = [
  { name: 'id', notNull: true, hasDefault: true, defaultValue: null },
  { name: 'user_id', notNull: true, hasDefault: false, defaultValue: null },
  { name: 'purchase_item_id', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'status', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'quantity', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'note', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'notes', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'comment', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'comments', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'tags', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'labels', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'raw_metadata', notNull: false, hasDefault: false, defaultValue: null },
  { name: 'metadata', notNull: false, hasDefault: false, defaultValue: null },
]

export const inventoryUnitColumns = inventoryUnitColumnSpecs.map((entry) => entry.name)
