# CardCargo v100 – Inventory shipment filter runtime fix

Fixes the inventory runtime crash:

```text
Cannot read properties of undefined (reading 'length')
at select
at InventoryShipmentFilter
```

## Cause

v99 used a controlled native `<select>` for the shipment filter. In the current
Next.js 16 / React runtime this could enter the native select update path with an
unexpected value shape while the async shipment-source payload was being
hydrated/reconciled.

## Fix

- removes the native `<select>` completely;
- replaces it with a small `<details>` + button menu;
- validates `sources` and `shipments` at runtime before iterating them;
- defaults malformed/missing API arrays to `[]`;
- preserves the existing `?shipment=SHP-...` URL filter behavior;
- preserves shipment badges on inventory cards/table rows;
- requires no database change.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-inventory-shipment-filter-runtime-fix-v100/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```
