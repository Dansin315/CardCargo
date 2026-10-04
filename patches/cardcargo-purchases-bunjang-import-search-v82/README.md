# CardCargo v82 – Bunjang Import + Einkaufssuche

## 1. Ein Bunjang-Einstieg auf der Einkäufe-Seite

Die bisherigen getrennten Aktionen werden durch einen einzigen primären Button
ersetzt:

```text
Bunjang Einkäufe importieren
```

Er führt direkt zu:

```text
/purchases/bunjang-import
```

Der alte zusätzliche Button `Bunjang Bestellungen synchronisieren` auf der
Einkäufe-Seite entfällt. Explizite Legacy-Links mit dem Text `Bunjang URL`
bzw. `Bunjang-URL` werden ebenfalls auf den neuen Import umgestellt.

Der eigentliche alte URL-Importer wird nicht aus dem Code gelöscht; er ist
weiterhin die interne Listing-Import-Engine des kombinierten Bunjang-Imports.

## 2. Der Options-Abschnitt aus Schritt 3 entfällt

Der komplette Abschnitt `3. Übrige Bestellungen synchronisieren` inklusive
Checkboxen wird entfernt.

Die bisherigen Einstellungen sind jetzt feste Standardwerte:

```text
Bunjang-Listing automatisch ergänzen                 = true
Nicht bestätigte Matches nicht automatisch zuordnen = true
Fehlende Einkäufe automatisch anlegen                = true
Exakte Tracking-Treffer automatisch OLAEET zuordnen  = true
```

Der Import-Button befindet sich direkt in der Kopfzeile von Schritt 2 neben
Gesamtansicht / Matchansicht / Abgleich aktualisieren:

```text
Einkäufe importieren (N offen)
```

Damit gibt es keinen zusätzlichen langen Konfigurationsabschnitt mehr.

## 3. Neue Einkaufssuche

Die Filterleiste der Einkaufsliste besitzt jetzt:

```text
Suche
[ Name, Einzelkarte oder Trackingnummer ]
```

Die Suche arbeitet serverseitig über alle Einkäufe, nicht nur über die
aktuelle 10er-Seite.

Sie durchsucht:

- Einkaufstitel;
- Beschreibung;
- Verkäufer;
- Trackingnummer;
- Carrier;
- Listing-ID;
- Bunjang-Order-ID;
- Listing-/Canonical-URL;
- `raw_metadata`;
- alle Text-/Metadatenfelder der zugeordneten `purchase_items`.

Der letzte Punkt ist absichtlich schemaunabhängig implementiert: CardCargo hat
die Felder einzelner Karten im Laufe der Entwicklung erweitert. v82 liest die
für den Benutzer sichtbaren `purchase_items` und durchsucht deren Text- und
JSON-Felder rekursiv. Damit funktioniert die Suche auch für hinzugefügte
Einzelkarten, ohne auf nur einen historischen Spaltennamen angewiesen zu sein.

Status- und Datumsfilter können gleichzeitig mit der Suche verwendet werden.
Sortierung und Pagination bleiben erhalten.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-purchases-bunjang-import-search-v82/apply.sh" \
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
