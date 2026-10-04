# CardCargo v94 – OLAEET Shipment Persistence

v94 fixes the core reason an imported international shipment could exist but
look empty in CardCargo.

## Root cause

v90-v92 used `mapFirst(...)`: when several compatible shipment columns existed,
only the first one was written. After canonical OLAEET columns were introduced,
CardCargo could write `external_shipment_id` while the existing UI still read
`shipment_number`, write `courier` while the UI read `carrier`, or write
`total_payment` while the UI read an older cost column. The record therefore
looked empty even though the extraction had data.

v94 uses `mapAll(...)` and mirrors each OLAEET value into every compatible
column that actually exists in the current CardCargo schema.

## Stored on the normal `shipments` record

- OLAEET SHP number
- provider + provider status
- CardCargo-compatible internal status
- courier/carrier
- international tracking
- payment transaction ID
- shipping amount
- shipping fee
- additional fee
- insurance fee
- total payment
- currency
- recipient/address
- package count + box count
- created/completed times
- package/box JSON
- complete raw metadata

## OLAEET package assignment

v94 adds `warehouse_packages.shipment_id` and writes every matched OLAEET
warehouse package to the newly saved shipment.

Matching priority:

1. exact `STR-...` / `external_package_id`
2. unique domestic tracking number fallback

A canonical `olaeet_shipment_package_links` relation is also stored for audit
and quick rendering.

## Quick package review inside the shipment

The patch injects `OlaeetShipmentRecordDetails` into the normal dynamic
shipment detail page when one is found. It displays:

- SHP number, status, courier, tracking and timestamps
- full cost breakdown
- recipient/address
- box dimensions and all weights
- all assigned OLAEET packages with STR ID, category, masked recipient,
  domestic tracking and current warehouse-package status

This lets you verify all packages without going back to the OLAEET package
screen.

## Required one-time SQL

Run in the Supabase SQL editor:

```text
supabase/manual/v94_olaeet_shipment_persistence.sql
```

The importer intentionally refuses to create another partially empty shipment
when the v94 persistence columns are not installed.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-persistence-v94/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then run the SQL file once and validate:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```
