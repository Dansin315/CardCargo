# CardCargo Inventory v1 — v14

Inventory v1 introduces optional Purchase Items and a manual, catalog-assisted card workflow.

## Important behavior

A Bunjang purchase does **not** require any Purchase Items when it is imported or saved.
Purchase Items can be added at any later time from **Purchase → Edit**.

## Features

- Optional Purchase Items on each Bunjang purchase.
- Create, edit and delete Purchase Items after the purchase already exists.
- Manual fields: card name, printed number/code, physical language, set, rarity, variant, quantity, seller condition, grading and allocated unit purchase cost.
- TCGdex catalog search as the primary provider.
- Pokémon TCG API as a secondary fallback.
- Korean physical cards are kept as Korean even when an English/Japanese catalog record is used as an equivalent reference.
- Catalog matches are suggestions only; every imported value stays editable before saving.
- External catalog artwork is visibly treated as a reference image and is not stored as an inventory photo.
- Manual "move to inventory" action creates one `inventory_units` row per physical copy.
- Inventory navigation and a first `/inventory` overview.
- Existing Bunjang import, OLAEET package and shipment flows are unchanged.

## Database migration

Run:

`supabase/migrations/0011_inventory_v1.sql`

The migration extends the already-existing `purchase_items` table and adds the RPC:

`create_inventory_units_from_purchase_item(uuid)`

## Catalog sources

TCGdex is queried first. It supports REST filtering and detailed card data. Korean catalog data is not yet generally available, so a Korean physical item may intentionally use an English reference record while `purchase_items.language` remains `Korean`.

The Pokémon TCG API is used as a fallback. `POKEMON_TCG_API_KEY` is optional; add it server-side in `.env.local` if you want authenticated API limits.

## No new npm dependencies

All catalog access uses server-side `fetch()`.
