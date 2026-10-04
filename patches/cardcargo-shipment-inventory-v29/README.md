# CardCargo v29 — delivered shipment -> inventory

Adds an inventory transfer action to international shipment details.

Behavior:
- The option is visible only when shipment status is `delivered` / `Zugestellt`.
- Button: `Alle Karten ins Inventar`.
- Includes:
  - cards from Bunjang purchases linked to OLAEET packages in the shipment;
  - bonus/extra cards created directly on those OLAEET packages.
- Quantity is respected: a Purchase Item with quantity 3 creates up to three
  physical inventory units.
- Existing inventory units are counted, so repeated clicks do not duplicate cards.
- The database RPC also enforces `delivered`, so the restriction is not UI-only.

Required migration:
`supabase/migrations/0016_shipment_inventory_transfer.sql`

This feature assumes migration `0015_warehouse_package_purchase_items.sql`
has already been applied.
