# Version 1 – verbindlicher Umfang

## Primäres Ziel

Eine private Single-User-PWA verwaltet Bunjang-Einkäufe. Sie basiert auf Next.js, TypeScript, Supabase Auth, PostgreSQL und einem privaten Supabase-Storage-Bucket.

## Abnahmekriterium V1-01: URL-Import mit Angebotsbildern

Beim Einfügen einer Bunjang-URL muss die App:

1. die URL validieren und speichern,
2. lesbare Angebotsmetadaten als bearbeitbare Vorschau anzeigen,
3. gefundene Angebotsbilder zur Auswahl anbieten,
4. einen manuellen Screenshot-/Datei-Upload als zuverlässigen Fallback anbieten,
5. ausgewählte Bilder als private Kopien in Supabase Storage archivieren,
6. die Bilddateien dem Einkauf dauerhaft zuordnen.

**Harte Regel:** Ein Einkauf darf nicht bestehen bleiben, wenn kein gültiges Angebotsbild erfolgreich archiviert wurde. Die API löscht den vorläufigen Einkaufsdatensatz in diesem Fall wieder.

## Weitere V1-Funktionen

- E-Mail-/Passwort-Anmeldung für genau ein freigeschaltetes Konto
- Datenbank-Allowlist über `app_owners`
- Einkaufsliste und Dashboard
- Einkaufsdetailseite mit privater Bildergalerie
- PWA-Manifest, installierbare App-Hülle und sichere Offline-Seite
- vorbereitete Tabellen für OLAEET-Pakete, Sendungen, Inventar, Suchaufträge und Benachrichtigungen

## Nicht Teil der ersten Oberfläche

- automatisches Kaufen
- Bunjang-Login-Automatisierung
- Captcha-Umgehung oder Zugriff auf private Plattform-Endpunkte
- OLAEET-Synchronisierung
- automatische Marktbeobachtung und Benachrichtigungen
- vollständige Offline-Speicherung privater Datensätze
