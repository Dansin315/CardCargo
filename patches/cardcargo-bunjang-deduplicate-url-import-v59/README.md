# CardCargo – Bunjang URL/Order Dedup v59

Behebt den Fall:

1. Bunjang Order Extractor synchronisiert eine Bestellung und legt einen Purchase an.
2. Später wird die öffentliche Produkt-URL importiert.
3. Die Order wird im URL-Import korrekt erkannt.
4. Bisher wurde trotzdem ein zweiter Purchase erstellt.

## Neues Verhalten

Sobald im URL-Import eine Bunjang-Bestellung gewählt wurde, prüft CardCargo vor dem Speichern:

`bunjang_order_id -> existierender Purchase?`

### Falls ja

Es wird **kein neuer Purchase** erstellt. Der bestehende Purchase erhält:

- öffentliche Bunjang-Produkt-URL
- Canonical URL
- Listing-ID
- URL-/Listing-Titel
- Beschreibung, falls noch nicht vorhanden
- Verkäufer, falls noch nicht vorhanden
- Preis, falls noch nicht vorhanden
- Versandkosten, falls noch nicht vorhanden
- ausgewählte Angebotsbilder
- manuelle Listing-Screenshots

Kaufdatum, Carrier, Trackingnummer, Order-ID und ein weiter fortgeschrittener Logistikstatus aus der Order-Extraction bleiben erhalten.

### Falls nein

Der normale URL-Import legt einen neuen Purchase an und verbindet danach die gewählte Order-Extraction wie bisher.

## Schutz vor Alt-Duplikaten

Falls die Listing-ID bereits einem *anderen* Purchase gehört, erstellt v59 keinen dritten Datensatz und überschreibt nichts. Stattdessen kommt ein 409-Konflikt mit Hinweis auf das vorhandene Alt-Duplikat.

## Bilder

Die URL-Bilder werden beim Ergänzen in den bereits bestehenden privaten Purchase-Storage archiviert. `purchase_images` dedupliziert weiterhin über SHA-256.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-deduplicate-url-import-v59/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich. v59 nutzt die bereits vorhandene `bunjang_order_id`.
