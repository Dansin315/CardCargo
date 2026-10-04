# CardCargo Purchases Sort Boundary Fix v39

Behebt den Next.js-Buildfehler `purchaseSortOptions.map is not a function` aus v38.

Ursache: `app/(app)/purchases/page.tsx` (Server Component) importierte `purchaseSortOptions` als Runtime-Wert aus `components/purchase-list-workspace.tsx` (`'use client'`).

Der Patch verschiebt Sortieroptionen und Typen nach `lib/purchase-sorting.ts` und importiert sie getrennt in Server- und Client-Code.

Anwendung:

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-purchases-sort-boundary-fix-v39/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Datenbankmigration notwendig.
