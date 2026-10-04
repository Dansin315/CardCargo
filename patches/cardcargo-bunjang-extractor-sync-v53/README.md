# CardCargo – Bunjang Extractor + Sync v53

Der Patch ergänzt die zweite Hälfte des Tracking-basierten OLAEET-Matchings.

## Browser-Extension

Unter `tools/bunjang-extractor` liegt eine lokale Chrome-/Edge-Erweiterung. Sie wird nur auf ausdrücklichen Klick aktiv und exportiert keine Cookies, Passwörter oder Login-Tokens.

Sie sammelt aus der geöffneten Bunjang-Seite:

- Bunjang Listing-ID / Produktlink
- Titel
- sichtbaren Bestell-/Versandkontext
- Verkäufer, soweit sichtbar
- Kaufdatum
- Preis
- koreanischen Carrier
- koreanische Trackingnummer
- Bild-URLs als Metadaten
- eingebettete JSON-Blöcke für spätere Parser-Verbesserungen

## CardCargo-Sync

Neue Seite: `/purchases/bunjang-import`

Vorhandene Einkäufe werden über `source=bunjang` + `source_listing_id` erkannt. Manuell gepflegte Titel werden nicht überschrieben; fehlende Werte sowie Carrier/Tracking werden ergänzt.

Optional können fehlende Einkäufe angelegt werden. Diese besitzen zunächst kein archiviertes Angebotsbild.

## Automatisches OLAEET-Matching

Nach dem Sync vergleicht CardCargo die normalisierte Bunjang-Trackingnummer mit den bereits importierten OLAEET-Paketen.

Bei exakt einem passenden OLAEET-Paket wird automatisch zugeordnet. Mehrere Bunjang-Einkäufe dürfen dieselbe Trackingnummer besitzen. Bei Konflikten wird nichts blind umgehängt.

Der Import kann in beliebiger Reihenfolge erfolgen: zuerst OLAEET oder zuerst Bunjang.

## Installation

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-extractor-sync-v53/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine neue Supabase-Migration erforderlich. Die `domestic_carrier`- und `domestic_tracking_number`-Migration aus v50/v51 muss bereits in Supabase ausgeführt worden sein.

## Extension installieren

Chrome: `chrome://extensions` → Entwicklermodus → Entpackte Erweiterung laden → `tools/bunjang-extractor`

Edge: `edge://extensions` → Entwicklermodus → Entpackt laden → `tools/bunjang-extractor`
