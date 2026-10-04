# CardCargo v83 – Filter Effect Lint Fix

This is a small follow-up patch for v82.

It fixes the ESLint error:

```text
Error: Calling setState synchronously within an effect can trigger cascading renders
```

The client-side purchase filter no longer copies server props into local state from a `useEffect`. Instead, the purchases page gives `PurchaseListWorkspace` a key derived from the effective URL filters (`q`, status, dateFrom, dateTo). When those values change, React remounts the filter workspace and the existing `useState(...)` initializers receive the new values directly.

This also preserves correct behavior for browser back/forward navigation without disabling the lint rule.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-purchases-filter-effect-fix-v83/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

No Supabase migration is required.
