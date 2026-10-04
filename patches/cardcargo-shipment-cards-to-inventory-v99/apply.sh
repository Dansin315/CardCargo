#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
if [[ -z "$APP_ROOT" ]]; then
  echo "Usage: bash apply.sh /path/to/CardCargo/poketracker-pwa"
  exit 2
fi
if [[ ! -d "$APP_ROOT" ]]; then
  echo "ERROR: App root not found: $APP_ROOT"
  exit 1
fi

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="$PATCH_DIR/files"

echo "CardCargo v99 - shipment cards to inventory"
echo "App: $APP_ROOT"
echo

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v99" ]]; then
    cp "$dst" "$dst.bak-v99"
  fi
  cp "$src" "$dst"
  echo "Installed/updated: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/scan-inventory-schema.js" "$APP_ROOT"
node "$PATCH_DIR/patch-ui.js" "$APP_ROOT"
node "$PATCH_DIR/patch-css.js" "$APP_ROOT" "$PATCH_DIR"

echo
echo "Patch v99 applied."
echo
echo "ONE-TIME SUPABASE STEP:"
echo "  Run this file in the Supabase SQL Editor:"
echo "  $APP_ROOT/supabase/manual/v99_inventory_shipment_sources.sql"
echo
echo "Then:"
echo "  rm -rf .next"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
