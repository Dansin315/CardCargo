# CardCargo

Private Single-User-PWA für Bunjang-Einkäufe, archivierte Angebotsbilder und den späteren Ausbau um OLAEET-Pakete, internationale Sendungen und Pokémon-Karten-Inventar.

## Aktueller Stand

Das Repository enthält ein ausführbares MVP-Grundgerüst mit:

- Next.js App Router, TypeScript und responsiver PWA-Oberfläche
- Supabase E-Mail-/Passwort-Authentifizierung für ein freigeschaltetes Konto
- PostgreSQL-Datenmodell mit Row Level Security
- privatem Supabase-Storage-Bucket für Angebotsbilder
- zweistufigem Bunjang-Import: URL-Vorschau → geprüfter Speichervorgang
- automatischer Extraktion lesbarer Titel-, Preis-, Verkäufer- und Bildmetadaten
- manuellem Screenshot-/Bild-Upload, falls Bunjang keine verwertbaren Metadaten liefert
- serverseitiger Prüfung der tatsächlichen Bilddatei
- Einkaufsliste, Dashboard und Detailseite mit privater Bildergalerie
- PWA-Manifest, Service Worker und neutraler Offline-Seite
- vorbereiteten Tabellen für OLAEET, Sendungen, Inventar, Marktbeobachtung und Alerts

Die wichtigste V1-Regel ist im Code erzwungen:

> Ein Einkauf bleibt nur gespeichert, wenn mindestens ein gültiges Angebotsbild erfolgreich in den privaten Storage übernommen wurde.

Siehe auch [`docs/V1_SCOPE.md`](docs/V1_SCOPE.md) und [`VALIDATION.md`](VALIDATION.md).

## Architektur

```text
Browser / installierte PWA
  │
  ├── Supabase Auth: Single-User-Login
  ├── direkter Upload: nur <user-id>/staging/...
  │
  └── Next.js Route Handler
        ├── Session-, Owner- und Origin-Prüfung
        ├── Bunjang-URL-Allowlist
        ├── abgesicherter HTTPS-Abruf
        ├── Metadaten- und Bildextraktion
        ├── Dateisignatur-, Größen- und Duplikatprüfung
        ├── finaler privater Storage-Pfad
        └── PostgreSQL-Datensatz und Bildzuordnung

Supabase
  ├── Auth
  ├── PostgreSQL + RLS
  └── privater Bucket listing-images
```

Der Browser erhält niemals den Supabase-Secret-Key. Er darf per Storage-RLS nur temporäre Dateien in seinem eigenen `staging`-Ordner anlegen und entfernen. Finale Bildpfade werden ausschließlich durch den serverseitigen Client geschrieben.

## Voraussetzungen

- Node.js 20.18.1 oder neuer; Node.js 22 ist für Deployment eine gute Wahl
- npm
- ein Supabase-Projekt
- optional ein Vercel-, Netlify- oder eigener Node.js-Host für den Produktivbetrieb

Für Version 1 ist **kein Bunjang-API-Vertrag** erforderlich. Die automatische Vorschau liest nur öffentlich ausgelieferte Metadaten. Da Plattformseiten dynamisch sein oder Serverabrufe blockieren können, bleibt der manuelle Screenshot-Upload ein absichtlicher Bestandteil des Workflows.

## 1. Supabase-Projekt vorbereiten

### 1.1 Projekt anlegen

Lege ein neues Supabase-Projekt an und notiere:

- Project URL
- Publishable Key
- Secret Key

Der Secret Key gehört ausschließlich in die serverseitige Umgebungsvariable `SUPABASE_SECRET_KEY`.

### 1.2 Datenbankschema ausführen

Öffne den SQL Editor des Projekts und führe den vollständigen Inhalt von

```text
supabase/migrations/0001_initial.sql
```

aus.

Die Migration legt unter anderem an:

