#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-$PWD}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="$PATCH_DIR/files"
THEME_FILE="$PATCH_DIR/cardcargo-global-v31.css"
GLOBAL_CSS="$TARGET/app/globals.css"
CSS_MARKER="/* v31: Figma-derived app-wide CardCargo design system */"
BACKUP_DIR="/tmp/cardcargo-global-design-v31-backup-$(date +%Y%m%d-%H%M%S)"

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

if [ ! -f "$GLOBAL_CSS" ]; then
  echo "Missing app/globals.css in target." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR/app"
cp "$GLOBAL_CSS" "$BACKUP_DIR/app/globals.css"

# Remove a prior v31 block if this patch is reapplied, then append the current one.
python3 - "$GLOBAL_CSS" "$THEME_FILE" "$CSS_MARKER" <<'PY'
from pathlib import Path
import sys

global_css = Path(sys.argv[1])
theme_file = Path(sys.argv[2])
marker = sys.argv[3]
text = global_css.read_text(encoding='utf-8')
idx = text.find(marker)
if idx >= 0:
    text = text[:idx].rstrip() + '\n'
text = text.rstrip() + '\n\n' + theme_file.read_text(encoding='utf-8').rstrip() + '\n'
global_css.write_text(text, encoding='utf-8')
PY

echo "CardCargo global Figma design v31 applied."
echo "Backup of replaced files: $BACKUP_DIR"
echo "No Supabase migration is required."
