# CardCargo – Einkäufe bearbeiten und löschen (v5)

Dieser Patch setzt den bereits installierten Bunjang-Import und den Versandkosten-Patch v4 voraus.

## Neue Funktionen

- Button **Bearbeiten** auf jeder Einkaufsdetailseite
- separate Bearbeitungsseite für:
  - Titel
  - Verkäufer
  - Kaufdatum
  - Artikelpreis
  - koreanische Versandkosten
  - Service-/Zahlungsgebühren
  - Währung
  - Status
  - Beschreibung/Notizen
- Button **Einkauf löschen** mit Sicherheitsabfrage
- Löschung des Einkaufs und der abhängigen Datenbankeinträge
- anschließende Bereinigung der archivierten Angebotsbilder im privaten Supabase-Storage
- Erfolgs- und Fehlermeldungen nach Bearbeitung und Löschung

Die Angebots-URL, externe Bunjang-ID und archivierten Bilder bleiben beim Bearbeiten unverändert.

## Installation

Lege den entpackten Ordner außerhalb von `poketracker-pwa` ab, zum Beispiel:

```text
/home/dangu/CardCargo/
├── poketracker-pwa/
└── cardcargo-edit-delete-v5/
```

Dann:

```bash
cd "$HOME/CardCargo/poketracker-pwa"
bash "$HOME/CardCargo/cardcargo-edit-delete-v5/apply.sh" "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
nvm use 22
rm -rf .next
rm -f tsconfig.tsbuildinfo
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev
```

Es ist keine neue Supabase-Migration und kein zusätzliches npm-Paket erforderlich.

## Manuelle Alternative

Falls der Patch wegen eigener Änderungen nicht sauber anwendbar ist, liegen die vollständigen Zieldateien unter `files/`. Kopiere sie nur nach vorheriger Sicherung in die identischen Pfade deines Projekts.

## Löschverhalten

Die Datenbank besitzt bereits `ON DELETE CASCADE` für Einkaufsbilder, Einkaufspositionen und Paketzuordnungen. Inventareinheiten, die später über eine Einkaufsposition verbunden sind, bleiben bestehen, verlieren bei Löschung der Position jedoch ihre Referenz. Die Storage-Dateien werden nach erfolgreicher Datenbanklöschung separat entfernt. Falls diese Bereinigung fehlschlägt, wird der Einkauf dennoch gelöscht und die Oberfläche zeigt einen Hinweis.
