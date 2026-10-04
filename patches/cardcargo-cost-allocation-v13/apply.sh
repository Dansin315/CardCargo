#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-$PWD}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES="$PATCH_DIR/files"

if [[ ! -f "$TARGET/package.json" || ! -f "$TARGET/lib/shipments.ts" ]]; then
  echo "Target does not look like the CardCargo Next.js app: $TARGET" >&2
  exit 1
fi

if [[ ! -f "$TARGET/supabase/migrations/0008_shipment_images.sql" ]]; then
  echo "Cost allocation v13 expects shipment images v12 / migration 0008 first." >&2
  exit 1
fi

BACKUP="/tmp/cardcargo-cost-allocation-v13-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP"
for file in "app/(app)/shipments/[id]/page.tsx" "app/(app)/purchases/[id]/page.tsx" "app/globals.css"; do
  if [[ -f "$TARGET/$file" ]]; then
    mkdir -p "$BACKUP/$(dirname "$file")"
    cp "$TARGET/$file" "$BACKUP/$file"
  fi
done

cp -a "$FILES/." "$TARGET/"

MARKER='/* CardCargo cost allocation v13 */'
if ! grep -Fq "$MARKER" "$TARGET/app/globals.css"; then
  printf '\n' >> "$TARGET/app/globals.css"
  cat "$PATCH_DIR/cost-allocation-styles.css" >> "$TARGET/app/globals.css"
fi

rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo cost allocation v13 applied."
echo "Backup of replaced files: $BACKUP"
echo "Next: run supabase/migrations/0010_shipment_cost_allocation.sql in Supabase."
