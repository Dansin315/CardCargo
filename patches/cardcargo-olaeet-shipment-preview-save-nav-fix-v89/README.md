# CardCargo v89 – OLAEET Preview, explicit Save & Navigation Fix

## 1. Two-step OLAEET shipment import

The shipment page no longer saves immediately when the clipboard is read.

New flow:

```text
OLAEET Extractor
→ Aus Zwischenablage übernehmen
→ complete preview
→ Internationale Sendung speichern
```

The preview shows before saving:

- SHP ID and provider status
- Created At / Completed At
- courier
- international tracking
- Payment Transaction ID
- Shipping Amount
- Shipping Fee
- Additional Fee
- Insurance Fee
- Total Payment
- complete recipient/address data
- all box dimensions and weights
- every extracted STR package
- category, masked recipient and domestic tracking per package
- extraction diagnostics and raw text in a collapsible technical section

## 2. Missing v87 sidecar tables no longer block saving

v87 previously wrote `olaeet_shipment_extractions` first and aborted the whole
request when that optional table did not exist.

v89 reverses the priority:

```text
existing CardCargo shipment table
→ existing package relation/direct package assignment
→ optional v87 full-detail archive
```

If the v87 SQL was never run, CardCargo still saves the normal shipment. The
UI reports that the optional full-detail archive is unavailable instead of
turning the import into an error.

If the v87 sidecar tables do exist, they continue to store the complete raw
OLAEET extraction and `/shipments/olaeet/SHP-...` remains available.

## 3. Package assignment

v89 tries both existing CardCargo data models:

1. an existing Shipment↔WarehousePackage relation table;
2. a direct shipment foreign key on `warehouse_packages`.

The result panel shows which method was used and how many packages were linked.

## 4. URL Import navigation entry

The previous v84 remover only handled a literal JSX `<Link>`. The actual
CardCargo navigation is configured differently, so the entry remained visible.

v89 detects the navigation source using the surrounding labels (`Übersicht`,
`Einkäufe`, `OLAEET-Pakete`, `Sendungen`, `Inventar`) and removes `URL
importieren` from JSX links, flat navigation objects, or tuple configurations.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-preview-save-nav-fix-v89/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

No new Supabase migration is required. The old v87 sidecar SQL is optional
from v89 onward. A copy is included again under
`supabase/manual/v87_olaeet_shipment_extraction.sql` if you want the complete
raw extraction to remain permanently available after leaving the import page.
