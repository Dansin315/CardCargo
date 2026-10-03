# CardCargo Bunjang Order Extractor – Bulk/Smart Sync v64

Die Extension arbeitet weiterhin ausschließlich auf der bereits eingeloggten
Bunjang-Kaufseite und exportiert keine Cookies, Passwörter oder Session-Tokens.

## Neu in v64

### Smart Sync

`Smart Sync: neu + ohne Tracking`

1. scrollt die Bunjang-Kaufübersicht automatisch bis keine neuen Order-Links mehr erscheinen;
2. sammelt alle `/purchases/<order-id>`-Bestellungen;
3. vergleicht sie mit einem lokalen Extension-Sync-Stand;
4. lädt nur:
   - neue Bestellungen;
   - bekannte Bestellungen, bei denen bislang keine Trackingnummer gefunden wurde;
5. speichert pro Order lokal lediglich:
   - Order-ID;
   - Tracking gefunden: ja/nein;
   - letzter Prüfzeitpunkt;
   - letzter Ladefehler;
6. kopiert alle aktuell geprüften Bestellungen in **einem einzigen JSON-Batch**.

### Gesamte Historie erneut scannen

Ignoriert den lokalen Sync-Stand und lädt alle gefundenen Order-Detailseiten neu.

Das ist sinnvoll für:

- den ersten historischen Import;
- Parser-Änderungen;
- eine manuelle Komplettkontrolle.

### Automatisches Scrollen

Die Extension scrollt die Bunjang-Kaufübersicht automatisch nach unten und
versucht auch sichtbare `더보기`/`Load more`-Buttons auszulösen.

Sie stoppt, sobald mehrere Scroll-Runden keine neuen Bestelllinks mehr erzeugen.

### Fortschritt und Wiederaufnahme

Der lokale Sync-Stand wird bereits während des Batch-Laufs nach jedem kleinen
Chunk gespeichert.

Wenn der Browser oder die Extension während eines großen historischen Imports
abbricht, kann ein späterer Smart Sync dort sinnvoll weitermachen:

- Orders mit bereits gefundenem Tracking werden übersprungen;
- Orders ohne Tracking werden erneut geprüft;
- nicht verarbeitete Orders gelten weiterhin als neu.

## Installation / Reload

Da die Extension bereits unter demselben Ordner liegt:

`tools/bunjang-order-extractor`

muss sie nach dem Patch in Chrome/Edge normalerweise nur neu geladen werden.

Chrome:

`chrome://extensions`

Edge:

`edge://extensions`

Dann bei `CardCargo Bunjang Order Extractor` auf **Neu laden** klicken.

## Empfohlener erster Lauf

1. `https://order.bunjang.co.kr/` öffnen.
2. Extension öffnen.
3. `Gesamte Historie erneut scannen`.
4. Warten bis der Batch fertig ist.
5. CardCargo öffnen:
   `Einkäufe -> Bunjang Bestellungen synchronisieren`.
6. Einmal `Aus Zwischenablage einlesen`.
7. Alle Bestellungen gemeinsam synchronisieren.

## Zukünftige Läufe

Danach normalerweise nur:

1. Bunjang-Kaufübersicht öffnen.
2. `Smart Sync: neu + ohne Tracking`.
3. CardCargo -> Bunjang Bestellungen synchronisieren.
4. einmal Zwischenablage einlesen und Batch synchronisieren.

Bestellungen, für die bereits eine Trackingnummer gefunden wurde, werden nicht
unnötig erneut geladen.
