# CardCargo – Bunjang Match Carousel v77

v77 changes Bunjang synchronization from a long sequential review list into a
switchable two-mode workflow.

## 1. Exact Bunjang Purchase-/Order-ID deduplication

Immediately after extractor JSON is loaded, CardCargo compares every
`orderId` with `purchases.bunjang_order_id` for the signed-in user.

If the ID already exists:

- the extracted order is not shown in the standard view;
- it is not shown in the match view;
- it is not sent to the normal bulk synchronization endpoint;
- it cannot be created a second time from this UI.

The UI explicitly reports how many records were hidden as already stored.

## 2. Two view modes

Buttons in the synchronization header:

```text
[Gesamtansicht] [Matchansicht (N)] [Abgleich aktualisieren]
```

The two views replace the previous "all cards followed by all match cards"
layout.

### Gesamtansicht

Compact list of all still-open extracted orders. Orders with suggestions show:

```text
[Matches ansehen (3)]
```

which opens that order directly in the carousel.

### Matchansicht

Only one comparison pair is rendered at a time:

```text
EXTRAKTION                GESPEICHERTER EINKAUF
[image]                   [image]
[data]          ->        [data]
```

The top-right button:

```text
[Nächstes Match ->]
```

moves to the next extracted order that has at least one candidate.

Under the right CardCargo purchase:

```text
[<-]  Kandidat 1 von 3  [->]
```

cycles through alternative possible stored purchases for the current extracted
order.

## 3. Match speichern

The old conceptual "select now, sync later" flow is removed from the carousel.

```text
[Match speichern]
```

immediately calls the existing `bunjang-order-enrichment` endpoint for the
currently displayed stored Purchase.

The Bunjang Order remains authoritative for transaction data such as:

- Bunjang order ID
- seller
- purchase date/time
- actual product amount
- domestic shipping
- carrier
- tracking

After a successful save, the order is immediately removed from both views and
the carousel advances to the next unresolved match.

## 4. Match suggestions

The match score still uses:

- listing ID
- tracking number
- title
- seller
- product amount
- domestic shipping amount
- purchase date

A stored purchase that already has a different `bunjang_order_id` is never
suggested for another order.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-match-carousel-v77/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then run:

```bash
npm run typecheck
npm run lint
npm run build
```

No Supabase migration is required.
