# CardCargo Bunjang Order Extractor – Card Discovery v65

v65 behebt die neue Bunjang-Kaufübersicht, bei der eine sichtbare Kaufkarte
nicht zwingend einen normalen `/purchases/<order-id>`-Link im DOM besitzt.

## Discovery-Stufen

### 1. Direkte Discovery

Die Extension sucht weiterhin nach:

- normalen Links;
- `data-href`, `data-url`, `data-link`;
- `/purchases/<id>` im HTML;
- React-Props / React-Fiber-Daten mit `purchaseId`, `orderId`, `purchaseNo`,
  `orderNo` oder einer `/purchases/<id>`-Route.

### 2. Gelernte Kaufkarte

Jede Kaufkarte erhält einen lokalen Fingerprint aus:

- sichtbarem Kartentext;
- Produktbild-URL;
- Auftreten bei identischen Fingerprints.

Wurde die Karte bereits früher einer Order-ID zugeordnet, kann Smart Sync
diese Zuordnung wiederverwenden, ohne die Karte nochmals öffnen zu müssen.

### 3. Automatisches Card Probe

Wenn eine Kaufkarte neu ist und keine Order-ID in DOM/React-Daten gefunden
wird:

1. Extension öffnet einen **inaktiven Hilfs-Tab** mit der Kaufübersicht.
2. Sie findet dort dieselbe Kaufkarte anhand des Fingerprints.
3. Sie klickt die Karte programmgesteuert.
4. Sobald Bunjang auf `/purchases/<order-id>` navigiert, wird die ID erfasst.
5. Die Zuordnung `card fingerprint -> order id` wird lokal gespeichert.
6. Der Hilfs-Tab geht zur Übersicht zurück und verarbeitet die nächste neue Karte.
7. Am Ende wird der Hilfs-Tab geschlossen.

Der eigentliche Bunjang-Tab des Benutzers bleibt auf der Kaufübersicht.

## Smart Sync danach

Sobald die Order-IDs bekannt sind, bleibt die v64-Logik bestehen:

- neue Orders laden;
- bekannte Orders ohne Tracking erneut laden;
- Orders mit bereits gefundenem Tracking überspringen.

Die Bestelldetailseiten werden anschließend direkt über die bereits
eingeloggte Bunjang-Sitzung geladen.

## Neue Extension-Berechtigungen

v65 ergänzt:

```json
"permissions": ["tabs"]
```

und:

```json
"host_permissions": [
  "https://order.bunjang.co.kr/*"
]
```

Diese werden benötigt, damit der automatisch erzeugte inaktive Hilfs-Tab
bedient und ausgelesen werden kann.

Die Extension exportiert weiterhin keine Cookies, Passwörter oder Login-Tokens.

## Installation

Nach dem Patch:

1. `chrome://extensions` oder `edge://extensions` öffnen.
2. `CardCargo Bunjang Order Extractor` neu laden.
3. Falls der Browser die neue Berechtigung bestätigt haben möchte, bestätigen.

## Erster Test

Auf:

`https://order.bunjang.co.kr/`

zuerst:

`Gesamte Historie erneut scannen`

verwenden.

Beim ersten Lauf kann v65 bei vielen bisher unbekannten Karten länger dauern,
weil die Order-ID für jede neue Karte einmal automatisch gelernt werden muss.

Danach ist der normale:

`Smart Sync: neu + ohne Tracking`

deutlich schneller, weil bereits gelernte Karten nicht erneut geöffnet werden.
