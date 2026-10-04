# CardCargo – Internationale Sendungsbilder v12

Dieser Patch erweitert das mit v11 eingeführte Modul für internationale OLAEET-Sendungen.

## Funktionen

- Manuelle Bilder direkt an einer internationalen Sendung speichern.
- Bildtypen:
  - Allgemein
  - Konsolidierung
  - Versandkarton
  - Versandetikett
  - Zoll / Dokument
  - Beschädigung
- Bestehende manuelle Sendungsbilder beim Bearbeiten zum Löschen markieren.
- Bilder der enthaltenen OLAEET-Pakete dynamisch anzeigen.
- Bilder der den OLAEET-Paketen zugeordneten Bunjang-Einkäufe dynamisch anzeigen.
- Keine Kopie verknüpfter Bilder: Die Sendung referenziert die vorhandenen Paket- und Einkaufsbilder.
- Wird ein OLAEET-Paket aus einer Sendung entfernt, verschwinden dessen dynamisch eingeblendete Bilder aus der Sendung.
- Eigene Sendungsbilder bleiben bei Änderungen der Paketzuordnung bestehen.
- Beim Löschen einer Sendung werden nur deren eigene Bilddateien und Metadaten entfernt. Paket- und Einkaufsbilder bleiben erhalten.

## Grenzen

- JPEG, PNG, WebP und GIF.
- Maximal 6 MB je Datei.
- Maximal 12 neue Bilder pro Speichervorgang.
- Maximal 24 eigene Bilder je internationaler Sendung.

## Installation

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash "$HOME/CardCargo/patches/cardcargo-international-shipment-images-v12/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach die Migration ausführen:

```text
supabase/migrations/0008_shipment_images.sql
```

Im Supabase Dashboard:

```text
SQL Editor → New query → vollständigen Inhalt einfügen → Run
```

Anschließend lokal prüfen:

```bash
nvm use 22
rm -rf .next
rm -f tsconfig.tsbuildinfo
npm run typecheck
npm run lint
npm run test
npm run build
```

## Verhalten der Bildrelationen

```text
Bunjang-Einkauf
  └─ purchase_images
       ↑
warehouse_package_purchases
       ↑
OLAEET-Paket
  ├─ warehouse_package_images
  └─ shipment_packages
       ↑
Internationale Sendung
  └─ shipment_images (nur eigene, manuell hochgeladene Sendungsbilder)
```

Verknüpfte Paket- und Einkaufsbilder werden bei der Anzeige aufgelöst, aber nicht in `shipment_images` kopiert.
