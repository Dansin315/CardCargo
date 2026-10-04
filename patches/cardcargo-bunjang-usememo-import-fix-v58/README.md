# CardCargo – Bunjang useMemo import fix v58

Behebt:

```text
components/purchase-import-form.tsx
TS2304: Cannot find name 'useMemo'
```

## Ursache

v57 verwendet `useMemo()` für das Parsen des lokalen Bunjang-Order-Caches,
hat den Hook aber nicht sicher zum React-Import ergänzt.

## Fix

v58 ergänzt ausschließlich:

```ts
useMemo
```

zum bestehenden React-Import in:

```text
components/purchase-import-form.tsx
```

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-usememo-import-fix-v58/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
