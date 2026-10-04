# CardCargo v87 – Direct OLAEET International Shipment Import

v87 removes the fragile "fill the old manual form with DOM events" workflow.

## Extractor 2.2 fixes

The extractor now correctly reads an OLAEET overview row rendered on separate
lines:

```text
27 Items
/
1 Box
SHP-...
```

and stores:

```text
expectedItemCount = 27
expectedBoxCount = 1
```

`extractionComplete` is true only when:

```text
unique extracted STR packages == OLAEET item count
AND
extracted boxes == OLAEET box count
```

Package rows are parsed in the actual OLAEET order:

```text
category
STR-...
masked recipient
domestic tracking
```

so `recipientMasked` is no longer filled with the category.

`Created At` and `Completed At` preserve their time component.

## CardCargo import architecture

The button on `/shipments/new` now calls:

```text
POST /api/shipments/olaeet-import
```

The API:

1. rejects incomplete extractions;
2. stores the complete extraction;
3. matches every `STR-...` against `warehouse_packages.external_package_id`;
4. falls back to a unique domestic-tracking match when needed;
5. persists all package links;
6. attempts to update CardCargo's existing shipment table and existing
   Shipment↔WarehousePackage relation for backwards compatibility.

The old manual form is hidden and is no longer programmatically filled.

## Complete fields stored

`olaeet_shipment_extractions` stores:

- SHP ID
- OLAEET status
- Created / Completed timestamp
- courier
- international tracking
- payment transaction ID
- Shipping Amount
- Shipping Fee
- Additional Fee
- Insurance Fee
- Total Payment
- currency
- recipient/address
- all boxes and weights/dimensions
- all extracted STR packages
- expected item/box counts
- extraction diagnostics
- raw OLAEET text
- complete raw extractor JSON

`olaeet_shipment_package_links` stores the resolved relationship between the
shipment and every existing CardCargo `warehouse_package`.

## Full detail page

After import CardCargo offers:

```text
/shipments/olaeet/SHP-...
```

This page shows the complete OLAEET extraction instead of only the four fields
supported by the historical manual shipment view.

## Database step

Because the full OLAEET payload contains fields that the old manual shipment
model did not expose, v87 intentionally adds two sidecar tables.

Run manually in the Supabase SQL editor:

```text
supabase/manual/v87_olaeet_shipment_extraction.sql
```

Do not blindly run `supabase db push` if this CardCargo project's remote
migration history is still inconsistent with the local migration history.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-direct-shipment-import-v87/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then run the SQL file once, and:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

Finally reload the OLAEET browser extension.
