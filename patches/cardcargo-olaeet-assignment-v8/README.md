# CardCargo OLAEET assignment v8

This patch enforces a one-package-at-a-time rule for Bunjang purchases.

## Behaviour

- The new-package form lists only purchases that have no OLAEET package assignment.
- The edit form lists unassigned purchases plus purchases already assigned to the package being edited.
- Removing a purchase from a package and saving deletes that link, so the purchase becomes selectable elsewhere.
- Migration 0004 adds a unique database index and updates the assignment RPC, preventing duplicate assignment through concurrent or direct requests.

## Apply

```bash
bash "$HOME/CardCargo/patches/cardcargo-olaeet-assignment-v8/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then execute `supabase/migrations/0004_one_olaeet_package_per_purchase.sql` in the Supabase SQL Editor.

## Existing duplicates

Migration 0004 intentionally stops if a purchase is already linked to multiple packages. Inspect conflicts with:

```sql
select
  purchase_id,
  array_agg(warehouse_package_id order by warehouse_package_id) as package_ids,
  count(*) as assignment_count
from public.warehouse_package_purchases
group by purchase_id
having count(*) > 1;
```

Resolve those links manually before rerunning the migration.
