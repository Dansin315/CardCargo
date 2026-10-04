# CardCargo Bunjang – Immediate Partial Export v69

v69 ändert die Bedeutung von **Pausieren** und **Beenden**.

## Pausieren

Sobald `Pausieren` geklickt wird:

1. Die Extension setzt den Lauf auf Pause.
2. Alle **bis zu diesem Moment vollständig gelesenen** Bestelldetailseiten werden
   sofort ausgewertet.
3. Daraus wird unmittelbar ein gültiger CardCargo-Teil-Batch erzeugt.
4. Dieser Teil-Batch wird sofort in die Zwischenablage kopiert.
5. Die Statistik zeigt, wie viele Werte bereits erkannt wurden:
   - Warenwert
   - Kaufdatum
   - Versandkosten
   - Verkäufer
   - Tracking
   - Fehler
6. `Pausieren` wird zu `Fortsetzen`.

Eine gerade noch ladende Bestellung wird nicht halb exportiert. Sie wird erst
nach vollständigem Lesen in einen späteren Zwischenstand aufgenommen.

## Beenden

Sobald `Beenden` geklickt wird:

1. Alle bereits vollständig gelesenen Bestellungen werden **sofort** exportiert.
2. Der Teil-Batch liegt sofort in der Zwischenablage.
3. Der aktuell laufende kleine Browser-Schritt darf sauber fertig werden.
4. Danach beendet sich der Sync.

Du musst also nicht warten, bis der gesamte Verlauf abgearbeitet wurde, um die
bisherigen Daten in CardCargo zu importieren.

## Bisherige Daten erneut kopieren

v69 ergänzt:

`Bisherige Daten erneut kopieren`

Der Button wird aktiv, sobald mindestens ein Zwischen-/Endexport erzeugt wurde.

Damit kannst du den letzten Teil-Batch erneut in die Zwischenablage kopieren,
ohne den Sync erneut zu starten.

## Installation

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-immediate-partial-export-v69/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Anschließend die Browser-Extension neu laden.

Keine Supabase-Migration erforderlich.
