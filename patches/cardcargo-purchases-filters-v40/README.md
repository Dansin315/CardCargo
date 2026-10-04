# CardCargo purchase filters v40

Erweitert die Einkaufsansicht (auf Basis v38 + v39) um serverseitige Filter:

- Status
- Kaufdatum von/bis
- Filter zurücksetzen
- Filter bleiben bei Sortierung und Pagination erhalten
- gefilterte Trefferzahl / Gesamtzahl
- leere Filterergebnisse behalten die Filterleiste sichtbar

Anwendung:

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-purchases-filters-v40/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
