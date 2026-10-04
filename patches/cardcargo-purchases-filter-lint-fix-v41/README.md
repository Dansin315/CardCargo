# CardCargo purchase filter lint fix v41

Behebt `react-hooks/set-state-in-effect` aus dem v40-Einkaufsfilter.

## Ursache

`purchase-list-workspace.tsx` synchronisierte `statusFilter`, `dateFrom` und `dateTo` über einen `useEffect` direkt in lokalen State. Der aktuelle React ESLint-Regelsatz meldet dies als synchrones `setState` innerhalb eines Effects.

## Fix

- entfernt den Filter-Synchronisations-`useEffect`
- entfernt den nicht mehr benötigten `useEffect`-Import
- setzt auf `PurchaseListWorkspace` einen URL-abhängigen React-`key`
- Filter-State wird dadurch bei Änderung von Seite, Sortierung oder Filtern sauber neu initialisiert
- keine ESLint-Regel wird deaktiviert
- keine Datenbankänderung

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-purchases-filter-lint-fix-v41/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```
