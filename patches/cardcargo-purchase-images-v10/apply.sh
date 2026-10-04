#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/app" ]]; then
  echo "Error: target is not the poketracker-pwa project: $TARGET" >&2
  exit 1
fi

if [[ ! -f "$TARGET/supabase/migrations/0005_warehouse_package_images.sql" ]]; then
  echo "Error: OLAEET package image patch v9 is not installed." >&2
  exit 1
fi

if [[ ! -f "$TARGET/components/purchase-edit-form.tsx" ]]; then
  echo "Error: purchase edit/delete module v5 is not installed." >&2
  exit 1
fi

BACKUP="/tmp/cardcargo-purchase-images-v10-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"

while IFS= read -r -d '' source_file; do
  relative="${source_file#"$PATCH_DIR/files/"}"
  if [[ -f "$TARGET/$relative" ]]; then
    mkdir -p "$BACKUP/$(dirname "$relative")"
    cp -a "$TARGET/$relative" "$BACKUP/$relative"
  fi
done < <(find "$PATCH_DIR/files" -type f -print0)

cp -a "$PATCH_DIR/files/." "$TARGET/"

if ! grep -q "BEGIN CardCargo purchase image management v10" "$TARGET/app/globals.css"; then
  printf '\n\n' >> "$TARGET/app/globals.css"
  cat "$PATCH_DIR/purchase-image-styles.css" >> "$TARGET/app/globals.css"
fi

rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo purchase image management v10 applied."
echo "Backup of replaced files: $BACKUP"
echo "Next: run supabase/migrations/0006_purchase_image_categories.sql in Supabase."
echo "Then run: npm run typecheck && npm run lint && npm run test && npm run build"
