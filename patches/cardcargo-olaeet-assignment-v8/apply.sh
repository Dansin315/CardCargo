#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/app" ]]; then
  echo "Error: target is not the poketracker-pwa project: $TARGET" >&2
  exit 1
fi

if [[ ! -f "$TARGET/app/(app)/warehouse-packages/new/page.tsx" ]]; then
  echo "Error: OLAEET package module v6 is not installed in the target project." >&2
  exit 1
fi

if ! grep -q "80 Kalendertage" "$TARGET/components/warehouse-package-form.tsx"; then
  echo "Error: OLAEET date-only patch v7 does not appear to be installed." >&2
  exit 1
fi

BACKUP="/tmp/cardcargo-olaeet-assignment-v8-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"

for path in \
  "app/(app)/warehouse-packages/new/page.tsx" \
  "app/(app)/warehouse-packages/[id]/edit/page.tsx" \
  "components/warehouse-package-form.tsx" \
  "lib/warehouse-packages.ts"; do
  if [[ -f "$TARGET/$path" ]]; then
    mkdir -p "$BACKUP/$(dirname "$path")"
    cp "$TARGET/$path" "$BACKUP/$path"
  fi
done

cp -a "$PATCH_DIR/files/." "$TARGET/"
rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo single OLAEET package assignment v8 applied."
echo "Backup of replaced files: $BACKUP"
echo "Next: run supabase/migrations/0004_one_olaeet_package_per_purchase.sql in Supabase."
echo "Then run: npm run typecheck && npm run lint && npm run test && npm run build"
