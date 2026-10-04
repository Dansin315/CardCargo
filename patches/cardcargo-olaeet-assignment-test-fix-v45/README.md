# CardCargo OLAEET assignment test fix v45

Behebt den TypeScript-Fehler nach v44:

`PackagePurchaseChoice` besitzt nun zusätzlich:

- `seller_name`
- `price_amount`
- `currency`

Der bestehende Test `tests/warehouse-package-assignment.test.ts` hatte noch die alten Testobjekte.

Der Patch ergänzt ausschließlich diese Test-Fixtures. An der App- oder Datenbanklogik wird nichts geändert.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-assignment-test-fix-v45/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Kein `supabase db push` erforderlich.
