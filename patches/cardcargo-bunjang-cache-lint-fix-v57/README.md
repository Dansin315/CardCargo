# CardCargo – Bunjang cache lint fix v57

Behebt:

```text
components/purchase-import-form.tsx
Error: Calling setState synchronously within an effect can trigger cascading renders
```

## Ursache

v56 lud den lokalen Bunjang-Order-Cache so:

```ts
useEffect(() => {
  const cached = localStorage.getItem(...)
  setCachedBunjangOrders(...)
}, [])
```

Die aktive React-Lint-Regel verbietet dieses Muster.

## Fix

v57 verwendet `useSyncExternalStore` als sicheren clientseitigen Zugriff auf
`localStorage`.

Der Cache bleibt damit automatisch für den normalen Bunjang-URL-Import
verfügbar, ohne dass ein synchrones `setState` aus einem Effect notwendig ist.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-cache-lint-fix-v57/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
