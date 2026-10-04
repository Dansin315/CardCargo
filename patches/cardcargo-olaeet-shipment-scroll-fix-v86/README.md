# CardCargo v86 – OLAEET Shipping-Panel Scroll Fix

v86 behebt die unvollständige Extraction internationaler OLAEET-Sendungen.

## Ursache

OLAEET zeigt eine Sendung unter einer Route wie:

```text
/webapp/shipping/SHP-20260819-RRKNGF
```

in einem rechts eingeblendeten, separat scrollbareren Shipping-Panel. Die Shipping-Liste im Hintergrund bleibt gleichzeitig im DOM.

v84 hat nur einen einmaligen `document.body.innerText`-Snapshot ausgewertet. Das ist für dieses UI nicht zuverlässig. Im gezeigten Beispiel meldet OLAEET in der Hintergrundzeile `27 Items / 1 Box`; v86 verwendet diese Zahl als Vollständigkeitskontrolle.

## Neuer Ablauf

1. Die SHP-ID aus `/shipping/SHP-...` ist die primäre ID.
2. Der Extractor sucht gezielt das rechte Shipping-Panel.
3. Alle scrollbareren Container darin werden automatisch von oben bis unten durchlaufen.
4. Bei jedem Scroll-Schritt werden Text und STR-Paketzeilen gesammelt.
5. Paketzeilen werden DOM-/tabellenbasiert gelesen, auch wenn STR-ID und Tracking in derselben Zeile stehen.
6. Die erkannte Paketanzahl wird gegen `N Items / M Box` geprüft.
7. CardCargo speichert keine Extraction, die ausdrücklich als unvollständig markiert ist.

Beispiel für einen erfolgreichen Lauf:

```text
SHP-20260819-RRKNGF kopiert.
27/27 Paket(e) · 1/1 Box(en) · EG051960395KR
Extraction vollständig.
```

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-scroll-fix-v86/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach die OLAEET-Extension unter `chrome://extensions` bzw. `edge://extensions` neu laden.

Keine Supabase-Migration erforderlich.
