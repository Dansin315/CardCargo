#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-$PWD}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="$PATCH_DIR/files"
CSS_FILE="$PATCH_DIR/inventory-v32.css"
CSS_MARKER="/* v32: editable inventory lifecycle, delivery rows and inventory images */"
BACKUP_DIR="/tmp/cardcargo-inventory-v32-backup-$(date +%Y%m%d-%H%M%S)"

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

GLOBAL_CSS="$TARGET/app/globals.css"
if [ ! -f "$GLOBAL_CSS" ]; then
  echo "Missing app/globals.css in target." >&2
  exit 1
fi

if ! grep -Fq "$CSS_MARKER" "$GLOBAL_CSS"; then
  mkdir -p "$BACKUP_DIR/app"
  cp "$GLOBAL_CSS" "$BACKUP_DIR/app/globals.css"
  printf '\n' >> "$GLOBAL_CSS"
  cat "$CSS_FILE" >> "$GLOBAL_CSS"
fi

echo "CardCargo Inventory v32 applied."
echo "Backup of replaced files: $BACKUP_DIR"
echo "Required: run supabase/migrations/0017_inventory_lifecycle_images.sql in Supabase."
