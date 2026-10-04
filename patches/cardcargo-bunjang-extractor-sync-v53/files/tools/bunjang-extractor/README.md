# CardCargo Bunjang Extractor

Lokale Chrome-/Edge-Erweiterung für einen vom Nutzer ausgelösten Bunjang-Import.

Die Erweiterung besitzt nur `activeTab`, `scripting` und `clipboardWrite`. Sie liest keine Cookies und exportiert keine Passwörter oder Login-Tokens.

Beim Klick werden aktuelle URL, sichtbarer Seitentext, Bunjang-Produktlinks, der jeweilige DOM-Kontext, Bild-URLs und eingebettete JSON-Scriptblöcke als lokaler JSON-Snapshot in die Zwischenablage kopiert.

## Installation

Chrome: `chrome://extensions` -> Entwicklermodus -> Entpackte Erweiterung laden -> `tools/bunjang-extractor`.

Edge: `edge://extensions` -> Entwicklermodus -> Entpackt laden -> `tools/bunjang-extractor`.

Danach in CardCargo: `Einkäufe -> Bunjang synchronisieren -> Aus Zwischenablage einlesen`.
