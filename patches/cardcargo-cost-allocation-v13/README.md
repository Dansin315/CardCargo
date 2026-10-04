# CardCargo Cost Allocation v13

Adds purchase-level allocation of international shipment costs.

## Allocation methods

Each component can use its own method:

- `package_weight`: first distribute by OLAEET package weight; inside each package distribute by purchase basis value (`price + domestic shipping + purchase service fee`). If all basis values inside one package are zero, that package share is split equally.
- `purchase_value`: distribute directly by purchase basis value across all purchases.
- `equal_purchase`: equal split across all purchases.
- `manual`: keep/edit entered purchase-level values. Editing an amount in the UI automatically switches that cost component to `manual` so the audit metadata stays honest.

All automatic calculations use minor-unit/largest-remainder rounding so that the allocated amounts add up exactly to the source shipment amount to two decimals.

## Database

Run `supabase/migrations/0010_shipment_cost_allocation.sql` in Supabase after applying the patch.

The migration creates:

- `shipment_cost_allocation_settings`
- `shipment_purchase_cost_allocations`
- `save_shipment_cost_allocation(...)` RPC
- invalidation triggers when shipment costs, relevant purchase values or OLAEET package weights change
- an updated `replace_shipment_packages(...)` RPC that preserves allocations when the selected package set is unchanged and invalidates them when it genuinely changes

## Currency rule

Allocation does not perform FX conversion. Value-based ratios may use a purchase currency different from the shipment currency because only the relative ratio is used, but all compared purchases must use the same purchase currency. Mixed purchase currencies require manual allocation until FX normalization is implemented.
