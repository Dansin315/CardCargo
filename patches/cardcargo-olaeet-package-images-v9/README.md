# CardCargo OLAEET package images v9

This patch extends the OLAEET warehouse-package module after v8.

## Behavior

- The create and edit forms show archived images of every currently selected Bunjang purchase.
- Purchase images are referenced dynamically and are **not copied** into the OLAEET package.
- Removing a purchase assignment therefore removes its images from the package view automatically, while the original purchase images remain intact.
- Manual OLAEET package images can be uploaded during creation or editing.
- Manual package images are stored separately in `warehouse_package_images` and remain when purchase assignments change.
- Existing manual package images can be marked for deletion while editing.
- Deleting an OLAEET package removes its manual image records and private Storage objects, but never deletes purchase images.

## Install

```bash
cd "$HOME/CardCargo/poketracker-pwa"
bash "$HOME/CardCargo/patches/cardcargo-olaeet-package-images-v9/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then run the full contents of:

```text
supabase/migrations/0005_warehouse_package_images.sql
```

in the Supabase SQL Editor.

Finally:

```bash
nvm use 22
rm -rf .next
rm -f tsconfig.tsbuildinfo
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev
```

## Storage

The patch reuses the existing private `listing-images` bucket:

- browser upload: `<user-id>/staging/warehouse-packages/...`
- final server-side archive: `<user-id>/warehouse-packages/<package-id>/...`

No new public bucket is created.
