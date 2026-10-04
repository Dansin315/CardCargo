# CardCargo – Bunjang Match Panel + Undo v63

## Änderungen

### Match innerhalb von Schritt 3

Die serverseitig gefundenen bestehenden CardCargo-Bunjang-Einkäufe werden
jetzt direkt innerhalb des Panels:

```text
3. Bunjang-Bestelldaten
```

angezeigt und nicht mehr unterhalb des Panels.

### Auswahl rückgängig

Vorher zeigte ein ausgewählter bestehender Einkauf:

```text
[ Wird ergänzt ]
```

Der Button war passiv und konnte die Auswahl nicht entfernen.

v63 zeigt stattdessen:

```text
[ Auswahl rückgängig ]
```

Beim Klick werden:

- `existingBunjangTarget`
- `selectedBunjangOrder`

zurückgesetzt.

Der bestehende Einkauf wird damit beim Speichern nicht mehr als Ziel für das
Listing-Enrichment verwendet.

Die bereits geladenen URL-/Listing-Daten bleiben im Formular erhalten.

### Hinweis zum lokalen Cache

Der Text bei fehlendem lokalen Extraction-Match erklärt jetzt ausdrücklich,
dass zusätzlich bestehende CardCargo-Bestellungen aus der Datenbank darunter
geprüft werden.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-match-panel-undo-v63/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
