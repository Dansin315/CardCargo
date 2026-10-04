# CardCargo – Bunjang Listing URL Fix v81

v81 fixes the main reason why the v80 checkbox
`Bunjang-Listing automatisch ergänzen` could appear to do nothing.

## Root cause in v80

v80 only starts listing enrichment when a parsed Bunjang order has a usable
`productUrls[]` entry.

The extractor previously searched only normal HTML links:

```js
document.querySelectorAll('a[href]')
```

Bunjang order-detail product cards can be JavaScript-driven and therefore may
not expose a normal `<a href=".../products/...">` element. In that case:

```text
auto listing enabled
        ↓
productUrls = []
        ↓
primaryListingUrl() = null
        ↓
v80 silently counts noUrl
        ↓
no preview / no description / no images
```

The old UI did not display the `noUrl` counter, which made this look like a
failed checkbox.

## v81 extractor URL sources

For every rendered Bunjang order detail, v81 now searches:

1. normal `<a href>` product links;
2. `data-href`, `data-url`, `data-link`, `data-product-url` and `onclick`;
3. rendered page markup / React routes containing `/product/<id>` or
   `/products/<id>`;
4. the `listingId` already captured by the v75+ Summary-first network parser.

If only an ID is known, it constructs:

```text
https://m.bunjang.co.kr/products/<listingId>
```

## CardCargo fallback

`primaryListingUrl()` now additionally falls back to `sourceListingId` even if
`productUrls[]` is missing.

## New diagnostics

Immediately after importing the extractor JSON CardCargo now shows e.g.:

```text
Listing-URLs erkannt: 8/8
```

or:

```text
Listing-URLs erkannt: 5/8 · 3 Order(s) ohne verwertbare Bunjang-Produkt-URL
```

The final sync result now also reports:

- enriched listings;
- already complete listings;
- orders without a URL;
- orders without a saved Purchase;
- conflicts;
- failures.

## Important after applying

Old extractor JSON that contains no product URL cannot be repaired magically.
Run the Bunjang extractor once again after reloading the extension, then import
the newly generated JSON into CardCargo.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-listing-url-fix-v81/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then reload the extension under `chrome://extensions` / `edge://extensions`.

For CardCargo:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

No Supabase migration is required.
