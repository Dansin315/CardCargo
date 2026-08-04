# Validation

- Patch wurde per `patch --dry-run -p1` gegen den kombinierten Stand aus Bunjang Unified v3 und Shipping v4 geprüft.
- Patch wurde testweise angewendet und das Ergebnis dateiweise mit dem Zielstand verglichen.
- Alle neuen und veränderten TypeScript-/TSX-Dateien wurden mit TypeScript `transpileModule` auf Syntaxfehler geprüft.
- Ein vollständiger lokaler `npm run check` war in der isolierten Erstellungsumgebung nicht möglich, da die Paketinstallation dort nicht innerhalb des Zeitlimits abgeschlossen wurde. Er muss nach Anwendung im vorhandenen Projekt ausgeführt werden.
