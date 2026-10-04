CardCargo catalog search fix v15

Replace these files in poketracker-pwa:
  lib/card-catalog-server.ts
  components/purchase-items-manager.tsx
  app/api/card-catalog/search/route.ts

Changes:
- TCGdex Korean searches prefer Japanese reference data, then fallback to mapped language/English.
- Japanese searches use Japanese first.
- Number searches do not get rejected by a translated card name.
- TCGdex list results survive detail-enrichment failures.
- Card name is optional for catalog search.
- Set-only catalog search is allowed.
- Candidate cards show catalog language in the UI.
- Card name is still required only when saving a Purchase Item.
