# CardCargo v105 - Umsatz EUR-first, Setnummer und Inventar-Verkaufssync

Voraussetzung: v102 Umsatz-Workspace sowie die bisherigen v103/v104-Fixes.

## Änderungen

- Kennzahlen `Gesamtkosten`, `Mindestumsatz` und `Aktueller Umsatz` zeigen EUR groß und KRW/WON klein darunter.
- In der Tabelle bleiben beim Kaufpreis KRW + EUR sichtbar.
- `min. Verkaufswert` und `Verkaufspreis` haben nur noch eine editierbare EUR-Spalte.
  Intern bleibt KRW die kanonische Speicherung in `inventory_sales_values`, berechnet mit dem fixierten historischen Sendungskurs.
- Einzelkarten zeigen zusätzlich zur Kartenbezeichnung die Kartennummer und die gespeicherte Setnummer/Set-ID/Set-Code (mit Fallbacks aus `catalog_snapshot`).
- Wird ein Verkaufspreis gesetzt, synchronisiert `/api/revenue` den Verkauf best-effort zur `inventory_units`-Zeile:
  - vorhandene explizite KRW-/EUR-Verkaufspreisfelder,
  - vorhandene generische Verkaufspreisfelder + Verkaufspreiswährung,
  - `raw_metadata`/`metadata` Revenue-Snapshot,
  - `sold_at`/`sold_date`/`sale_date`, falls vorhanden,
  - `status` bzw. `inventory_status` auf einen kompatiblen Verkaufsstatus (`sold`/`verkauft`/etc.).
- Existiert im aktuellen Inventory-Schema kein kompatibles Statusfeld/-enum, bleibt der Umsatzwert gespeichert und die Umsatzseite zeigt eine Warnung statt den Wert zu verlieren.
- Das Leeren eines Verkaufspreises setzt einen bereits verkauften Status absichtlich nicht automatisch zurück, da der vorherige Inventarstatus nicht zuverlässig bekannt ist.

Keine neue Supabase-Migration.
