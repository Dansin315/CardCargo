# CardCargo update bundle

Target branch: `feature/olaeet-module`

This bundle implements the requested inventory/import changes without assuming that migration 0017 has already been applied to the live Supabase database.

## Included changes

1. Listing image import limit: 8 -> 12 in both the client importer and server-side Zod validation.
2. English Pokemon identity + `pokemon_species`:
   - derives species from English TCGdex metadata where possible,
   - backfills existing Purchase Items and Inventory Units,
   - keeps `pokemon_name_en` and `pokemon_species` synchronized for future writes,
   - uses the English species/name as the secondary line under non-English card names.
3. Inventory lifecycle schema completion:
   - `pokemon_species`
   - `rarity`
   - `estimated_value`
   - `estimated_value_currency`
   - `purchased_at`
   - `arrived_at`
   - `inventory_unit_images`
   - arrival-date backfill from delivered shipments.
4. Inventory UI:
   - language column moved before Set,
   - language displayed as flags in the table,
   - complete configured language list in filter and editor,
   - CSV export remains available,
   - new `Massenbearbeitung` action for selected physical inventory units.
5. Bulk-edit API:
   - notes
   - purchase date
   - arrival date
   - language
   - status
   - only explicitly enabled fields are changed.

## Apply

From the repository root (or pass the `poketracker-pwa` directory directly):

```bash
python3 apply_cardcargo_changes.py /path/to/CardCargo
```

The script patches the existing branch files and copies the new files into place.

Then, from `poketracker-pwa`:

```bash
supabase db push
npm run typecheck
npm run lint
npm run build
```

If your Supabase workflow does not use the CLI, run `supabase/migrations/0018_inventory_species_language_bulk.sql` through your normal migration/deployment process instead.

## Important

The public branch already contains a file named `0017_inventory_lifecycle_images.sql`, but this bundle intentionally adds an idempotent `0018_inventory_species_language_bulk.sql`. This makes the requested fields/images safe to introduce even when the live Supabase project has not actually received 0017 yet, and adds the missing identity synchronization/backfill behavior.
