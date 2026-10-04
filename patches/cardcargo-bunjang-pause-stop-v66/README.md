# CardCargo – Bunjang Pause / Stop v66

Erweitert v65 um **Pausieren**, **Fortsetzen** und **Beenden**.

- Pause wirkt auch während des automatischen Scrollens der Kaufhistorie.
- Beenden stoppt kontrolliert nach dem aktuell laufenden kleinen Schritt.
- Gelernte Kaufkarten-Zuordnungen und Trackingstände bleiben erhalten.
- Wenn bereits Bestelldetails geladen wurden, wird ein Teil-Batch in die Zwischenablage kopiert.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-pause-stop-v66/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach die Extension unter `chrome://extensions` bzw. `edge://extensions` neu laden.

Keine Supabase-Migration erforderlich.
