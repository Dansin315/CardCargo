# CardCargo – Bunjang Enrichment v56

v56 verbindet die funktionierende Bunjang-Order-Extraction mit bestehenden CardCargo-Einkäufen **und** mit dem normalen Bunjang-URL-Import.

## 1. Bestehende Bunjang-Einkäufe ergänzen

Bei der Synchronisation werden nur fehlende Werte ergänzt:

- Bunjang-Bestellnummer (`bunjang_order_id`)
- Verkäufername
- Kaufdatum
- Warenwert, falls noch kein Preis gespeichert ist
- koreanische Versandkosten
- koreanischer Versandservice / Carrier
- Trackingnummer
- sinnvoller Produkttitel, falls der vorhandene Titel nur ein generischer Platzhalter ist

Bereits vorhandene manuell gepflegte Werte bleiben erhalten.

Wenn CardCargo bereits eine andere Trackingnummer enthält als die Extraction, wird sie **nicht** überschrieben. Der Sync meldet stattdessen den Konflikt.

Die bereits vorhandenen Bunjang-spezifischen Metadaten bleiben in `raw_metadata.bunjang_order`, darunter:

- Bestell-URL
- Bunjang-Status
- Transaktions-/Versandmethode
- Warenwert
- Versandkosten
- Gesamtbetrag
- Carrier
- Trackingnummer
- erkannte Order-Bild-URLs
- Parser-Warnungen

## 2. Bunjang URL-Import + Order-Extraction

Die letzte gültige Order-Extraction wird lokal im Browser von CardCargo gespeichert.

Im normalen `Bunjang-Einkauf importieren` erscheint ein neuer Schritt **Bunjang-Bestelldaten**.

CardCargo rankt passende Bestellungen anhand von:

1. Listing-ID, falls die Order-Seite sie preisgibt
2. Titel
3. Verkäufer
4. Preis

Die Treffer werden als `Exakter Treffer`, `Sehr wahrscheinlicher Treffer` oder `Möglicher Treffer` angezeigt.

Nach **Bestelldaten übernehmen** werden bereits vor dem normalen URL-Speichern folgende Felder ergänzt:

- Verkäufer, falls im URL-Preview nicht vorhanden
- Kaufdatum aus der echten Bunjang-Bestellung
- Warenwert, falls im URL-Preview nicht vorhanden
- koreanische Versandkosten
- Status `Versand in Korea`, falls eine Trackingnummer existiert

Nach dem erfolgreichen URL-Import ruft CardCargo einen separaten Enrichment-Endpunkt auf. Dieser speichert zusätzlich:

- `bunjang_order_id`
- Carrier
- Trackingnummer
- vollständige Bunjang-Order-Metadaten

Bei einer eindeutigen Tracking-Übereinstimmung wird anschließend direkt das passende OLAEET-Paket zugeordnet.

Damit teilen sich die Quellen sinnvoll die Verantwortung:

### Bunjang URL-Import

- Listing-ID
- Listing-URL
- Titel/Beschreibung
- Verkäufer
- Preis
- Angebotsbilder im privaten Storage

### Bunjang Order Extractor

- Bestellnummer
- tatsächliches Kaufdatum
- Versandkosten
- Carrier
- Trackingnummer
- Bunjang-Bestellstatus
- Gesamtbetrag
- Versandmethode

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-enrichment-v56/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine neue Supabase-Migration erforderlich. v56 setzt voraus, dass die Migrationen für `domestic_carrier`, `domestic_tracking_number` und `bunjang_order_id` bereits in Supabase ausgeführt wurden.
