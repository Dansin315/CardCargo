# CardCargo Catalog Search v24 — modifier-aware cross-language search

Fixes the incorrect behavior where a query such as `Shining` was reduced to
the Pokedex IDs of all matching Pokemon and therefore returned ordinary Mew,
Rayquaza, Celebi, etc. cards.

New behavior:
- `Charizard`, `Chari`, `Mew`, `Rayquaza` -> Pokemon species search.
- `Shining` -> card-name/modifier search, not a Pokemon species search.
- `Shining Rayquaza` -> translates the full card name to `ひかるレックウザ`.
- `Radiant Charizard` -> `かがやくリザードン`.
- Known prefixes currently supported:
  - Shining -> ひかる
  - Radiant -> かがやく
  - Dark -> わるい
  - Light -> やさしい
  - Rocket's -> ロケット団の / R団の
  - Birthday -> おたんじょうび
  - Surfing -> なみのり
  - Flying -> そらをとぶ
- Standard suffixes such as ex, EX, GX, V, VMAX and VSTAR are preserved.
- For known modifier searches on Korean/Japanese physical cards, Japanese and
  English TCGdex matches are interleaved. This prevents incomplete Japanese
  catalog coverage from hiding valid English references.
- The physical card language is still never changed by selecting a catalog hit.
- TCGdex remains the only card catalog provider.
- No database migration is required.

Recommended tests:
1. Shining / Korean
2. Shining Rayquaza / Korean
3. Shining Mew / Korean
4. Charizard / Korean
5. Chari / Korean
6. Radiant Charizard / Korean
