# CardCargo v106 – Manuelle Bunjang-Einkäufe pro internationaler Sendung

## Ziel

Internationale Sendungen können zusätzlich zu den automatisch über OLAEET-Pakete erkannten Bunjang-Einkäufen manuell ergänzt werden.

Die neue Zuordnung unterstützt:

- einzelne Bunjang-Bestellungen per Suche auswählen,
- alle Einkäufe eines Von/Bis-Zeitraums übernehmen,
- bestehende Zuordnungen später in der Sendungsdetailansicht ergänzen,
- Zuordnungen wieder entfernen,
- Bunjang-Kosten in die Gesamtkosten der internationalen Sendung einbeziehen,
- Purchase Items dieser Einkäufe über die bestehende v99-Funktion ins Inventar übernehmen,
- automatische SHP-Verknüpfung in `inventory_shipment_sources`,
- dadurch Kompatibilität mit der Umsatzansicht v102+.

## Installation

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-shipment-manual-bunjang-purchases-v106/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Anschließend einmalig im Supabase SQL Editor ausführen:

```text
supabase/manual/v106_shipment_bunjang_purchases.sql
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

## Datenmodell

Neue Relation:

```text
shipment_bunjang_purchases
  shipment_id
  external_shipment_id
  purchase_id
  added_via       manual | date_range
```

Die Relation ist absichtlich getrennt von der OLAEET-Paketzuordnung. Dadurch können auch Käufe aufgenommen werden, die in OLAEET nicht sauber einem Storage-Paket zugeordnet wurden.

## Ablauf

1. OLAEET-Sendung wie bisher erfassen und speichern.
2. Direkt auf derselben Erfassungsseite erscheint danach **Bunjang-Einkäufe hinzufügen**.
3. Bestellung einzeln suchen oder Von/Bis-Datum setzen.
4. Einzelne Treffer markieren oder **Zeitraum komplett übernehmen**.
5. Auf der Sendungsdetailseite bleibt derselbe Manager dauerhaft verfügbar.
6. **Karten ins Inventar übernehmen** berücksichtigt diese manuellen Einkäufe automatisch.
7. Die erzeugten Inventory Units erhalten wie bei v99 den SHP-Tag und sind danach in **Umsatz** enthalten.

## Migration

v106 benötigt die neue Relationstabelle. Kein `supabase db push` ist erforderlich; die SQL-Datei kann wie bei den bisherigen CardCargo-Patches manuell im SQL Editor ausgeführt werden.
