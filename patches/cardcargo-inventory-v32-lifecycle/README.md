# CardCargo Inventory v32 — lifecycle, editing, delivery rows and images

This patch extends the Figma/GroveStock inventory from v30/v31 without changing
CardCargo's global design direction.

## User-requested changes

1. **Editable inventory items**
   - Every physical inventory row has `Bearbeiten`.
   - Card identity, species, set, number, language, rarity, condition, grading,
     storage, costs, estimated value, status, dates and comments are editable.

2. **Pokemon species field below the card name**
   - New DB field: `pokemon_species text[]`.
   - Display examples:
     - `Gengar & Mimikyu GX` -> `Gengar, Mimikyu`
     - Japanese Mew card -> `Mew` when English catalog metadata exists
     - `Shining Rayquaza` -> `Rayquaza`
     - `Volcarona V` -> `Volcarona`
   - The field is editable and included in the general inventory search.
   - Existing rows are best-effort backfilled from `pokemon_name_en` / English
     card names. Multi-Pokemon values remain manually correctable.

3. **New columns**
   - Kommentar
   - Geschätzter Wert
   - Bilder
   - Gekauft am
   - Angekommen am

4. **Manual inventory cards**
   - `+ Einzelkarte hinzufügen` creates an Inventory Unit directly.
   - No Bunjang purchase or OLAEET package is required.
   - Source is displayed as `Manuell`.

5. **Open cards integrated into the inventory table**
   - Purchase Items not yet fully converted to Inventory Units are shown in the
     same table with virtual status `In Zustellung`.
   - They no longer appear in a separate `Offene Karten` section.
   - When a delivered shipment is transferred via `Alle Karten ins Inventar`,
     the pending quantity disappears and the physical Inventory Units are shown
     as `In Sammlung`.
   - `In Zustellung` is available as a status filter.

6. **KPI cards updated**
   - Karten insgesamt
   - In Sammlung
   - In Zustellung
   - In diesem Monat verkauft

7. **Per-card images**
   - New `inventory_unit_images` table.
   - Images can be uploaded manually.
   - Images from the linked Bunjang purchase or OLAEET package can be selected
     and copied into the card's own permanent inventory archive.
   - The table has a `Bilder` link showing the current image count.
   - Copied source images are physical storage copies, not fragile references.

## Data additions

Migration `0017_inventory_lifecycle_images.sql` adds:

- `purchase_items.pokemon_species`
- `inventory_units.pokemon_species`
- `inventory_units.rarity`
- `inventory_units.estimated_value`
- `inventory_units.estimated_value_currency`
- `inventory_units.purchased_at`
- `inventory_units.arrived_at`
- `inventory_unit_images`

It also updates the existing inventory-transfer RPCs so shipment transfer sets
physical cards to `in_collection` and records the shipment delivery date as the
inventory arrival date.

## Important lifecycle choice

`In Zustellung` is intentionally a **virtual inventory-table status** for the
remaining quantity of Purchase Items. It is not added to the PostgreSQL
`inventory_status` enum because these cards are not yet physical Inventory
Units. This keeps the model consistent:

- Purchase Item remaining quantity -> `In Zustellung`
- Shipment delivered + transferred -> Inventory Unit / `In Sammlung`

## Requirements

Apply migrations through `0016` first, especially:

- `0015_warehouse_package_purchase_items.sql`
- `0016_shipment_inventory_transfer.sql`

Then run `0017_inventory_lifecycle_images.sql`.
