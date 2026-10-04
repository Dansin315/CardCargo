# CardCargo – Internationale OLAEET-Sendungen v11

Dieser Patch ergänzt das Modul für ausgehende internationale Sendungen von OLAEET nach Deutschland.

## Funktionen

- internationale Sendungen anlegen, anzeigen, bearbeiten und löschen
- mehrere OLAEET-Lagerpakete zu einer Sendung zusammenfassen
- jedes OLAEET-Paket gleichzeitig höchstens einer Sendung zuordnen
- entfernte Paketzuordnungen automatisch wieder für andere Sendungen freigeben
- Auswahl folgender Versanddienste:
  - FedEx Priority
  - FedEx Economy
  - FedEx Connect
  - FedEx Express
  - EMS
  - EMS Premium
  - K-Packet
  - Air Mail
  - Ocean Transport
  - Sonstiger Versanddienst
- OLAEET-Sendungs-ID und internationale Trackingnummer speichern
- Sendungsstatus verwalten
- Versanddatum, erwartetes Lieferdatum und tatsächliches Lieferdatum speichern
- Gesamtgewicht erfassen oder aus den ausgewählten Paketgewichten übernehmen
- internationale Versandkosten, OLAEET-Servicegebühren sowie Zoll- und Einfuhrkosten dokumentieren
- Sendungen nach Status filtern
- auf der OLAEET-Paketdetailseite die zugehörige Sendung anzeigen
- nicht zugeordnete OLAEET-Pakete direkt einer neuen Sendung hinzufügen

## Voraussetzungen

Der Patch erwartet CardCargo bis einschließlich v10. Insbesondere müssen vorhanden sein:

- `supabase/migrations/0006_purchase_image_categories.sql`
- das OLAEET-Paketmodul
- Node.js 22

Es werden keine neuen npm-Pakete benötigt.

## Installation

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash "$HOME/CardCargo/patches/cardcargo-international-shipments-v11/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Das Skript sichert ersetzte Dateien vorher unter `/tmp/cardcargo-shipments-v11-backup-...`.

## Supabase-Migration

Anschließend den vollständigen Inhalt dieser Datei im Supabase SQL Editor ausführen:

```text
supabase/migrations/0007_international_shipments.sql
```

Die Migration ergänzt:

- `shipments.shipping_service`
- `shipments.total_weight_grams`
- Prüfbedingungen für Versanddienst, Gewicht und Kosten
- Indizes für Status, Trackingnummer und OLAEET-Sendungs-ID
- eine Unique-Regel, sodass ein OLAEET-Paket höchstens einer Sendung angehört
- die RPC-Funktion `replace_shipment_packages`
- einen PostgREST-Schema-Reload

### Bestehende Mehrfachzuweisungen prüfen

Die Migration stoppt absichtlich, wenn ein OLAEET-Paket schon mehreren Sendungen zugeordnet ist. Vorab kann dies geprüft werden:

```sql
select
  warehouse_package_id,
  array_agg(shipment_id order by shipment_id) as shipment_ids,
  count(*) as assignment_count
from public.shipment_packages
group by user_id, warehouse_package_id
having count(*) > 1;
```

Wenn keine Zeile erscheint, bestehen keine Konflikte.

## Lokale Prüfung

```bash
cd "$HOME/CardCargo/poketracker-pwa"
nvm use 22
rm -rf .next
rm -f tsconfig.tsbuildinfo

npm run typecheck
npm run lint
npm run test
npm run build
```

Danach:

```bash
npm run dev
```

Das Modul ist unter folgender Adresse erreichbar:

```text
http://localhost:3000/shipments
```

## Empfohlener Funktionstest

1. Mindestens zwei OLAEET-Pakete anlegen.
2. Eine neue internationale Sendung erstellen.
3. Beide Pakete auswählen.
4. Versanddienst, Trackingnummer, Daten, Gewicht und Kosten eintragen.
5. Sendung speichern.
6. Prüfen, dass beide OLAEET-Pakete auf die Sendung verlinken.
7. Eine weitere neue Sendung öffnen und prüfen, dass die beiden Pakete nicht auswählbar sind.
8. Die erste Sendung bearbeiten und eines der Pakete entfernen.
9. Prüfen, dass das entfernte Paket wieder bei einer neuen Sendung auswählbar ist.
10. Die Sendung löschen und prüfen, dass alle enthaltenen OLAEET-Pakete erhalten bleiben und wieder auswählbar sind.

## Bewusste Abgrenzung

Dieser Patch verteilt internationale Versand- und Einfuhrkosten noch nicht auf einzelne Einkäufe oder Karten. Diese Kostenverteilung ist der nächste fachliche Ausbauschritt.

Sendungsbilder, Tracking-Abfragen bei Versanddienstleistern und automatische Benachrichtigungen sind ebenfalls noch nicht Bestandteil dieses Moduls.
