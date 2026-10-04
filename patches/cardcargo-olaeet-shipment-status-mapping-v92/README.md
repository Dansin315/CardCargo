# CardCargo v92 – OLAEET Shipment Status Mapping

Der Fehler

```text
invalid input value for enum shipment_status: "Transferring"
```

entsteht, weil `Transferring` ein OLAEET-Providerstatus ist. Dieser darf nicht
unverändert in CardCargos internes PostgreSQL-Enum `shipment_status` geschrieben
werden.

v92 trennt deshalb die beiden Statusarten:

```text
OLAEET provider_status      CardCargo status
Created / Pending           planned / pending / draft
Preparing / Packing         preparing / processing / ready
Transferring                in_transit / shipped / shipping
Delivered / Completed       delivered / completed
Canceled                    cancelled / canceled
```

Der originale OLAEET-Status bleibt in `provider_status` bzw. der Extraction
erhalten.

Da ältere CardCargo-Datenbanken unterschiedliche Enum-Versionen haben können,
probiert der Import bei `Transferring` semantisch passende interne Werte der
Reihe nach. Ein ungültiger Enum-Kandidat bricht den Import nicht mehr ab.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-status-mapping-v92/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
