# CardCargo Bunjang Summary-first v75

v75 fixes the main performance problem of v74.

## Previous v74 path

v74 used the visible purchase cards as its authoritative control set and then
opened/clicked every card in a background tab to discover its real
`/purchases/<id>` URL.

That is reliable, but slow.

## v75 default path

The network capture now extracts not just IDs, but overview summaries whenever
Bunjang's own list API exposes them:

- purchase/order ID
- purchase date
- title
- seller
- product amount
- shipping amount if available
- status
- image URL
- listing/product ID if available

The normal flow becomes:

```text
Bunjang overview API
        |
        v
Order ID + purchase date + summary
        |
        v
Date filter BEFORE detail pages
        |
        v
SmartSync cache
        |
        v
Only necessary /purchases/<id> detail pages
```

For the default 7-day range, old orders are therefore not individually opened
just to discover that their date is outside the range.

## Local detail cache

After a successful detail extraction, v75 stores per Order ID in the existing
SmartSync extension storage:

- purchasedAt
- title
- sellerName
- productAmount
- domesticShippingAmount
- domesticCarrier
- domesticTrackingNumber
- trackingFound
- lastCheckedAt

This means future runs can use a known purchase date even if a later overview
network response contains only the Order ID.

## Slow fallback

The extension now has:

```text
[ ] Langsamen Karten-Fallback verwenden
```

Default: OFF.

Only enable it when the summary counter shows that Bunjang's network data did
not provide enough dated summaries for the visible orders.

With the fallback disabled, individual overview cards are never opened merely
to discover their Order ID.

With the fallback enabled, the v74 card-click mechanism is used only as a
recovery path.

## Useful counters

v75 shows:

- Visible purchases in selected range
- API summaries in selected range
- Candidates without overview date
- Slow fallback on/off
- Detail pages to load
- Already complete with tracking

If e.g.:

```text
Visible purchases       8
API summaries           8
Details to load         3
```

the fast path is working correctly.

If:

```text
Visible purchases       8
API summaries           5
Unknown-date candidates 3
```

you can enable the slow fallback for that run.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-summary-first-v75/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then reload the browser extension.

No Supabase migration is required.
