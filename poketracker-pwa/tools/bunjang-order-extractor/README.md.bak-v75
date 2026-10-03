# CardCargo Bunjang Extractor Reliability v74

v74 fixes two different failure modes that showed up together:

1. The overview can contain more purchases in the selected date range than the
   network-ID discovery later turns into valid `/purchases/<id>` pages.
2. A Bunjang detail page can expose price/date/seller before its transaction /
   tracking block has finished rendering.

## Overview discovery

v74 counts the real, minimal purchase cards inside the selected date range.
It no longer treats nested containers as separate cards.

For each visible in-range purchase card it then opens a background overview tab,
clicks that exact card and records the real resulting `/purchases/<id>` URL.

The network IDs remain as a fallback, but the visible cards are now the control
set for the selected date range.

The Extension shows:

- Visible purchases in range
- Order IDs resolved from cards
- Purchase cards without an Order ID
- Network candidates
- Detail pages checked

This makes a case like "8 visible purchases but only 5 valid IDs" explicit.

## Render stability / tracking

The detail page is no longer accepted as soon as only order number, seller and
payment information are visible.

After the core data appears, v74 waits for the DOM to stabilize.

If `운송장` appears, it explicitly waits for the tracking block to settle.
If an order legitimately has no tracking label, the transaction block must stay
stable for longer before the order is considered complete.

The final statistics distinguish:

- Transaction block found
- Tracking label found
- Tracking number found

## Date filter

The v72/v73 date-range filter remains intact. Default is the last 7 calendar
days including today.

## Pause / Stop

The persistent partial export remains intact. Every successfully read in-range
order is checkpointed, and Pause/Stop exports the valid progress.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-extractor-reliability-v74/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then reload the browser extension.

No Supabase migration is required.
