#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-$PWD}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/tmp/cardcargo-v26-1-type-fix-backup-$(date +%Y%m%d-%H%M%S)"

if [ ! -f "$TARGET/package.json" ]; then
  echo "Target does not look like poketracker-pwa: $TARGET" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR/lib"
for file in card-catalog-types.ts purchase-item-schema.ts purchase-items.ts; do
  if [ -f "$TARGET/lib/$file" ]; then
    cp "$TARGET/lib/$file" "$BACKUP_DIR/lib/$file"
  fi
  cp "$PATCH_DIR/files/lib/$file" "$TARGET/lib/$file"
done

echo "CardCargo v26.1 catalog-provider type fix applied."
echo "Backup: $BACKUP_DIR"
echo "No database migration is required."
