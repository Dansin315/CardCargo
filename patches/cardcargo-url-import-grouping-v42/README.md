# CardCargo URL Import & Purchase Grouping v42

Aendert den Bunjang-URL-Import:

- Enter im URL-Feld loest standardmaessig `Vorschau laden` aus.
- Preis und Versandkosten sind Textfelder mit numerischer Tastatur (`inputMode=numeric`) und akzeptieren nur Ziffern. Pfeiltasten koennen den Wert nicht mehr hoch/runter zaehlen.
- Neue Bunjang-Angebote werden beim Speichern automatisch mit einem bestehenden Einkauf zusammengefuehrt, wenn:
  - Verkäufer nicht leer und normalisiert identisch ist,
  - Kaufdatum identisch ist,
  - Waehrung identisch ist.
- Artikelpreis und koreanische Versandkosten werden summiert.
- Titel werden mit ` && ` verbunden.
- Beschreibungen werden strukturiert mit Titel, Beschreibung und jeweiligem Original-Link gespeichert und mit `&&` getrennt.
- Bei gruppierten Einkaeufen scrollt der Header-Button zu den einzelnen Beschreibungen/Originalangeboten.
- Der Status des bereits existierenden Einkaufs bleibt beim Zusammenfuehren erhalten.
- Mehrere bereits historisch getrennte passende Einkaeufe werden NICHT automatisch untereinander verschmolzen, um bestehende OLAEET-/Shipment-Beziehungen nicht unbeabsichtigt zu veraendern. Ein neuer Import wird mit dem aeltesten passenden Datensatz verbunden und es erscheint ein Hinweis.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-url-import-grouping-v42/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich. Die Einzelangebote eines gruppierten Einkaufs werden strukturiert in `purchases.raw_metadata.grouped_listings` gespeichert; die vorhandene Purchase-Zeile bleibt der gemeinsame Datensatz.
