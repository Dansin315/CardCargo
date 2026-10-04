# CardCargo – Bunjang Sync Match Review v71

v71 macht aus der bisherigen Bunjang-Synchronisation einen Review-Workflow.

## Neuer Schritt: Mögliche Matches prüfen

Nach dem Einlesen des Extractor-Batches:

```text
[Mögliche Matches suchen]
```

CardCargo vergleicht jede extrahierte Bunjang-Order mit bereits gespeicherten
Bunjang-Einkäufen.

Bewertet werden:

1. bereits gleiche `bunjang_order_id`
2. gleiche Listing-ID
3. gleiche Trackingnummer
4. Titel
5. Verkäufer
6. Warenwert
7. Versandkosten
8. Kaufdatum

Pro Order werden höchstens fünf Vorschläge angezeigt.

## Detailvergleich

Links:

- Bilder aus der Bunjang-Order-Extraction
- Order-ID
- Titel
- Verkäufer
- Kaufdatum
- Warenwert
- Versandkosten
- Gesamtbetrag
- Carrier
- Tracking

Rechts pro bestehendem CardCargo-Einkauf:

- archivierte private Angebotsbilder
- Titel
- Bunjang Listing-ID
- Verkäufer
- Preis
- Versandkosten
- Kaufdatum
- Status
- Carrier
- Tracking
- Match-Gründe
- Match-Konfidenz
- Link zur vollständigen Einkaufsdetailseite

## Persönliche Auswahl

Jeder Kandidat hat:

```text
[Diesen Einkauf verwenden]
```

Nach Auswahl:

```text
[Auswahl rückgängig]
```

Die Auswahl ist beim Synchronisieren verbindlich.

## Keine versteckten Matches

Neu und standardmäßig aktiviert:

```text
Nicht ausgewählte Orders nicht automatisch bestehenden Einkäufen zuordnen
```

Damit wird für nicht persönlich ausgewählte Orders die alte heuristische
Bestands-Zuordnung deaktiviert.

Wenn zusätzlich:

```text
Fehlende Einkäufe automatisch anlegen
```

deaktiviert bleibt, werden nicht ausgewählte Orders einfach übersprungen.

Dadurch kann man zunächst nur die persönlich geprüften Matches übernehmen.

## Bereits verknüpfte Orders

Falls `bunjang_order_id` bereits exakt auf einen bestehenden Purchase zeigt,
wird dieser Kandidat automatisch als aktuelle Auswahl markiert und ausdrücklich
als bereits verbunden angezeigt.

## Installation

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-sync-match-review-v71/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
