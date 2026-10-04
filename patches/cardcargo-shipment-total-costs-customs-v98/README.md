# CardCargo v98 – Gesamtkosten + Zollkosten für internationale Sendungen

v98 erweitert die normale internationale Sendungsansicht um eine konsolidierte Kostenrechnung.

## Berechnung

CardCargo ermittelt zunächst alle Bunjang-Einkäufe, die über die in der internationalen Sendung enthaltenen OLAEET-Pakete verknüpft sind.

Für jeden Bunjang-Einkauf werden addiert:

- `price_amount` – Artikelpreis
- `domestic_shipping_amount` – Versand innerhalb Koreas
- `service_fee_amount` – Bunjang-/Zahlungsgebühren

Danach werden die OLAEET-Kosten addiert:

- Shipping Amount
- Shipping Fee
- Additional Fee
- Insurance Fee
- `Total Payment` als OLAEET-Gesamtsumme

Wichtig: `Total Payment` wird nicht zusätzlich zu seinen Einzelbestandteilen addiert. Es dient als OLAEET-Subtotal, damit keine Gebühren doppelt gezählt werden.

## Neue Kostenansicht

Die Sendung zeigt nun:

```text
Bunjang
Artikelpreise
Versand in Korea
Service-/Zahlungsgebühren
Bunjang gesamt

OLAEET
Shipping Amount
Shipping Fee
Additional Fee
Insurance Fee
Versand & Gebühren gesamt

Zwischensumme vor Zoll
Zoll / Einfuhrabgaben
Gesamtkosten inkl. Zoll
```

Zusätzlich werden Anzahl der verknüpften Bunjang-Einkäufe und tatsächlichen Bunjang-Bestellungen angezeigt. Bei gruppierten Einkäufen wird `raw_metadata.bunjang_orders[]` für die Bestellanzahl berücksichtigt, während der gespeicherte aggregierte Einkaufspreis nur einmal in die Summe eingeht.

## Zollkosten

In der Sendungsansicht gibt es ein editierbares Feld für Zoll-/Einfuhrabgaben. Standardwährung ist EUR, alternativ sind KRW und USD auswählbar.

Der Wert wird ohne neue Datenbankmigration gespeichert unter:

```text
shipments.raw_metadata.olaeet_costs.customs_amount
shipments.raw_metadata.olaeet_costs.customs_currency
shipments.raw_metadata.olaeet_costs.customs_updated_at
```

Wenn Zoll und übrige Sendung dieselbe Währung verwenden, berechnet CardCargo eine einzelne Gesamtsumme. Bei unterschiedlichen Währungen werden die Beträge bewusst getrennt angezeigt, damit kein falscher Gesamtwert ohne Wechselkurs entsteht.

## Header

Die kleine Box oben rechts zeigt jetzt:

- Internationale Sendungsnummer
- Bunjang + OLAEET vor Zoll
- Zoll / Einfuhr
- Gesamtkosten

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-shipment-total-costs-customs-v98/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

Keine neue Supabase-Migration erforderlich.
