# CardCargo Team Rocket Catalog v37

Fixes Team Rocket card searches in `lib/card-catalog-server.ts`.

Supported examples:

- `Team Rocket's Mewtwo`
- `Team Rocket’s Mewtwo`
- `Team Rocket Mewtwo`
- `Team Rockets Mewtwo`
- `Team Rocket's Mimikyu`
- `Team Rocket`

For Japanese catalog searches the modern English ownership prefix is translated
to the printed Japanese prefix `ロケット団の`.

Apply:

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-team-rocket-catalog-v37/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then verify:

```bash
npm run typecheck
npm run lint
npm run build
```

No Supabase migration is required.
