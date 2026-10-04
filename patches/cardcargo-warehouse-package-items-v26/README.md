# CardCargo v26 — OLAEET-linked Purchase Items

Adds the existing "Einzelkarte hinzufügen" workflow to OLAEET warehouse packages
and makes the card rows shared between the purchase and package views.

## Data model

`purchase_items` can now have exactly one direct parent:

- `purchase_id` — normal card belonging to a Bunjang purchase, or
- `warehouse_package_id` — bonus/extra card discovered in an OLAEET package.

The UI/API merges both scopes dynamically:

- OLAEET package view = package bonus cards + cards from all linked purchases.
- Bunjang purchase view = its own cards + package bonus cards from its linked OLAEET package.

This means there is only one database row per card position. Editing it from either
view updates the other view automatically.

If an OLAEET package contains several linked Bunjang purchases, a package-level bonus
card is intentionally visible on every linked purchase as `OLAEET-Bonus`, because the
bonus cannot be assigned to one seller/purchase without additional information.

## Inventory

The manual `x ins Inventar` action also works for package bonus cards. Package-owned
bonus cards use KRW as their default cost currency because they do not have their own
Bunjang purchase currency. Their allocated unit cost may remain empty/zero.

## Migration

Run:

`supabase/migrations/0015_warehouse_package_purchase_items.sql`

The migration:

- makes `purchase_items.purchase_id` nullable,
- adds `purchase_items.warehouse_package_id`,
- enforces exactly one direct parent,
- adds the package item index,
- updates the inventory-transfer RPC for package bonus cards.

## UI

The OLAEET package detail page receives the same Purchase Items manager used by the
Bunjang purchase edit page. Rows are labelled as either:

- `Bunjang-Einkauf · <title>`, or
- `OLAEET-Bonus · <package>`.

No card-catalog changes are included; the working TCGdex v24 search remains untouched.
