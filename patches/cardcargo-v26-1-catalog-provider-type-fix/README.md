# CardCargo v26.1 — Catalog provider type fix

Fixes the TypeScript error introduced by a leftover Scrydex type from v22:

`Property 'scrydex' is missing in type '{ tcgdex: string; pokemontcg: string; }'`

CardCargo is now using Variant B / TCGdex-only active search. Historical
`pokemontcg` remains in the type for old saved records, but `scrydex` is removed
from the TypeScript union and Zod payload schema.

Files replaced:
- `lib/card-catalog-types.ts`
- `lib/purchase-item-schema.ts`
- `lib/purchase-items.ts`

No database migration is required for this compile fix.
