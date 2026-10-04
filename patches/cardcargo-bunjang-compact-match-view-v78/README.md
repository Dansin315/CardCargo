# CardCargo – kompakte Matchansicht v78

v78 ändert nur die Darstellung der Bunjang-Matchansicht. Matching- und
Speicherlogik aus v77 bleiben unverändert.

## Änderungen

Die Matchansicht ist jetzt bewusst auf eine Bildschirmhöhe verdichtet:

- links und rechts exakt gleich breite Vergleichskarten;
- beide Karten verwenden dieselbe Bildhöhe;
- nur noch 168 px hohe Bilder statt 280 px;
- Datenfelder liegen in einem kompakten 2-Spalten-Raster;
- Titel werden auf maximal zwei Zeilen begrenzt;
- lange Match-Gründe werden einzeilig gekürzt, bleiben aber als Tooltip
  vollständig verfügbar;
- Wechsel zwischen Bunjang-Orders befindet sich in einer kompakten Kopfzeile;
- Wechsel zwischen mehreren Kandidaten befindet sich ebenfalls in der
  Kopfzeile;
- der zusätzliche Kandidaten-Navigationsblock unterhalb der Karten entfällt;
- der separate große Bestätigungsblock entfällt;
- `Match speichern` und `Einkauf öffnen` befinden sich in einer einzigen
  kompakten Fußzeile.

Die beiden Vergleichskarten sind dadurch symmetrisch aufgebaut:

```text
┌────────────────────────────────────────────────────────────┐
│ ‹   Match 2/8 · Extraktion ↔ Einkauf · Kandidat 1/3   ›  │
├───────────────────────────┬────────────────────────────────┤
│ EXTRAKTION                │ GESPEICHERTER EINKAUF          │
│ [Bilder 168px]            │ [Bilder 168px]                 │
│ Titel                     │ Titel                          │
│ Verkäufer | Warenwert     │ Verkäufer | Preis              │
│ Versand   | Gesamt        │ Versand   | Kaufdatum          │
│ Datum     | Carrier       │ Status    | Carrier             │
│ Tracking  | Status        │ Tracking  | Listing-ID          │
├───────────────────────────┴────────────────────────────────┤
│ Order/Score · Einkauf öffnen                 Match speichern│
└────────────────────────────────────────────────────────────┘
```

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-compact-match-view-v78/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
