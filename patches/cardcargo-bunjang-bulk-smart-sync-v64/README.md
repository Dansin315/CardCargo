# CardCargo – Bunjang Bulk / Smart Sync v64

v64 baut den funktionierenden order-basierten Bunjang Extractor zu einem
historischen und inkrementellen Batch-Sync aus.

## Neuer Workflow

### Historischer Erstimport

```text
Bunjang Kaufübersicht
        ↓
Gesamte Historie erneut scannen
        ↓
automatisch scrollen
        ↓
alle Order-IDs sammeln
        ↓
Bestelldetailseiten in kleinen Chunks laden
        ↓
ein einziges Batch-JSON
        ↓
einmal in CardCargo einlesen
        ↓
alle Orders gemeinsam synchronisieren
```

### Zukünftige Syncs

```text
Smart Sync
   ↓
neue Orders
+
bekannte Orders ohne Tracking
   ↓
nur diese Detailseiten laden
   ↓
ein Batch
```

Orders, bei denen bereits eine Trackingnummer gefunden wurde, werden beim
normalen Smart Sync übersprungen.

## Lokaler Sync-Stand

Die Extension speichert unter `chrome.storage.local` nur:

- Order-ID
- Tracking gefunden: true/false
- letzter Prüfzeitpunkt
- letzter Ladefehler

Keine Cookies, Passwörter oder Authentifizierungs-Tokens.

## Wiederaufnahme

Der Status wird nach jedem kleinen Fetch-Chunk gespeichert. Dadurch muss nach
einem Abbruch nicht die gesamte Historie erneut verarbeitet werden.

## Batch-Limit

Der CardCargo-Endpunkt für Bunjang-Order-Sync akzeptiert mit v64 bis zu
500 Orders pro Batch statt bisher 200.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-bulk-smart-sync-v64/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.

## Extension neu laden

Chrome:

`chrome://extensions`

Edge:

`edge://extensions`

Bei `CardCargo Bunjang Order Extractor` auf **Neu laden** klicken.

Die Extension liegt weiterhin unter:

`tools/bunjang-order-extractor`
