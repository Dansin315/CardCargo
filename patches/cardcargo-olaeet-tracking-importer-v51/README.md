# CardCargo - OLAEET Tracking/Importer repair v51

v51 replaces the brittle v50 installer and is standalone.

The v50 failure happened because the installer expected one exact text block
inside `app/(app)/purchases/[id]/page.tsx`. v51 instead locates the existing
`definition-list` and inserts the tracking editor directly after its closing
`</dl>` tag, independent of the surrounding formatting.

It also:

- reinstalls all new v50 importer/extractor files, so a partial v50 run is safe;
- keeps the new `PurchaseRow` tracking fields optional to avoid breaking older fixtures;
- adds the purchase tracking columns to the detail-page Supabase select;
- adds the `OLAEET importieren` button robustly;
- creates the Supabase migration only after source patching succeeds.

Apply:

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-tracking-importer-v51/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Because the remote migration history is not fully reconciled yet, run the SQL
from the generated `*_purchase_domestic_tracking.sql` migration in the Supabase
SQL Editor instead of blindly using `npx supabase db push`. Then mark only that
migration version as applied with the command printed by the installer.

Finally run:

```bash
npm run typecheck
npm run lint
npm run build
```
