# CardCargo – Grouped Bunjang Purchases v79

v79 fixes the many-to-one problem between Bunjang orders and grouped CardCargo
purchases.

## The old problem

`purchases.bunjang_order_id` can contain only one Bunjang order ID.

A grouped CardCargo purchase can however represent:

```text
Bunjang Order A \
Bunjang Order B  ---> one grouped CardCargo Purchase
Bunjang Order C /
```

Previously:

1. Order A was linked.
2. `purchases.bunjang_order_id` became A.
3. Order B could no longer be matched to the same Purchase.
4. In addition, an authoritative single-order product amount could overwrite
   the aggregate grouped purchase price.

## v79 model

The existing scalar field is retained for compatibility:

```text
purchases.bunjang_order_id
```

It stores the first/primary Bunjang order.

All linked order details are additionally stored in:

```text
purchases.raw_metadata.bunjang_orders[]
```

Each item contains its own:

- order ID
- order URL
- listing ID
- title
- seller
- purchase/order date
- product amount
- domestic shipping amount
- total amount
- carrier
- tracking number
- Bunjang status
- transaction method
- images / parser warnings

This makes the relationship effectively:

```text
1 CardCargo Purchase
    |
    +-- Bunjang Order A
    +-- Bunjang Order B
    +-- Bunjang Order C
```

without introducing a breaking DB migration.

## Aggregate values are protected

A Purchase is treated as grouped when e.g.:

- its title contains `&&` (the existing CardCargo grouped-import convention);
- existing metadata marks it as grouped;
- more than one Bunjang order is already linked.

For such a Purchase v79 does NOT overwrite:

- `price_amount`
- `domestic_shipping_amount`
- `domestic_carrier`
- `domestic_tracking_number`

with a single constituent Bunjang order.

The original aggregate state is also snapshotted once in:

```text
raw_metadata.bunjang_group_snapshot
```

The single-order values remain available inside each item of
`raw_metadata.bunjang_orders`.

## Matching

A normal one-to-one purchase that is already linked to a different Bunjang
order remains protected and is not suggested.

A grouped purchase may intentionally be suggested for multiple different
Bunjang orders.

Grouped-title matching understands CardCargo's `&&` convention and compares an
extracted order against the individual title parts.

The match card now also shows:

- `Typ: Zusammengefasst`
- number of already linked Bunjang orders

After saving one constituent order, another extracted order can still be
matched to the same grouped Purchase.

## Existing-order detection

The sync no longer checks only `purchases.bunjang_order_id`.

It checks both:

```text
purchases.bunjang_order_id
raw_metadata.bunjang_orders[].order_id
```

Therefore every already-linked constituent order is removed from later sync
batches individually.

## OLAEET safety

Automatic OLAEET assignment is intentionally skipped for grouped purchases.

Reason: different constituent Bunjang orders may have different domestic
tracking numbers and therefore different warehouse packages. Assigning the
whole grouped purchase from one constituent tracking number would be unsafe.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-grouped-purchase-matches-v79/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:

```bash
npm run typecheck
npm run lint
npm run build
```

No Supabase migration is required.
