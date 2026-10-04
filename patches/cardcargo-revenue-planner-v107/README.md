# CardCargo v107 - Umsatzplan / Testplan

Adds a temporary, browser-local planning workspace under `/revenue/plan`.

## Features
- `Plan / Test` entry from the existing Umsatz page.
- Multiple named local plans, auto-saved to `localStorage`.
- Search/add Bunjang purchases manually or by purchase date range.
- Purchase Items are copied as planning rows without changing real inventory data.
- Add any number of not-yet-purchased cards manually.
- Editable quantity, planned manual purchase price (EUR), minimum sale value (EUR), and target sale price (EUR).
- Live target revenue and minimum revenue totals.
- Remove purchases/cards and create/delete plans.
- No sale status or inventory price is changed from the planner.

## Install
```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-revenue-planner-v107/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:
```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

No Supabase migration is required. Drafts are stored in the browser under `cardcargo.revenuePlans.v107`.
