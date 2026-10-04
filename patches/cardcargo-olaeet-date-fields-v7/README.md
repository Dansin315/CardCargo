# CardCargo OLAEET date-only fields v7

This patch changes the OLAEET package form to use calendar dates instead of date-and-time inputs.

## Changes

- `Eingang bei OLAEET`: date only
- `Inspektionsdatum`: date only
- `Lagerbeginn`: date only
- `Lagerfrist`: read-only and automatically calculated as arrival + 80 calendar days
- Server-side validation accepts only `YYYY-MM-DD`
- Submitted deadline values are ignored and recalculated on the server
- Database trigger applies the same rule for future imports and direct database writes
- Existing packages receive a recalculated deadline when migration `0003` is run

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash "$HOME/CardCargo/patches/cardcargo-olaeet-date-fields-v7/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then run the complete contents of:

```text
supabase/migrations/0003_olaeet_date_only_deadline.sql
```

in the Supabase SQL Editor.

## Validate

```bash
nvm use 22
rm -rf .next
rm -f tsconfig.tsbuildinfo
npm run typecheck
npm run lint
npm run test
npm run build
```
