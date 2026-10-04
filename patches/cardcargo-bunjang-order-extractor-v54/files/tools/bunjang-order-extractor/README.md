# CardCargo Bunjang Order Extractor v54

Der Extractor arbeitet nicht mehr anhand von Produktkarten/DOM-Nachbarschaften.

Er nutzt die Bunjang-Kaufübersicht nur, um die stabilen Bestelllinks
`/purchases/<Bestellnummer>` zu finden. Anschließend lädt er jede Detailseite mit der bereits
vorhandenen Bunjang-Browsersitzung und übergibt deren Text an CardCargo.

Das entspricht der tatsächlichen Bunjang-Struktur:

- Kaufübersicht: Status, Preis, Titel, Verkäufer
- Bestelldetail: Bestellnummer, Bestellzeit, Verkäufer, Warenwert, Versandkosten, Carrier, Tracking

Keine Cookies, Passwörter oder Login-Tokens werden in das Export-JSON geschrieben.

## Installation

Chrome: `chrome://extensions` -> Entwicklermodus -> Entpackte Erweiterung laden.
Edge: `edge://extensions` -> Entwicklermodus -> Entpackt laden.

Ordner:

`tools/bunjang-order-extractor`

Öffne danach `https://order.bunjang.co.kr/`, scrolle soweit nötig, damit die gewünschten
Käufe geladen sind, und starte den Scan.
