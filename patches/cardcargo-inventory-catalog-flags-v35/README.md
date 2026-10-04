# CardCargo Inventory Catalog + Flags v35

Dieser Patch ersetzt v34. Er ist speziell robuster gegenüber bereits lokal veränderten `inventory-workspace.tsx`-Dateien.

## Anwendung

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-inventory-catalog-flags-v35/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Kein `supabase db push` erforderlich.

## Was geändert wird

- Kartenkatalog im Dialog `Einzelkarte zum Inventar hinzufügen`
- Treffer übernehmen füllt Kartenname, englischen Pokémon-Namen, Pokémon-Spezies, Set, Setcode, Kartennummer und Seltenheit
- physische Sprache wird beim Katalogtreffer nicht überschrieben
- Sprache wird in der Inventartabelle über lokale SVG-Flaggen dargestellt
- KR/KO/Korean -> Korea, JP/JA/Japanese -> Japan usw.

Der Patch ist idempotent und legt vor einer Änderung von `inventory-workspace.tsx` ein Backup als `.bak-inventory-catalog-flags-v35` an.
