# CardCargo – Bunjang Order + Listing Sync v80

v80 verbindet die Bunjang-Order-Extraction mit dem bestehenden CardCargo
Bunjang-URL-Importer.

## Neuer Ablauf

```text
Bunjang Kaufübersicht
        ↓
Extractor
        ↓
Order-Daten + productUrls
        ↓
CardCargo Bunjang Sync
        ↓
Purchase bestimmen / Match bestätigen
        ↓
Order-Daten speichern
        ↓
Listing automatisch über denselben previewBunjangListing-Parser laden
        ↓
Titel + Beschreibung + Listing-ID + URL + Bilder ergänzen
```

Du musst die einzelnen Bunjang-Produktseiten nicht mehr manuell öffnen und
anschließend noch einmal im URL-Import einfügen.

## Autorität der Daten

Order bleibt maßgeblich für:

- tatsächlichen Warenwert
- Versandkosten
- Kaufdatum / Bestellzeitpunkt
- Carrier
- Trackingnummer
- Order-ID

Listing bleibt maßgeblich für:

- Listing-ID
- Listing-URL / Canonical URL
- sichtbaren Produkttitel
- Beschreibung
- Angebotsbilder

Der automatische Listing-Sync überschreibt deshalb niemals Order-Preis,
Order-Versand, Kaufdatum oder Tracking.

## Bereits gespeicherte Order-IDs

Orders, die bereits über ihre Bunjang-ID in CardCargo gespeichert sind, bleiben
wie bisher aus der normalen Sync-Liste ausgeblendet.

Beim Klick auf `Order + Listing synchronisieren` werden sie aber im Hintergrund
auf fehlende Listing-Daten geprüft.

Wenn Beschreibung/Bilder bereits vollständig importiert wurden, antwortet der
Server mit `already-complete` und führt keinen erneuten Bunjang-Abruf aus.

Dadurch können alte Orders nachträglich Beschreibung/Bilder erhalten, ohne
noch einmal als neuer Einkauf aufzutauchen.

## Matchansicht

Beim Klick auf `Match speichern` passiert jetzt automatisch:

```text
1. Bunjang-Order dem gewählten Purchase zuordnen
2. productUrl aus der Extraction nehmen
3. Listing über CardCargos bestehenden Bunjang-Parser laden
4. Beschreibung / Listing-ID / URL ergänzen
5. Listing-Bilder archivieren
6. Order aus der Matchansicht entfernen
```

Ein Fehler im Listing-Abruf macht den bestätigten Order-Match nicht rückgängig.
Die UI zeigt dann an, dass nur die Listing-Anreicherung fehlgeschlagen ist.

## Zusammengefasste Einkäufe

Für einen Gruppen-Purchase:

```text
Order A -> Listing A \
Order B -> Listing B  ---> ein CardCargo Purchase
Order C -> Listing C /
```

werden die Listing-Daten pro Order in

```text
raw_metadata.bunjang_orders[]
```

gespeichert.

Zusätzlich wird `raw_metadata.grouped_listings[]` aktualisiert, damit die schon
vorhandene Gruppen-Detailansicht die einzelnen Originalangebote anzeigen kann.

Der aggregierte Purchase-Titel/Preis/Versand/Tracking wird dabei nicht mit
einem einzelnen Listing oder einer einzelnen Order überschrieben.

## Bilder

Der neue Endpoint verwendet dieselben vorhandenen CardCargo-Bausteine wie der
manuelle URL-Import:

- `previewBunjangListing()`
- `downloadListingImage()`
- `archivePurchaseImages()`

Die Bilder werden also in CardCargo archiviert und nicht nur als externe
Bunjang-URLs gespeichert.

## UI

Unter der Bunjang-Synchronisierung ist standardmäßig aktiviert:

```text
[x] Bunjang-Listing automatisch ergänzen
```

Falls du ausnahmsweise nur Order-Daten synchronisieren willst, kannst du die
Option abschalten.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-order-listing-sync-v80/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
