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

echo "CardCargo v97 - v96 enhancer mount recovery"
echo "App: $APP_ROOT"
echo

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v97" ]]; then
    cp "$dst" "$dst.bak-v97"
  fi
  cp "$src" "$dst"
  echo "Installed/updated: $rel"
done < <(find "$FILES_DIR" -type f -print0)

# v96 reached this step before it failed in patch-layout.js, so rerunning the
# shipment detail patch is intentionally safe and idempotent.
node "$PATCH_DIR/scan-image-schema.js" "$APP_ROOT"
node "$PATCH_DIR/patch-shipment-detail.js" "$APP_ROOT"
node "$PATCH_DIR/patch-enhancer-mount.js" "$APP_ROOT"
node "$PATCH_DIR/patch-css.js" "$APP_ROOT"

echo
echo "v97 applied successfully."
echo "The failing v96 patch-layout.js is no longer used."
echo "No Supabase migration is required."
echo
echo "Run:"
echo "  rm -rf .next"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
