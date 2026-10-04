# CardCargo – Bunjang Card Discovery v65

Behebt die Bunjang-Kaufübersicht, auf der sichtbare Purchase-Karten clientseitig
klickbar sind, aber keine `/purchases/<order-id>`-Links im DOM enthalten.

## Funktionsweise

```text
Kaufübersicht
    |
    +-- direkter Link / React-Daten vorhanden?
    |       -> Order-ID direkt
    |
    +-- Karte bereits früher gelernt?
    |       -> lokale cardMap -> Order-ID
    |
    +-- neue unbekannte Karte
            -> inaktiver Hilfs-Tab
            -> Karte automatisch anklicken
            -> Ziel-URL /purchases/<order-id> erfassen
            -> Zuordnung lokal merken
```

Danach läuft der Smart Sync wie bisher:

```text
Order-ID bekannt
    |
    +-- Tracking bereits gefunden -> überspringen
    |
    +-- neu / ohne Tracking -> Detailseite laden
                              -> Batch JSON
                              -> CardCargo
```

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-card-discovery-v65/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.

## Extension danach neu laden

Chrome:

`chrome://extensions`

Edge:

`edge://extensions`

Bei `CardCargo Bunjang Order Extractor` auf **Neu laden** klicken.

Da v65 die Berechtigungen `tabs` und den Hostzugriff für
`https://order.bunjang.co.kr/*` ergänzt, kann der Browser einmalig nach einer
Bestätigung fragen.

## Erster Lauf

Für den ersten v65-Test:

`Gesamte Historie erneut scannen`

Beim ersten Lauf kann das automatische Lernen vieler Kaufkarten einige Zeit
beanspruchen. Die Zuordnungen werden gespeichert; spätere Smart-Syncs müssen
bekannte Karten nicht erneut anklicken.
