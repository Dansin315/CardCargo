# CardCargo catalog fix v2

Robustere Variante des Katalog-Fixes. Sie ersetzt `resolveEnglishPokemonNames` ueber Funktionsmarker statt ueber einen exakten Volltextvergleich.

```bash
python3 apply_catalog_fix_v2.py $HOME/CardCargo
```

Danach:

```bash
cd $HOME/CardCargo/poketracker-pwa
git diff --check
npm run typecheck
npm run lint
npm run build
supabase db push
```