- `app_owners`
- `purchases`
- `purchase_images`
- `purchase_items`
- `warehouse_packages`
- `shipments`
- `inventory_units`
- `watch_rules`, `market_listings` und `alerts`
- den privaten Bucket `listing-images`
- RLS-Regeln für Datenbank und Storage

### 1.3 Single-User-Konto anlegen

Lege im Supabase-Dashboard unter Authentication → Users genau das Konto an, das die App verwenden soll. Verwende eine E-Mail-Adresse und ein starkes Passwort. Öffentliche Registrierung wird in dieser App nicht angeboten und sollte auch in Supabase nicht freigeschaltet werden.

### 1.4 App-Owner eintragen

Öffne `supabase/seed.sql`, ersetze:

```sql
you@example.com
```

mit derselben E-Mail-Adresse und führe den Block im SQL Editor aus. Der Block bricht mit einer verständlichen Fehlermeldung ab, falls der Auth-Benutzer noch nicht existiert.

## 2. Lokale Konfiguration

```bash
cp .env.example .env.local
```

Trage anschließend die Werte ein:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME
ALLOWED_USER_EMAIL=deine-adresse@example.com
NEXT_PUBLIC_APP_NAME=CardCargo
```

`ALLOWED_USER_EMAIL` muss exakt dem Supabase-Auth-Konto und dem Eintrag in `app_owners` entsprechen. Die App verhält sich absichtlich „fail closed“: Fehlt die Variable, wird kein Benutzer freigeschaltet.

## 3. Anwendung starten

```bash
npm install
npm run dev
```

Beim ersten `npm install` wird `package-lock.json` erzeugt. Nimm diese Datei anschließend in dein privates Git-Repository auf, damit spätere Installationen reproduzierbar mit `npm ci` laufen.

Öffne danach die lokale Next.js-Adresse im Browser und melde dich mit dem zuvor angelegten Supabase-Konto an.

Für eine produktionsnahe lokale Prüfung:

```bash
npm run build
npm start
```

Der Service Worker wird nur im Produktionsmodus registriert. Private Datensätze, API-Antworten und Angebotsbilder werden nicht offline zwischengespeichert.

## 4. Ersten Einkauf importieren

1. Öffne **URL importieren**.
2. Füge eine öffentliche Bunjang- oder Global-Bunjang-Produkt-URL ein.
3. Lade die Vorschau.
4. Prüfe Titel, Verkäufer, Preis, Datum und Status.
5. Wähle automatisch erkannte Angebotsbilder aus.
6. Ergänze bei Bedarf Screenshots oder gespeicherte Bilddateien.
7. Speichere den Einkauf.

Beim Speichern passiert Folgendes:

- Remote-Bilder werden serverseitig erneut abgerufen.
- Manuelle Uploads werden aus dem privaten Staging-Ordner gelesen.
- JPEG, PNG, WebP und GIF werden anhand ihrer Dateisignatur validiert.
- Dateien über 6 MB werden abgelehnt.
- Doppelte Bilder werden über SHA-256 erkannt.
- Bis zu acht Bilder werden in einen privaten, einkaufsspezifischen Pfad übernommen.
- Erst danach werden die Bildmetadaten dauerhaft mit dem Einkauf verknüpft.
- Ist kein Bild erfolgreich, wird der vorläufige Einkauf wieder gelöscht.

## Unterstützte Bunjang-Hosts

Version 1 erlaubt ausschließlich:

- `bunjang.co.kr` und Subdomains
- `globalbunjang.com` und Subdomains

Lookalike-Domains, URL-Zugangsdaten, Nicht-HTTPS-Ziele und Nichtstandard-Ports werden blockiert. Bildabrufe prüfen außerdem DNS-Ziele und Weiterleitungen, um Zugriffe auf private oder reservierte Netzwerkadressen zu verhindern.

## Bildgrenzen

| Regel | Wert |
|---|---:|
| Bilder je Einkauf | maximal 8 |
| Dateigröße | maximal 6 MB je Bild |
| Formate | JPEG, PNG, WebP, GIF |
| Storage | privat |
| Vorschau-Links | kurzlebige signierte URLs |

## Tests und Qualitätsprüfung

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Oder zusammengefasst:

```bash
npm run check
```

Die Tests decken derzeit insbesondere ab:

- offizielle und nachgeahmte Bunjang-Hosts
- HTTPS-Normalisierung und Entfernung von URL-Fragmenten
- Blockierung von Zugangsdaten, Sonderports und direkten IP-Zielen
- Datumsformat einschließlich unmöglicher Kalendertage
- maximale Gesamtzahl der Angebotsbilder
- JPEG-/PNG-Dateisignaturen und Größenlimits
- Same-Origin-Prüfung schreibender API-Anfragen

## Deployment auf Vercel

1. Repository in ein privates Git-Repository übertragen.
2. Projekt in Vercel importieren.
3. Node.js 22 als Runtime auswählen.
4. Alle fünf Umgebungsvariablen aus `.env.local` in Vercel setzen.
5. Deployment ausführen.
6. Nach dem ersten Deployment Login, URL-Vorschau, manuellen Upload und private Bildanzeige testen.

Der Secret Key darf nicht als öffentliche Variable angelegt und nicht in Git gespeichert werden. Bei einem Schlüssel-Leak muss er sofort in Supabase rotiert werden.

## Datenmodell für die nächsten Module

Die Migration enthält bereits die Beziehungen für den späteren Prozess:

```text
purchases
  └── purchase_items

