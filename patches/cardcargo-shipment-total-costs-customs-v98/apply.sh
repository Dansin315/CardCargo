#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
if [[ -z "$APP_ROOT" ]]; then
  echo "Usage: bash apply.sh /path/to/CardCargo/poketracker-pwa"
  exit 2
fi
if [[ ! -d "$APP_ROOT" ]]; then
  echo "ERROR: App root does not exist: $APP_ROOT"
  exit 1
fi

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="$PATCH_DIR/files"

echo "CardCargo v98 - shipment total costs and customs"
echo "App: $APP_ROOT"
echo

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v98" ]]; then
    cp "$dst" "$dst.bak-v98"
  fi
  cp "$src" "$dst"
  echo "Installed/updated: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch-css.js" "$APP_ROOT"

echo
echo "Patch v98 applied successfully."
echo "No Supabase migration required: customs costs are stored in shipments.raw_metadata."
echo
echo "Then run:"
echo "  rm -rf .next"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
