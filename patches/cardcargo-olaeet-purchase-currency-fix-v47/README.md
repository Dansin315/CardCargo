# CardCargo – OLAEET purchase currency fix v47

Behebt den Runtime-Fehler:

```text
column purchases.currency does not exist
```

## Ursache

Die Tabelle `public.purchases` besitzt:

- `price_amount`
- `price_currency`

aber keine Spalte `currency`.

v44 hat für die neue OLAEET-Zuordnungsansicht versehentlich `currency`
abgefragt.

## Fix

Die Supabase-Abfragen in:

- `app/(app)/warehouse-packages/new/page.tsx`
- `app/(app)/warehouse-packages/[id]/edit/page.tsx`

verwenden jetzt den PostgREST-Alias:

```text
currency:price_currency
```

Damit bleibt `PackagePurchaseChoice.currency` in der UI unverändert, während
aus der Datenbank die tatsächlich existierende Spalte `price_currency`
gelesen wird.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-purchase-currency-fix-v47/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Kein `supabase db push` erforderlich.
