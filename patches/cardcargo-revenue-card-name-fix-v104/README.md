# CardCargo v104 - Umsatz Kartennamen Fix

## Ursache

Der Umsatz-Endpunkt aus v102 hat für Kartennamen nach `card_name`, `name`, `title`, `pokemon_name`, ... gesucht, aber CardCargo verwendet im Inventar als kanonischen sichtbaren Kartennamen `inventory_units.item_name` bzw. `purchase_items.item_name`.

Dadurch waren die Datensätze vorhanden, aber die Umsatzansicht fiel auf den Literalwert `Einzelkarte` zurück.

## Änderungen

- `app/api/revenue/route.ts`
  - `inventory.item_name` wird zuerst verwendet.
  - danach `purchase_item.item_name`.
  - vorhandene ältere Namensfelder bleiben als Fallback erhalten.
  - `catalog_snapshot.englishName/name` ist ein zusätzlicher letzter Fallback.
- `app/api/shipments/inventory-import/route.ts` (falls vorhanden)
  - v99-Importvorschau verwendet ebenfalls `item_name`.
  - dynamische Namens-Aliase berücksichtigen `item_name`.

Keine Supabase-Migration erforderlich.
