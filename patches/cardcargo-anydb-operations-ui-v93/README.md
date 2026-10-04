# CardCargo v93 — AnyDB-inspired Operations UI

Dieser Patch verändert **keine Geschäftslogik und kein Supabase-Schema**. Er legt eine neue visuelle Operations-Schicht über das bestehende CardCargo und erweitert das Inventar um ein verbundenes Objektmodell.

## Konzept

AnyDB organisiert Inventar um verbundene Business Objects: Item, Location, Inventory Item und Inventory Transaction. CardCargo besitzt dieselben Beziehungen bereits in spezialisierter Form:

```text
Kartenidentität
   ↓
Einkauf
   ↓
OLAEET-Paket
   ↓
Internationale Sendung
   ↓
physische Inventareinheit
```

v93 macht diesen Zusammenhang in der UI sichtbar und vereinheitlicht die gesamte Oberfläche.

## Visuelle Änderungen

- deutlich kompaktere Seitentitel;
- neutrale weiße Operations-Flächen auf hellgrauem Hintergrund;
- konsistente Panel-Radien, Paddings und Abstände;
- einheitliche Button- und Input-Höhen;
- kompaktere Tabellen;
- einheitliche Filter- und Toolbar-Ausrichtung;
- AnyDB-artige Status-/Objektchips;
- symmetrischere Inventar-Cards mit konsistenter Bildfläche;
- responsive Verbesserungen;
- alte `URL importieren` Navigation wird erneut gezielt entfernt.

## Inventar

Auf `Inventar` erscheint oberhalb des bestehenden Workspaces ein kompakter verbundener Warenfluss:

```text
Einkauf → OLAEET-Paket → Sendung → Inventareinheit
```

Zusätzlich wird die AnyDB-Semantik auf CardCargo abgebildet:

```text
Item           → Kartenidentität
Location       → Logistikstufe / Lagerort
Inventory Item → physische Einzelkarte
Transaction    → Einkauf / Empfang / Versand
```

Die bestehenden Filter, Katalogsuche, Massenbearbeitung und Inventardaten bleiben unverändert.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-anydb-operations-ui-v93/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
