#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/app" ]]; then
  echo "Error: target is not the poketracker-pwa project: $TARGET" >&2
  exit 1
fi

if [[ ! -f "$TARGET/supabase/migrations/0006_purchase_image_categories.sql" ]]; then
  echo "Error: CardCargo v10 does not appear to be installed." >&2
  echo "Apply the previous CardCargo patches first." >&2
  exit 1
fi

if [[ ! -f "$TARGET/app/(app)/warehouse-packages/[id]/page.tsx" ]]; then
  echo "Error: OLAEET package management is missing." >&2
  exit 1
fi

BACKUP="/tmp/cardcargo-shipments-v11-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"

while IFS= read -r -d '' source_file; do
  relative="${source_file#"$PATCH_DIR/files/"}"
  if [[ -f "$TARGET/$relative" ]]; then
    mkdir -p "$BACKUP/$(dirname "$relative")"
    cp -a "$TARGET/$relative" "$BACKUP/$relative"
  fi
done < <(find "$PATCH_DIR/files" -type f -print0)

cp -a "$PATCH_DIR/files/." "$TARGET/"

if ! grep -q "BEGIN CardCargo international shipments v11" "$TARGET/app/globals.css"; then
  printf '\n\n' >> "$TARGET/app/globals.css"
  cat "$PATCH_DIR/international-shipment-styles.css" >> "$TARGET/app/globals.css"
fi

rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo international shipments v11 applied."
echo "Backup of replaced files: $BACKUP"
echo "Next: run supabase/migrations/0007_international_shipments.sql in Supabase."
echo "Then run: npm run typecheck && npm run lint && npm run test && npm run build"
