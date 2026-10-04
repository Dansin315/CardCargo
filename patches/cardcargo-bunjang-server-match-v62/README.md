# CardCargo – Bunjang Server Match v62

## Problem

Der URL-Import suchte in Abschnitt 3 bisher primär im lokalen Browser-Cache der
Bunjang-Order-Extraction.

Ein zuvor über **Bunjang synchronisieren** gespeicherter Purchase kann deshalb
bereits vollständig in Supabase vorhanden sein, während der lokale Extraction-
Cache leer, veraltet oder auf andere Bestellungen beschränkt ist.

Dann entstand trotz vorhandenem CardCargo-Einkauf:

```text
Keine passende Bestellung im lokalen Extraction-Cache gefunden.
```

## Lösung

v62 ergänzt eine zweite Quelle:

```text
URL-Import
   |
   +--> lokaler Order-Extraction-Cache
   |
   +--> bestehende CardCargo-Purchases aus Supabase
```

Die Datenbank-Suche betrachtet nur Bunjang-Einkäufe mit `bunjang_order_id`.

### Match-Signale

- identische Listing-ID: sehr stark
- identischer Titel
- identischer Verkäufer
- identischer Preis

Das Kaufdatum wird bewusst nicht als hartes Match-Signal verwendet, weil der
URL-Importer bei fehlendem Datum einen aktuelleren/default Wert enthalten kann.

## Beispiel

Bestehender CardCargo-Einkauf:

```text
Titel:      포켓몬카드 일판 ma메가팬텀
Verkäufer:  kyru0
Preis:      20.000 KRW
Kaufdatum:  23.08.2026
Order-ID:   vorhanden
```

URL-Import:

```text
Titel:      포켓몬카드 일판 ma메가팬텀
Verkäufer:  kyru0
Preis:      20.000 KRW
```

v62 zeigt diesen bestehenden Purchase automatisch in Abschnitt 3 an:

```text
Sehr wahrscheinlicher bestehender Treffer
gleicher Titel, gleicher Verkäufer, gleicher Preis

[Bstehende Einkauf verwenden]
```

## Beim Auswählen

Order-/Purchase-Daten sind für Transaktionsdaten autoritativ:

- Verkäufer
- Preis
- Kaufdatum
- Versandkosten
- Status soweit sinnvoll

Beim Speichern ergänzt der URL-Import denselben bestehenden Purchase mit:

- Listing-ID
- Listing-URL
- Canonical URL
- Listing-Titel
- Beschreibung
- Angebotsbilder
- manuelle Screenshots

Es wird kein neuer Purchase erzeugt.

## Wichtige Verbesserung gegenüber v60

v60 deduplizierte nur zuverlässig, wenn ein lokaler `selectedBunjangOrder`
vorhanden war.

v62 kann direkt einen bereits synchronisierten Purchase als `existingBunjangTarget`
verwenden. Die ursprüngliche Order-Extraction muss nicht mehr im Browser-Cache
vorhanden sein.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-server-match-v62/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine neue Supabase-Migration erforderlich.
