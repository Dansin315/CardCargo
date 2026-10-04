# CardCargo v103 - Umsatz TypeScript Fix

Behebt vier TypeScript-Fehler aus v102 in `app/api/revenue/route.ts`:

1. Der Helper `purchaseCostKrw(...)` wurde später im selben Block durch `const purchaseCostKrw = ...` verschattet. Dadurch behandelte TypeScript den Funktionsaufruf als Zugriff auf eine `Number` vor ihrer Deklaration.
2. Die beiden Fallback-Objekte mit `cards: []` wurden im `??`-Ausdruck als `never[]` inferiert. Die Accumulatoren werden nun explizit als `GroupOutput` typisiert.

Keine Supabase-Migration notwendig.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-revenue-type-fix-v103/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```
