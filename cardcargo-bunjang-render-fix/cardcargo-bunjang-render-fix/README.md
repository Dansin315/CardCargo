# CardCargo: dynamischer Bunjang-Import

Der bisherige Import liest nur das zuerst gelieferte HTML. Bunjang liefert dort derzeit vor allem generische Website-Metadaten. Die eigentlichen Produktdaten werden anschließend im Browser per JavaScript geladen. Dieser Patch ergänzt deshalb einen Playwright-Fallback.

## Installation

Im Projektordner:

```bash
npm install playwright
npx playwright install chromium
```

Unter Ubuntu/Debian, falls Systembibliotheken fehlen:

```bash
npx playwright install --with-deps chromium
```

## Dateien kopieren

Kopiere diese Dateien in dein Projekt:

```text
lib/importer/render-bunjang.ts       -> lib/importer/render-bunjang.ts
lib/importer/parse-listing.ts        -> lib/importer/parse-listing.ts
next.config.ts                       -> next.config.ts
app/api/import/preview/route.ts       -> app/api/import/preview/route.ts
tests/render-bunjang.test.ts         -> tests/render-bunjang.test.ts
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev
```

## Erwarteter Testwert

Für `https://m.bunjang.co.kr/products/422347802` sollte die Vorschau mindestens erkennen:

- Titel: `포켓몬카드 다크라이 지라치 세레비`
- Preis: `50000`
- Beschreibung: `2015년도 포켓몬카드`
- Verkäufer: `dhsgh`
- Produktbilder statt des Bunjang-Logos

Die Extraktion nutzt zuerst geladene JSON-Antworten und anschließend sichtbaren Seitentext als Fallback. Bilder werden nur akzeptiert, wenn ihre Bunjang-Media-URL zur Produkt-ID gehört. Dadurch wird das allgemeine Bunjang-Logo nicht mehr angeboten.

## Hinweis zur Bereitstellung

Diese Variante ist für den lokalen Single-User-Betrieb gedacht. Bei einer späteren Serverless-Bereitstellung muss Chromium für den jeweiligen Hosting-Anbieter separat paketiert werden. Langfristig ist die offizielle Bunjang-Partner-API stabiler.
