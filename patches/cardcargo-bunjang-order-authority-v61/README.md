# CardCargo – Bunjang Order Authority v61

## Problem

Der URL-Import kann den ursprünglichen Listing-Preis anzeigen, während die
tatsächliche Bunjang-Bestellung einen anderen bezahlten Warenwert enthält.

Beispiel:

```text
Listing: 65.000 KRW
Order:   50.000 KRW
```

Bisher verwendete `Bestelldaten übernehmen` für den Preis:

```ts
current.priceAmount || record.productAmount
```

Damit gewann ein bereits vom Listing gesetzter Preis immer gegen die Order.

## Neue Source-of-Truth-Regel

### Bunjang Listing ist autoritativ für

- Listing-ID
- Produkt-/Listing-URL
- Titel
- Beschreibung
- Angebotsbilder

### Bunjang Order ist autoritativ für

- `bunjang_order_id`
- Verkäufer
- tatsächliches Kaufdatum
- Warenwert / Kaufpreis
- koreanische Versandkosten
- Carrier
- Trackingnummer
- Bestellstatus / Transaktionsmetadaten

Wenn ein Order-Wert vorhanden ist, ersetzt er künftig den entsprechenden
Listing-Wert.

## Beispiel

Vor `Bestelldaten übernehmen`:

```text
Preis: 65000
Versand: 4500
```

Passende Order:

```text
Warenwert: 50000
Versand: 4500
```

Nach Klick:

```text
Preis: 50000
Versand: 4500
```

## Server-Schutz

Die Priorität wird nicht nur im Formular geändert.

Auch:

- `bunjang-order-enrichment`
- `bunjang-order-sync`

verwenden Order-Preis, Verkäufer, Kaufdatum und Versandkosten vorrangig.

Dadurch bleibt der richtige Wert auch erhalten, wenn die Daten in einer
anderen Reihenfolge importiert werden.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-order-authority-v61/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
