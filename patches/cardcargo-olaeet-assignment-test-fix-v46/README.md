# CardCargo – OLAEET assignment test fix v46

Korrigiert den fehlerhaften Installer aus v45.

## Ursache des v45-Fehlers

Der Node-Aufruf in `apply.sh` war falsch angeordnet. Dadurch wurde
`tests/warehouse-package-assignment.test.ts` von Node direkt ausgeführt,
anstatt nur als Textdatei gepatcht zu werden. Node versuchte deshalb,
TypeScript-Aliase wie `@/lib/...` als npm-Pakete aufzulösen.

v46 verwendet korrekt:

```bash
node - "$TEST_FILE" <<'NODE'
...
NODE
```

Damit wird das Patch-JavaScript aus stdin ausgeführt und die `.ts`-Datei
nur gelesen und verändert.

## Inhaltlicher Fix

Die bestehenden Test-Fixtures `purchase-a`, `purchase-b` und `purchase-c`
werden um die durch v44 hinzugekommenen Pflichtfelder ergänzt:

- `seller_name`
- `price_amount`
- `currency`

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-assignment-test-fix-v46/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Datenbankmigration erforderlich.
