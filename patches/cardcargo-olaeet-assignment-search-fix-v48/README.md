# CardCargo – OLAEET assignment search fix v48

Behebt die nicht intuitiv funktionierende Suche in der Zuordnung von
Bunjang-Einkäufen zu OLAEET-Paketen.

## Ursache

v44 enthielt:

```ts
const alreadySelected = selectedPurchases.includes(purchase.id)
if (alreadySelected) return true
```

Dadurch wurden bereits ausgewählte Einkäufe nie durch Suche oder Datumsfilter
ausgeblendet. Besonders beim Bearbeiten eines bestehenden Pakets sah es daher
so aus, als funktioniere die Suche überhaupt nicht.

Außerdem enthielt der Suchindex nur die rohe `source_listing_id`. Eine Eingabe
wie `Bunjang #421476679` konnte daher nicht gefunden werden.

## Neu

Die Suche filtert jetzt alle Einträge, ohne die Auswahl zu verlieren.

Unterstützt werden unter anderem:

- Teil des Titels
- komplette oder teilweise Bunjang-ID
- `421476679`
- `Bunjang 421476679`
- `Bunjang #421476679`
- Verkäufer
- mehrere Begriffe gleichzeitig, z. B. `mew dansin315`

Groß-/Kleinschreibung und typische Satzzeichen spielen keine Rolle.

Bereits ausgewählte Einträge bleiben weiterhin ausgewählt, auch wenn sie durch
eine Suche vorübergehend ausgeblendet sind.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-assignment-search-fix-v48/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Datenbankmigration erforderlich.
