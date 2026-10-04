#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/app" ]]; then
  echo "Error: target is not the poketracker-pwa project: $TARGET" >&2
  exit 1
fi

for migration in \
  0005_warehouse_package_images.sql \
  0006_purchase_image_categories.sql \
  0007_international_shipments.sql; do
  if [[ ! -f "$TARGET/supabase/migrations/$migration" ]]; then
    echo "Error: required migration is missing: $migration" >&2
    echo "Apply the previous CardCargo patches through v11 first." >&2
    exit 1
  fi
done

if [[ ! -f "$TARGET/app/(app)/shipments/[id]/page.tsx" ]]; then
  echo "Error: international shipment management v11 is missing." >&2
  exit 1
fi

BACKUP="/tmp/cardcargo-shipment-images-v12-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"

while IFS= read -r -d '' source_file; do
  relative="${source_file#"$PATCH_DIR/files/"}"
  if [[ -f "$TARGET/$relative" ]]; then
    mkdir -p "$BACKUP/$(dirname "$relative")"
    cp -a "$TARGET/$relative" "$BACKUP/$relative"
  fi
done < <(find "$PATCH_DIR/files" -type f -print0)

cp -a "$PATCH_DIR/files/." "$TARGET/"

if ! grep -q "BEGIN CardCargo international shipment images v12" "$TARGET/app/globals.css"; then
  printf '\n\n' >> "$TARGET/app/globals.css"
  cat "$PATCH_DIR/international-shipment-image-styles.css" >> "$TARGET/app/globals.css"
fi

rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo international shipment images v12 applied."
echo "Backup of replaced files: $BACKUP"
echo "Next: run supabase/migrations/0008_shipment_images.sql in Supabase."
echo "Then run: npm run typecheck && npm run lint && npm run test && npm run build"
