# CardCargo – Bunjang Rendered Detail Extraction v68

v68 macht die Order-ID wieder zu dem, was sie sein soll: nur zum Schlüssel für
die eigentlichen Bestelldaten.

Für jede relevante Order wird die echte gerenderte Bunjang-Detailseite in einem
inaktiven Hilfs-Tab geladen und ausgelesen.

Extrahiert werden:

- Bestellnummer
- Titel
- Verkäufer
- Kaufdatum
- exakter Bestellzeitpunkt
- Warenwert / tatsächlicher Kaufpreis
- Versandkosten
- Gesamtbetrag
- Versandmethode
- Versandservice / Carrier
- Trackingnummer
- Produkt-/Bild-URLs
- vollständiger gerenderter Seitentext als Fallback

CardCargo bevorzugt die strukturierten v68-Daten und verwendet den Rohtext nur
noch als Fallback.

## Installation

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-rendered-detail-extraction-v68/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach Extension neu laden und:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