purchases
  └── warehouse_package_purchases
        └── warehouse_packages
              └── shipment_packages
                    └── shipments

purchase_items
  └── inventory_units
```

Damit lassen sich im nächsten Ausbauschritt mehrere Bunjang-Einkäufe einem OLAEET-Paket, mehrere Pakete einer internationalen Sendung und die enthaltenen Karten dem endgültigen Inventar zuordnen.

## Bewusste Grenzen des MVP

- Die App kauft keine Angebote automatisch.
- Sie speichert keine Bunjang- oder OLAEET-Passwörter.
- Sie umgeht keine Captchas und verwendet keine privaten App-Endpunkte.
- Eine Bunjang-Seite kann Metadaten oder Bilder vor Serverabrufen verbergen; dann wird manuell ergänzt.
- Verwaiste Staging-Dateien nach einem abgebrochenen Browser-Upload werden noch nicht zeitgesteuert bereinigt.
- Preisbeobachtung, Telegram/E-Mail-Alerts und OLAEET-Import sind im Schema vorbereitet, aber noch nicht Teil der Oberfläche.

## Projektstruktur

```text
app/
  (app)/                  geschützte Seiten
  api/import/preview/     sichere Bunjang-Vorschau
  api/purchases/          Einkauf- und Bildarchivierung
components/               UI-Komponenten
lib/
  importer/               URL-, HTML- und Bildverarbeitung
  supabase/               Browser-, Server-, Admin- und Proxy-Clients
public/                    PWA-Icons und Service Worker
supabase/
  migrations/             Datenbank, RLS und Storage
  seed.sql                 Single-User-Owner-Zuordnung
tests/                     URL- und Schema-Tests
docs/V1_SCOPE.md           verbindliche V1-Abnahmekriterien
SECURITY.md                Sicherheitsmodell
```

## Empfohlene nächste Umsetzung

Nach einem erfolgreichen lokalen End-to-End-Test sollte als nächstes das **OLAEET-Paketmodul** entstehen: Paket anlegen/importieren, koreanische Trackingnummer zuordnen, mehrere Einkäufe einem Paket hinzufügen und Status/Abmessungen protokollieren. Dadurch wird die bereits angelegte Prozesskette vom Einkauf bis zur internationalen Sendung erstmals vollständig sichtbar.
