# CardCargo – OLAEET assignment search fix v49

Korrigiert den Installer-Fehler aus v48:

```text
Expression expected
SyntaxError: Invalid or unexpected token
```

## Ursache

Im eingebetteten JavaScript von v48 stand innerhalb eines Template-Strings:

```js
.replace(/[’‘`´]/g, "'")
```

Der Backtick beendete den Template-String vorzeitig.

v49 verwendet dafür eine sichere Unicode-Escape-Sequenz.

## Suchfix

Die Zuordnungssuche unterstützt danach:

- Titel
- Verkäufer
- rohe Bunjang-ID
- `Bunjang 421476679`
- `Bunjang #421476679`
- mehrere Begriffe gleichzeitig, z. B. `mew dansin315`

Bereits ausgewählte Einträge bleiben ausgewählt, können durch die Suche aber
vorübergehend ausgeblendet werden.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-assignment-search-fix-v49/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Datenbankmigration erforderlich.
