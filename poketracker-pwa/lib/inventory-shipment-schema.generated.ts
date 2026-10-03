export type InventoryColumnSpec = {
  name: string
  notNull: boolean
  hasDefault: boolean
  defaultValue: string | null
}

export const inventoryUnitColumnSpecs: InventoryColumnSpec[] = [
  {
    "name": "allocated_total_cost",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "category",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "comment",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "comments",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "condition",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "cost_currency",
    "notNull": true,
    "hasDefault": true,
    "defaultValue": "EUR"
  },
  {
    "name": "created_at",
    "notNull": true,
    "hasDefault": true,
    "defaultValue": "now()"
  },
  {
    "name": "delivered_at",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "domestic_tracking_number",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "external_package_id",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "grade",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "grading_company",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "id",
    "notNull": false,
    "hasDefault": true,
    "defaultValue": "gen_random_uuid()"
  },
  {
    "name": "inventory_unit_id",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "item_name",
    "notNull": true,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "labels",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "memo",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "metadata",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "note",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "notes",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "original_filename",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "packages",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "position",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "price_currency",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "purchase_id",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "purchase_item_id",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "quantity",
    "notNull": true,
    "hasDefault": true,
    "defaultValue": "1"
  },
  {
    "name": "raw_metadata",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "sale_currency",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "sale_price",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "sha256",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "shipment_id",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "sold_at",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "source_type",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "status",
    "notNull": true,
    "hasDefault": true,
    "defaultValue": "expected"
  },
  {
    "name": "storage_location",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "storage_path",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "tags",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "title",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "updated_at",
    "notNull": true,
    "hasDefault": true,
    "defaultValue": "now()"
  },
  {
    "name": "user_id",
    "notNull": true,
    "hasDefault": false,
    "defaultValue": null
  },
  {
    "name": "warehouse_package_id",
    "notNull": false,
    "hasDefault": false,
    "defaultValue": null
  }
]

export const inventoryUnitColumns = inventoryUnitColumnSpecs.map((entry) => entry.name)
