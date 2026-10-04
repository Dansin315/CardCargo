# CardCargo - Bunjang Date Filter Fix v73

## Ursache

v72 beendete die Discovery sofort, sobald irgendein geladenes Datum im DOM
aelter als das Von-Datum war. Bunjang laedt jedoch mehrere Einkaeufe in einem
Block. Ein Block kann gleichzeitig Bestellungen vom 22./21. August und bereits
den ersten Eintrag vom 19. August enthalten. Der Abbruch konnte deshalb erfolgen,
bevor alle Netzwerkantworten dieses Blocks im Extension-Speicher angekommen waren.

## Fix

- Kein sofortiger Abbruch an der Zeitraumgrenze.
- 1 Sekunde Settle-Zeit fuer den gerade geladenen Block.
- Netzwerk- und DOM-Kandidaten werden danach erneut zusammengefuehrt.
- Abbruch erst nach zwei stabilen Boundary-Durchlaeufen.
- Zusaetzlicher finaler Settle-Pass vor Ende der Discovery.
- Detailseite/Kaufdatum bleibt die finale Source of Truth fuer den Zeitraum.
- Statistik unterscheidet nun:
  - Detailseiten geprueft
  - Ausserhalb Zeitraum
  - Bestellungen im Zeitraum

## Erwartung fuer das bereitgestellte PDF

Bei 26.08.2026 und Default 7 Tage ist der Bereich 20.08.-26.08.2026.
Im PDF liegen mindestens 8 Einkaeufe in diesem Bereich:

- 25.08.: 4
- 22.08.: 2
- 21.08.: 2

Die Einkaeufe vom 19.08. und 18.08. liegen ausserhalb.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-date-filter-fix-v73/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach die Extension neu laden. Keine Supabase-Migration erforderlich.
