# CardCargo purchases management v38

Erweitert die Einkaufsansicht um:

- Standard-Sortierung nach Kaufdatum (neu -> alt)
- Sortierung nach Kaufdatum, Preis, Erfassungsdatum, letzter Änderung, Verkäufer und Titel
- 10 Einkäufe pro Seite mit Seitennavigation
- Mehrfachauswahl und Massenbearbeitung für Status und Kaufdatum
- Entfernen auch automatisch importierter Bunjang-Angebotsbilder nach dem Speichern
- Mindestens ein Bild pro Einkauf bleibt weiterhin Pflicht

Anwendung:

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-purchases-management-v38/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Datenbankmigration erforderlich.
