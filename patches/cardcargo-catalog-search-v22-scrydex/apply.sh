#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-$PWD}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="$PATCH_DIR/files"
BACKUP_DIR="/tmp/cardcargo-catalog-search-v22-backup-$(date +%Y%m%d-%H%M%S)"

if [ ! -f "$TARGET/package.json" ]; then
  echo "Target does not look like poketracker-pwa: $TARGET" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR/"}"
  dst="$TARGET/$rel"
  mkdir -p "$(dirname "$dst")"

  if [ -f "$dst" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    cp "$dst" "$BACKUP_DIR/$rel"
  fi

  cp "$src" "$dst"
done < <(find "$FILES_DIR" -type f -print0)

echo "CardCargo catalog search v22 applied."
echo "Backup of replaced files: $BACKUP_DIR"
echo "Next: run supabase/migrations/0013_scrydex_catalog_provider.sql in Supabase."
