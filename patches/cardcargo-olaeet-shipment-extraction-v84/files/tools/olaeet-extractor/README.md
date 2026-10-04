# CardCargo OLAEET Extractor v2

Die Extension erkennt jetzt zwei OLAEET-Seitentypen automatisch:

1. **Warehouse-/Paketübersicht** – kopiert weiterhin den sichtbaren Text für den vorhandenen OLAEET-Paketimport.
2. **Shipping-Detail-Popup** – erzeugt strukturiertes JSON für den neuen CardCargo-Sendungsimport.

Beim Shipping-Popup werden unter anderem ausgelesen:

- OLAEET Shipment-ID (`SHP-...`)
- Provider-Status
- Created At / Completed At
- Courier
- internationale Trackingnummer
- Payment Transaction ID
- Shipping Amount
- Shipping Fee
- Additional Fee
- Insurance Fee
- Total Payment + Währung
- Empfängername und Anschrift
- alle enthaltenen OLAEET-Paket-IDs (`STR-...`)
- Domestic Tracking pro enthaltenem Paket, soweit im Popup vorhanden
- Item Category / maskierter Empfänger
- Box-Abmessungen
- Real Weight
- Volume Weight
- Quote Weight
- vollständiger sichtbarer Rohtext als Diagnose

Die Extension verändert keine OLAEET-Daten und liest keine Passwörter/Cookies aus.
