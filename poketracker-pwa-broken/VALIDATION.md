# Validierungsstatus

Stand: 31. Juli 2026

## In dieser Erstellungsumgebung erfolgreich geprüft

- Syntax-/Transpilierungsprüfung aller 40 TypeScript- und TSX-Dateien
- Auflösung aller internen `@/`- und relativen Imports
- JSON-Syntax von `package.json` und `tsconfig.json`
- JavaScript-Syntax des Service Workers
- direkte Laufzeit-Smoke-Tests für:
  - Bunjang-Host-Allowlist und URL-Normalisierung
  - Blockierung direkter IPv4-/IPv6-Ziele vor einer Verbindung
  - JPEG-/PNG-Dateisignaturen und 6-MB-Grenze
  - Same-Origin-Prüfung schreibender API-Anfragen
- PWA-Icons als RGBA-PNG in 192 × 192 und 512 × 512 Pixeln
- Suche nach versehentlich eingebetteten Supabase-Secret-Keys
- Existenz aller lokalen Markdown-Links

## In dieser Erstellungsumgebung nicht ausführbar

Die Verbindung zur npm-Registry war gesperrt beziehungsweise nicht per DNS erreichbar (`EAI_AGAIN`; auch eine direkte HTTPS-Verbindung war nicht möglich). Daher konnten `node_modules` und `package-lock.json` nicht erzeugt und die folgenden Befehle hier nicht vollständig ausgeführt werden:

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

Auch ein echter End-to-End-Test gegen Supabase und eine Live-Bunjang-Produktseite benötigt deine eigenen Umgebungsvariablen, ein angelegtes Auth-Konto und das ausgeführte Datenbankschema.

## Verbindliche lokale Abnahme

Nach dem Einrichten von Supabase im Projektverzeichnis ausführen:

```bash
npm install
npm run check
npm run dev
```

Danach mindestens diese Fälle im Browser prüfen:

1. Anmeldung mit der erlaubten E-Mail-Adresse funktioniert; ein anderes Konto wird abgewiesen.
2. Eine echte Bunjang-URL liefert entweder eine Vorschau oder wechselt sauber in den manuellen Fallback.
3. Ein Einkauf ohne erfolgreich archiviertes Bild wird nicht angelegt.
4. Ein Einkauf mit Screenshot wird angelegt und zeigt das Bild nach einem Neuladen weiterhin an.
5. Derselbe Kauf kann nicht ein zweites Mal über Produkt-ID oder kanonische URL angelegt werden.
6. Der Bucket `listing-images` ist privat; finale Einkaufspfade lassen sich vom Browser nicht direkt beschreiben.
7. Die installierte PWA zeigt offline nur die neutrale Offline-Seite und keine zuvor geöffneten privaten Datensätze.
