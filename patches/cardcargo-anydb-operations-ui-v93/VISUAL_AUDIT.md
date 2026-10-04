# CardCargo Visual Audit — v93

## Beobachtete Inkonsistenzen

Aus den aktuellen CardCargo-Screenshots und den bestehenden Komponenten fallen vor allem diese Punkte auf:

1. **Zu große Seitentitel**
   - Die großen Serif-H1 dominieren den Inhalt und erzeugen sehr viel vertikalen Leerraum.
   - Operative Informationen beginnen dadurch deutlich unterhalb der Navigation.

2. **Unterschiedliche visuelle Radien und Dichten**
   - Navigation, Logout, Primary Actions und Panels nutzen stark unterschiedliche Größen und Pillenformen.
   - Dadurch wirken Elemente aus verschiedenen Seiten nicht wie ein gemeinsames System.

3. **Uneinheitliche Ausrichtung von Aktionen und Filtern**
   - Filter, Buttons und erklärende Texte folgen je Seite unterschiedlichen Baselines und Abständen.
   - Einige Module verwenden viele lokale Inline-Abstände.

4. **Inventarkarten sind visuell sehr lang**
   - Große Bilder und großzügige Typografie führen zu stark unterschiedlichen Kartenhöhen.
   - Metadaten werden weniger schnell scanbar.

5. **Tabellen und Record-Cards haben unterschiedliche Informationsdichte**
   - Ein Einkauf, ein OLAEET-Paket, eine Sendung und eine Inventareinheit wirken derzeit wie vier unterschiedliche UI-Produkte.

6. **Beziehungen zwischen Objekten sind nicht sofort sichtbar**
   - CardCargo hat bereits den Datenfluss Einkauf → Paket → Sendung → Inventar, zeigt ihn im Inventar aber nicht als verbundenes Operationsmodell.

## v93 Änderungen

- kompakte Sans-Serif-Hierarchie ähnlich moderner Operations-Datenbanken;
- weiß/graue Record-Flächen statt großer beiger Editorial-Flächen;
- 36px Standardhöhe für Controls und Buttons;
- 8–12px Radien statt großer Pillen-/Kartenradien;
- einheitliche Panel-Paddings und Abstände;
- kompaktere Tabellen mit klaren Headern und Hover-Zuständen;
- symmetrische Filter-/Toolbar-Grids;
- kompaktere Inventar-Record-Cards mit konsistenten Bildflächen;
- neues verbundenes Inventarmodell auf der Inventarseite;
- erneute Entfernung des alten `URL importieren` Navigationseintrags;
- responsive Layoutregeln für Tablet und Mobile.

## AnyDB-Konzept auf CardCargo übertragen

| AnyDB | CardCargo |
|---|---|
| Item | Kartenidentität / Katalogeintrag |
| Location | OLAEET, internationale Sendung, eigenes Inventar |
| Inventory Item | konkrete physische Karte / Inventory Unit |
| Inventory Transaction | Einkauf, Wareneingang, Versand, spätere Bestandsbewegung |

Damit bleibt CardCargo spezialisiert auf Pokémon-Karten und Logistik, übernimmt aber das Prinzip eines verbundenen Operationssystems statt nur separater Listen.
