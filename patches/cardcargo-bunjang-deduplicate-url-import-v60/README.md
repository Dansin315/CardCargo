# CardCargo – Bunjang URL/Order Dedup Repair v60

v60 repariert den teilweise ausgeführten v59-Patch.

## Ursache des v59-Fehlers

v59 suchte im ausgewählten Order-Panel exakt nach:

```tsx
<span>Bestellnummer {selectedBunjangOrder.orderId}</span>
```

Die tatsächlich von v56 erzeugte CardCargo-Oberfläche verwendet jedoch:

```tsx
<div>Bestellnummer {selectedBunjangOrder.orderId}</div>
```

v60 erkennt beide Varianten und hängt sich nicht mehr an einen einzelnen HTML-Tag.

## Zielverhalten

Wenn bereits durch den Bunjang Order Sync ein Purchase mit:

```text
bunjang_order_id = 99912750
```

existiert und später im URL-Import genau diese Bestellung gewählt wird:

```text
URL-Import
  -> Order #99912750 gewählt
  -> vor dem Speichern DB-Prüfung
  -> Purchase existiert
  -> UPDATE / Enrichment
```

Es wird **kein zweiter Purchase angelegt**.

Der bestehende Purchase erhält stattdessen:

- Bunjang Listing-ID
- Listing URL / Canonical URL
- Listing-Titel
- Beschreibung
- Verkäufer/Preis nur soweit sinnvoll
- ausgewählte Remote-Angebotsbilder
- manuelle Bilder/Screenshots
- Listing-Metadaten

Order-Daten wie Kaufdatum, Carrier, Tracking und bestehender fortgeschrittener Status bleiben erhalten.

## Sicherheitsprüfung direkt vor dem Speichern

Auch wenn die UI beim Auswählen noch keinen bestehenden Einkauf gefunden hatte, fragt v60
die `bunjang_order_id` unmittelbar vor dem Speichern erneut ab. Damit wird ein Race zwischen
Order-Sync und URL-Import vermieden.

## Teilweise ausgeführtes v59

v59 hat bei dir bereits diese zwei Dateien kopiert:

- `app/api/purchases/bunjang-order-target/route.ts`
- `app/api/purchases/[id]/bunjang-listing-enrichment/route.ts`

v60 überschreibt sie bewusst erneut mit der korrekten Version und ist daher direkt auf deinem
aktuellen Stand anwendbar. v59 muss nicht zurückgesetzt werden.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-deduplicate-url-import-v60/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine neue Supabase-Migration erforderlich.
