# CardCargo v97 - v96 Enhancer Mount Recovery

This is the recovery patch for the v96 installer failure:

```text
Error: Could not find <main> in app layout.
```

## Cause

v96 tried to mount `ArchivedImageDownloadEnhancer` by locating a literal
`<main>` element inside `app/(app)/layout.tsx`. The current CardCargo layout
structure does not expose that element directly in the source file.

The shipment-detail changes had already been applied before the installer
stopped, but the archive-download enhancer and v96 CSS were not completed.

## v97 fix

- Does **not** use `patch-layout.js`.
- Mounts the download enhancer through the existing `AppNavigation` client
  component. The enhancer renders no DOM and only activates on:
  - `/purchases/[id]` for Bunjang purchase image archives;
  - `/warehouse-packages/[id]` for OLAEET package image archives.
- Falls back to mounting directly on those two detail pages if needed.
- Reruns the v96 shipment-detail patch safely/idempotently.
- Applies the v96 shipment/image CSS that was skipped by the failed installer.
- Cleans the image-schema scanner so names such as `listing-images`,
  `shipment_images`, and `inventory_unit_images` are not mistaken for OLAEET
  package-image database tables.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-image-enhancer-mount-fix-v97/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

No new Supabase migration is required.
