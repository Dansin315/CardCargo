# CardCargo v88 – OLAEET Shipment Import Type Fix

v88 fixes the two TypeScript TS2367 errors introduced by v87.

## Why TypeScript complained

The generated values are literal tuples:

```ts
shipmentTableCandidates
shipmentPackageTableCandidates
```

Therefore `table` can only ever be one of the strings already contained in
those tuples.

v87 nevertheless checked:

```ts
table === 'olaeet_shipment_extractions'
table === 'olaeet_shipment_package_links'
```

Those strings are intentionally not members of the candidate lists, so
TypeScript correctly reported that the comparisons can never be true.

v88 removes those redundant guards.

## Schema scanner cleanup

The local scan had also classified auxiliary tables such as:

```text
shipment_images
shipment_cost_allocation_settings
shipment_purchase_cost_allocations
```

as possible main shipment tables.

v88 now excludes:

- images
- documents / attachments
- events / history / logs
- cost / fee / allocation tables
- settings
- v87 OLAEET sidecar tables

Only actual top-level shipment tables go into:

```ts
shipmentTableCandidates
```

and only actual Shipment<->Package relation tables go into:

```ts
shipmentPackageTableCandidates
```

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-direct-shipment-import-type-fix-v88/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

No additional Supabase migration is required. If you have not yet run the v87
SQL file, that one-time v87 SQL step is still required for the direct shipment
import.
