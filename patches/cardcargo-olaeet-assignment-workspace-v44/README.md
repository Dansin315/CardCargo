# CardCargo – OLAEET Einkaufszuordnung v44

Dieser Patch ersetzt die bisherige reine Checkbox-Liste im OLAEET-Paketformular durch eine übersichtlichere Split-View.

## Neu

- Paketinformationen bleiben beim Zuordnen links sichtbar.
- Erstes vorhandenes OLAEET-Paketbild wird als Referenz angezeigt.
- Jeder Bunjang-Einkauf zeigt direkt sein erstes archiviertes Angebotsbild.
- Suche nach Titel, Bunjang-ID und Verkäufer.
- Datumsfilter von/bis.
- Button **45 Tage vor Eingang**, der den plausiblen Kaufzeitraum aus dem OLAEET-Eingangsdatum setzt.
- Sortierung nach:
  - Nähe zum OLAEET-Eingang
  - Kaufdatum neu/alt
  - Preis hoch/niedrig
  - Titel A–Z
- Verkäufer und Preis werden in der Zuordnung angezeigt.
- Zeitlich plausible Einkäufe erhalten eine kleine Markierung.
- Ausgewählte Einkäufe sind optisch hervorgehoben.
- **Alle sichtbaren auswählen** und **Auswahl leeren**.
- Bereits anderen OLAEET-Paketen zugeordnete Einkäufe bleiben wie bisher serverseitig ausgeschlossen.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-assignment-workspace-v44/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
