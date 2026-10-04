# CardCargo v84 – OLAEET internationale Sendungen aus Extraction

## Änderungen

### Navigation

Der Navigationseintrag **URL Importieren** wird entfernt. Der interne Bunjang-Listing-Importer bleibt bestehen, weil der kombinierte Bunjang-Import ihn weiterhin verwendet.

### OLAEET Extractor v2

Der Extractor erkennt ein geöffnetes OLAEET-Shipping-Popup anhand der `SHP-...` ID und kopiert strukturiertes JSON.

Aus den bereitgestellten OLAEET-Ansichten werden erfasst:

- Shipment-ID
- Status
- Created At
- Completed At
- Courier
- internationale Trackingnummer
- Payment Transaction ID
- Shipping Amount
- Shipping Fee
- Additional Fee
- Insurance Fee
- Total Payment
- Währung
- Name / Address Line 1 / City / Country / Zip Code / Contact
- alle enthaltenen `STR-...` Paket-IDs
- Domestic Tracking der enthaltenen Pakete
- Item-Kategorie und maskierter Empfänger, soweit sichtbar
- Box Size W×H×L
- Real Weight
- Volume Weight
- Quote Weight
- sichtbarer OLAEET-Rohtext zur Diagnose

Auf der normalen OLAEET-Warehouse-Seite bleibt die bisherige Paket-Extraction kompatibel.

### CardCargo – Internationale Sendungen

Die bestehende Ansicht **Internationale Sendungen erfassen** wird zu **Internationale Sendungen importieren**.

Die manuelle Form bleibt nur als Fallback vorhanden und ist standardmäßig ausgeblendet.

Der neue Standardablauf ist:

```text
OLAEET Shipping öffnen
→ OLAEET Extractor
→ JSON in Zwischenablage
→ CardCargo / Sendungen
→ „OLAEET-Extraction importieren & speichern“
→ Sendungsfelder automatisch füllen
→ STR-Pakete automatisch auswählen
→ bestehendes CardCargo-Formular automatisch absenden
```

Damit wird die vorhandene CardCargo-Speicherlogik weiterverwendet. Der Patch ersetzt nicht die bestehende Datenbankstruktur der Sendungen und benötigt daher keine Migration.

Die Paketzuordnung erfolgt über die `STR-...` IDs aus dem OLAEET-Items-Bereich. Nur Pakete, die bereits als OLAEET-Pakete in CardCargo existieren, können automatisch ausgewählt werden.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-extraction-v84/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

Anschließend die lokale OLAEET-Extension neu laden.
