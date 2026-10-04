# CardCargo v102 - Umsatz

Neue Navigation **Umsatz** mit einer Excel-artigen Kalkulationsansicht pro internationaler Sendung.

## Funktionen

- Sendungsauswahl über `SHP-...`
- nur Inventory Units der gewählten internationalen Sendung (v99 `inventory_shipment_sources`)
- gruppierte Darstellung: Bestellung -> Einzelkarten; direkt im Paket erfasste Karten -> OLAEET-Paket
- Bestellkosten in KRW und EUR
- `min. Verkaufswert` und `Verkaufspreis` direkt in KRW **oder** EUR editierbar
- Bestellung-Zeilen aggregieren die Kartenwerte automatisch
- Kennzahlen über der Tabelle:
  - Gesamtkosten der Sendung (Bunjang + OLAEET + erfasster Zoll)
  - Mindestumsatz
  - aktueller Umsatz
- historischer EUR/KRW-Kurs wird auf das Erstellungsdatum der Sendung fixiert und gespeichert
- Wechselkursquelle: Frankfurter API mit ECB Provider; an Wochenenden wird bis zum letzten verfügbaren Veröffentlichungstag zurückgegangen

## Datenhaltung

`inventory_sales_values`
- ein Datensatz pro Inventory Unit
- `min_sale_price_krw`
- `sale_price_krw`

KRW ist die kanonische gespeicherte Währung. EUR wird mit dem für die Sendung fixierten historischen Kurs berechnet. Wird eine EUR-Zelle editiert, rechnet CardCargo beim Speichern zurück in KRW.

`shipment_revenue_fx`
- `requested_date`: Erstellungsdatum der internationalen Sendung
- `rate_date`: tatsächlich verwendeter ECB-Veröffentlichungstag
- `krw_per_eur`: 1 EUR = X KRW
- Rate wird einmal gespeichert und danach wiederverwendet

## Voraussetzung

v99 muss bereits installiert sein und `inventory_shipment_sources` enthalten.
v98 wird für die vorhandene Sendungskosten-/Zollzusammenfassung verwendet.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-revenue-workspace-v102/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach im Supabase SQL Editor einmal den Inhalt ausführen:

```text
supabase/manual/v102_revenue_workspace.sql
```

Dann:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```
