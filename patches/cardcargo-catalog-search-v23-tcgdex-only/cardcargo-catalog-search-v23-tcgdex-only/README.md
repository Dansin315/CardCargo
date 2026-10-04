# CardCargo Catalog Search v23 — TCGdex only

Variant B.

Changes:
- Removes Scrydex from the active catalog search.
- Removes the automatic pokemontcg.io fallback.
- TCGdex is the only active catalog provider.
- Korean physical cards still search the Japanese TCGdex catalog first.
- Cross-language English-name search from v21 is preserved.
- If TCGdex returns no candidate, CardCargo keeps the manual-entry workflow.
- No Scrydex API key or subscription is required.

Database:
- If you already ran `0013_scrydex_catalog_provider.sql`, run
  `0014_remove_scrydex_provider.sql`.
- If you never ran migration 0013, migration 0014 is optional.
- Historical `pokemontcg` catalog references remain valid for old Purchase Items.
