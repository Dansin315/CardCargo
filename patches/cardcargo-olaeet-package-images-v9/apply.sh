#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/app" ]]; then
  echo "Error: target is not the poketracker-pwa project: $TARGET" >&2
  exit 1
fi

if [[ ! -f "$TARGET/app/(app)/warehouse-packages/new/page.tsx" ]]; then
  echo "Error: OLAEET package module v6 is not installed." >&2
  exit 1
fi

if [[ ! -f "$TARGET/supabase/migrations/0004_one_olaeet_package_per_purchase.sql" ]]; then
  echo "Error: OLAEET assignment patch v8 is not installed." >&2
  exit 1
fi

if ! grep -q "80 Kalendertage" "$TARGET/components/warehouse-package-form.tsx"; then
  echo "Error: OLAEET date-only patch v7 is not installed." >&2
  exit 1
fi

BACKUP="/tmp/cardcargo-olaeet-images-v9-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"

while IFS= read -r -d '' source_file; do
  relative="${source_file#"$PATCH_DIR/files/"}"
  if [[ -f "$TARGET/$relative" ]]; then
    mkdir -p "$BACKUP/$(dirname "$relative")"
    cp -a "$TARGET/$relative" "$BACKUP/$relative"
  fi
done < <(find "$PATCH_DIR/files" -type f -print0)

cp -a "$PATCH_DIR/files/." "$TARGET/"

if ! grep -q "BEGIN CardCargo OLAEET package images v9" "$TARGET/app/globals.css"; then
  printf '\n\n' >> "$TARGET/app/globals.css"
  cat "$PATCH_DIR/olaeet-package-image-styles.css" >> "$TARGET/app/globals.css"
fi

rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo OLAEET package images v9 applied."
echo "Backup of replaced files: $BACKUP"
echo "Next: run supabase/migrations/0005_warehouse_package_images.sql in Supabase."
echo "Then run: npm run typecheck && npm run lint && npm run test && npm run build"
