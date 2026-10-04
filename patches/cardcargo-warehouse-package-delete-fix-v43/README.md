# CardCargo - OLAEET package delete fix v43

Fixes the foreign-key error when deleting an OLAEET warehouse package that
owns direct package purchase items.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-warehouse-package-delete-fix-v43/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then run:

```bash
supabase db push
```

Optional verification:

```bash
npm run typecheck
npm run lint
npm run build
```

The patch changes the FK from ON DELETE RESTRICT to ON DELETE CASCADE for
`purchase_items.warehouse_package_id` only. Existing inventory units remain
because `inventory_units.purchase_item_id` already uses ON DELETE SET NULL.
