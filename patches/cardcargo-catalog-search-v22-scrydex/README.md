# CardCargo Catalog Search v22 — Scrydex fallback

Provider order:
1. TCGdex
2. Scrydex
3. legacy pokemontcg.io only when ENABLE_LEGACY_POKEMON_TCG_FALLBACK=1

Why:
- Scrydex is the successor to pokemontcg.io.
- Scrydex has dedicated English and Japanese card catalogs.
- Japanese cards can contain nested English translations.
- Scrydex exposes expansion code and expansion name separately.
- Unauthenticated requests are supported with heavily reduced rate limits.
- Optional authenticated requests use SCRYDEX_API_KEY and SCRYDEX_TEAM_ID.

Example target:
Japanese Shining Rayquaza:
- Japanese name: ひかるレックウザ
- printed number: 057/072
- expansion: Shining Legends / ひかる伝説
- set code: SM3+
- Scrydex card id shown publicly: sm3p_ja-57

Database migration:
Run `0013_scrydex_catalog_provider.sql` so Purchase Items may persist
`catalog_provider = 'scrydex'`.
