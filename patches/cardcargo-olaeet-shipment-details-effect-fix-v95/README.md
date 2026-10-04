# CardCargo v95 – OLAEET Shipment Details Effect Fix

Behebt den ESLint-Fehler:

```text
Error: Calling setState synchronously within an effect can trigger cascading renders
```

Ursache in v94:

- `setLoading(false)` wurde im `useEffect` synchron für ungültige Routen aufgerufen.
- `setLoading(true)` wurde bei jedem `shipmentRef`-Wechsel synchron im Effect aufgerufen.

v95 trennt Route-Erkennung und Daten-Lader:

- `OlaeetShipmentRecordDetails` ermittelt nur die Shipment-ID.
- Für eine gültige Shipment-ID wird ein eigener Loader mit `key={shipmentRef}` gerendert.
- Ein Wechsel auf eine andere Sendung remountet den Loader und setzt den initialen Loading-State natürlich zurück.
- Der Effect enthält nur noch asynchrone State-Updates aus `fetch().then/.catch/.finally`.

Die v94-Funktionalität bleibt unverändert:

- OLAEET-Sendungsdetails
- Kosten
- Empfänger
- Boxdaten
- einzelne zugewiesene OLAEET-Pakete

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-details-effect-fix-v95/apply.sh" \
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
