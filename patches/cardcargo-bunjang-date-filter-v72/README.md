# CardCargo – Bunjang Date Filter v72

Die Extension hat jetzt einen anpassbaren Zeitraum.

Default: letzte 7 Kalendertage inklusive heute.

Beispiel am 26.08.2026:

```text
Von: 20.08.2026
Bis: 26.08.2026
```

Der Filter wirkt doppelt:

1. Die Discovery stoppt beim Scrollen, sobald die sichtbare Bunjang-Historie
   älter als das Von-Datum ist.
2. Das auf der gerenderten Bestelldetailseite extrahierte Kaufdatum wird als
   endgültige Kontrolle verwendet. Orders außerhalb des Bereichs werden nicht
   exportiert.

Button `Auf letzte 7 Tage zurücksetzen` stellt den Default wieder her.

Pause/Stop und persistenter Teil-Export bleiben erhalten.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-date-filter-v72/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach die Extension neu laden.

Keine Supabase-Migration erforderlich.
