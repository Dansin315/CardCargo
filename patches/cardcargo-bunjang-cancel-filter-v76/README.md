# CardCargo Bunjang Cancel Filter v76

v76 adds cancellation/refund filtering to the v75 Summary-first extractor.

## What is excluded

The extractor treats only final cancellation/refund states as excluded, for
example:

- `거래 취소 완료`
- `주문 취소 완료`
- `결제 취소 완료`
- `취소 처리 완료`
- `취소 완료`
- `환불 완료`
- `환불 처리 완료`

A mere cancellation request such as `취소 요청 보냄` is intentionally not
considered final cancellation.

## Two-stage check

### 1. Overview/API summary

If Bunjang's list data already contains a final cancelled/refunded status, the
order is filtered before a detail page is opened. This preserves v75's fast
Summary-first behavior.

### 2. Rendered detail page

If overview status is missing or incomplete, the rendered `/purchases/<id>`
page is checked again near the actual order header/status area.

A final cancelled/refunded order is:

- marked in the local SmartSync cache;
- excluded from current and future targets;
- never added to the partial/final JSON export.

## Statistics

The popup now shows:

```text
Storniert/erstattet übersprungen   N
```

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-cancel-filter-v76/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then reload the extension under `chrome://extensions` or `edge://extensions`.

No Supabase migration is required.
