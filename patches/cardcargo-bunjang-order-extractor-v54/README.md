# CardCargo – Bunjang Order Extractor v54

v54 ersetzt v53 vollständig.

## Warum v53 entfernt wurde

v53 versuchte Kauf-/Trackingdaten aus Produktlinks und deren DOM-Umgebung zu erraten.
Die tatsächliche Bunjang-Struktur ist order-basiert:

- Kaufübersicht: Datum/Status/Preis/Titel/Verkäufer
- Bestelldetail `/purchases/<order-id>`:
  - Bestellnummer
  - tatsächlicher Bestellzeitpunkt
  - Verkäufer
  - Warenwert
  - Versandkosten
  - Transaktionsmethode
  - Carrier
  - Trackingnummer

v54 verwendet deshalb `bunjang_order_id` als dauerhafte Bestellidentität.

## Anwendung

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-order-extractor-v54/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach die erzeugte `*_bunjang_order_id.sql`-Migration im Supabase SQL Editor ausführen und
die Version mit `npx supabase migration repair <VERSION> --status applied` markieren.

Dann:

```bash
npm run typecheck
npm run lint
npm run build
```

## Extension

Ordner:

`tools/bunjang-order-extractor`

Die Extension auf `https://order.bunjang.co.kr/` verwenden. Sie sucht die geladenen
`/purchases/<Bestellnummer>`-Links und lädt diese Detailseiten automatisch mit der vorhandenen
Browser-Session.

Anschließend in CardCargo:

`Einkäufe -> Bunjang Bestellungen synchronisieren -> Aus Zwischenablage einlesen`
