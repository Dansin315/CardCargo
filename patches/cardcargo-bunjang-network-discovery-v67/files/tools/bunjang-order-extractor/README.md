# CardCargo Bunjang Network Discovery v67

v67 ersetzt die fehleranfällige Kaufkarten-Heuristik aus v65/v66.

Wenn die Extension vorher z. B. `209 Kaufkarten` und `0 Bestellnummern` meldete,
wurden verschachtelte DOM-Elemente als Karten fehlinterpretiert.

v67 beobachtet stattdessen die Fetch/XHR-Antworten, mit denen Bunjang seine
Kaufübersicht selbst befüllt, und extrahiert daraus nur plausible Order-IDs.

Keine vollständigen Netzwerkantworten werden dauerhaft gespeichert.
Keine Cookies, Passwörter oder Login-Tokens werden exportiert.

Nach Installation die Extension neu laden. Beim ersten Lauf kann die Seite
einmal automatisch neu geladen werden, damit der Hook vor den Requests aktiv ist.
