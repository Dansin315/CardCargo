# CardCargo v99 - Karten einer internationalen Sendung ins Inventar

## Neue Funktion in der Sendungsansicht

Jede internationale OLAEET-Sendung erhält einen Bereich **Inventar-Übernahme**.

CardCargo ermittelt dort automatisch alle `purchase_items`, die zur Sendung gehören:

1. Einzelkarten aus Bunjang-Einkäufen, deren OLAEET-Paket in der Sendung enthalten ist.
2. Einzelkarten/Bonuskarten, die direkt am OLAEET-Warehouse-Paket erfasst wurden.

Der Bereich zeigt vor dem Import:

- Karten gesamt;
- bereits im Inventar;
- neu zu übernehmen;
- Anzahl Purchase Items;
- Quelle Bunjang vs. direktes OLAEET-Paket.

Der Button **Alle Karten ins Inventar übernehmen** ist idempotent. Bereits vorhandene
Inventory Units mit demselben `purchase_item_id` werden nicht dupliziert, sondern nur
mit der internationalen Sendung verknüpft.

## Sendungs-Tag / Notiz

Jede übernommene oder bereits vorhandene Inventory Unit wird persistent mit der Sendung
verknüpft. Beispiel:

```text
Internationale Sendung SHP-20260819-RRKNGF
```

Wenn das aktuelle `inventory_units`-Schema eines dieser Felder besitzt, wird die Notiz
zusätzlich dort ergänzt:

```text
note / notes / comment / comments / memo
```

Bei `tags` oder `labels` wird außerdem die `SHP-...`-Nummer ergänzt. Die sichere
Filterquelle ist unabhängig davon die neue Tabelle `inventory_shipment_sources`.

## Filter im Inventar

Im Inventar erscheint ein Filter:

```text
Internationale Sendung
[ Alle Sendungen                         v ]
[ SHP-20260819-RRKNGF · 27 Karten          ]
```

Übernommene Inventory Records erhalten zusätzlich einen kleinen sichtbaren `SHP-...`-Tag.
Der Link **Im Inventar filtern** in der Sendung öffnet den Filter direkt.

## Schema-sicherer Inventory-Import

v99 liest beim Anwenden die lokale `inventory_units`-Definition aus den vorhandenen
Supabase-SQL-Dateien und ergänzt die Erkennung zur Laufzeit über eine vorhandene
Inventory Unit. Felder mit identischem Namen werden aus `purchase_items` übernommen;
für verbreitete Kartenfelder existieren zusätzliche Alias-Mappings.

Damit wird nicht ein historisches CardCargo-Inventarschema fest vorausgesetzt.

## Einmalige Datenbankerweiterung

Im Supabase SQL Editor ausführen:

```text
supabase/manual/v99_inventory_shipment_sources.sql
```

Die Tabelle speichert die robuste Relation:

```text
Inventory Unit -> Internationale Sendung -> Purchase Item / OLAEET-Paket
```

Nicht blind `supabase db push` verwenden, wenn deine Remote-Migrationshistorie weiterhin
vom lokalen Stand abweicht.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-shipment-cards-to-inventory-v99/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach SQL-Datei einmalig ausführen und anschließend:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```
