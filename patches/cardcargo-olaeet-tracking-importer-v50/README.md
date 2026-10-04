# CardCargo – OLAEET Tracking + Browser Importer v50

Enthält Phase A und den ersten OLAEET-Importer.

- `purchases.domestic_carrier`
- `purchases.domestic_tracking_number`
- Tracking-Editor auf der Einkaufsdetailseite
- `/warehouse-packages/import`
- Parser für kopierten OLAEET-Seitentext oder JSON
- Erstellen/Aktualisieren von OLAEET-Paketen
- exaktes Tracking-Matching
- mehrere Einkäufe pro Trackingnummer
- Konfliktschutz bei bereits anderweitig zugeordneten Einkäufen
- optional Status -> `warehouse_received`
- lokale Chrome/Edge-Erweiterung unter `tools/olaeet-extractor`

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-tracking-importer-v50/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Der Installer erzeugt eine lokale Migration, normalerweise `0021_purchase_domestic_tracking.sql`.

Wegen der bei dir noch nicht vollständig synchronisierten Supabase-Migrationshistorie die
Migration derzeit im Supabase SQL Editor ausführen und anschließend die vom Installer
ausgegebene Version mit `npx supabase migration repair <VERSION> --status applied` markieren.

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```
