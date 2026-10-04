# CardCargo Inventory v16 — Setcodes & English Names

Changes:
1. Enter in the Purchase Item form triggers **Pokémon-Katalog durchsuchen**, never save.
2. Physical language **Korean** searches TCGdex **Japanese first**; choosing a candidate does not overwrite the physical language.
3. Catalog search uses **set code** (e.g. `sv4a`, `PAF`) instead of set name. Both set code and set name are saved.
4. Japanese catalog candidates are enriched with an English Pokémon/card name when TCGdex provides enough data (`dexId`/suffix). The selected Purchase Item uses the English card name when available, while the physical language remains unchanged.
5. `purchase_items` and `inventory_units` both store `set_code` and `pokemon_name_en`; inventory units also receive set name, card number and language.
6. Inventory page now supports searching by English Pokémon name, card name, set name, set code, card number, or language.

Migration:
- Run `supabase/migrations/0012_inventory_setcode_english_names.sql` after applying the files.
