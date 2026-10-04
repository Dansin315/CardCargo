# CardCargo catalog null-detail fix v33

Behebt TypeScript-Fehler TS18047 (`detail` is possibly `null`) im Katalog-Fix.

Die problematische Verwendung von `detail.suffix` wird null-sicher gemacht und nutzt bei fehlendem Detail den Suffix des Brief-Namens als Fallback:

```ts
detail?.suffix ?? extractPokemonCardSuffix(detail?.name ?? brief.name)
```

## Anwendung

```bash
cd "$HOME/CardCargo/poketracker-pwa"
bash \
  "$HOME/CardCargo/patches/cardcargo-catalog-null-detail-fix-v33/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
```
