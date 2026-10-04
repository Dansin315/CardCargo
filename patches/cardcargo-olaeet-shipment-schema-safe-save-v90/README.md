# CardCargo v90 – OLAEET Shipment Schema-Safe Save

v90 fixes the runtime error after pressing **Internationale Sendung speichern**:

```text
shipments: Could not find the 'provider_status' column of 'shipments' in the schema cache
```

## Cause

v89 guessed a fallback schema when `shipments` had no row available for
inspection. That fallback included `provider_status`, although the actual
CardCargo table does not have that column.

## Fix

v90 no longer guesses columns. It probes the real PostgREST schema one column
at a time with zero-row selects and only writes fields that actually exist.

It supports common CardCargo variants such as:

- `status` / `provider_status`
- `carrier` / `courier`
- `tracking_number` / `international_tracking_number`
- `external_id` / `external_shipment_id` / `shipment_number`
- different total and currency field names

If an actual NOT NULL field is reported while saving, v90 tries to infer a
value from the OLAEET extraction and retries automatically.

The same schema-safe probing is used for Shipment↔WarehousePackage relation
tables and direct package foreign keys.

## Existing v89 workflow stays

```text
Aus Zwischenablage übernehmen
→ vollständige Details prüfen
→ Internationale Sendung speichern
```

The v89 navigation cleanup also runs again, so any remaining `URL importieren`
entry is removed.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-schema-safe-save-v90/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

No new Supabase migration is required. The v87 detail archive remains optional.
