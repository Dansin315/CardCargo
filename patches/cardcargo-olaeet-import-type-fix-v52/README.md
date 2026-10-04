# CardCargo – OLAEET import type fix v52

Behebt:

```text
lib/olaeet-import.ts:162:16
TS7006: Parameter 'value' implicitly has an 'any' type.
```

## Ursache

`JSON.parse()` liefert `any`. Dadurch konnte TypeScript in der
`map(...).filter(...)`-Kette den Parameter von `filter` nicht sicher ableiten.

## Änderung

Vorher:

```ts
.filter((value): value is OlaeetImportRecord => Boolean(value))
```

Nachher:

```ts
.filter(
  (value: OlaeetImportRecord | null): value is OlaeetImportRecord =>
    Boolean(value),
)
```

Keine Änderung an Laufzeitlogik oder Datenbank.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-import-type-fix-v52/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```
