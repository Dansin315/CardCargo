#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$APP_ROOT" ]]; then
  echo "Usage: bash apply.sh /path/to/poketracker-pwa" >&2
  exit 2
fi

if [[ ! -d "$APP_ROOT" ]]; then
  echo "App directory not found: $APP_ROOT" >&2
  exit 2
fi

echo "CardCargo v106 - manual/date-range Bunjang purchases for international shipments"
echo "App: $APP_ROOT"
echo

install_file() {
  local rel="$1"
  local src="$PATCH_ROOT/files/$rel"
  local dst="$APP_ROOT/$rel"
  if [[ ! -f "$src" ]]; then
    echo "Patch file missing: $src" >&2
    exit 3
  fi
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v106" ]]; then
    cp "$dst" "$dst.bak-v106"
  fi
  cp "$src" "$dst"
  echo "Installed/updated: $rel"
}

install_file "app/api/shipments/bunjang-purchases/route.ts"
install_file "components/shipment-bunjang-purchase-manager.tsx"
install_file "supabase/manual/v106_shipment_bunjang_purchases.sql"

node "$PATCH_ROOT/patch-inventory-import.js" "$APP_ROOT"
node "$PATCH_ROOT/patch-shipment-costs.js" "$APP_ROOT"
node "$PATCH_ROOT/patch-ui.js" "$APP_ROOT"
node "$PATCH_ROOT/patch-css.js" "$APP_ROOT"

echo
echo "v106 applied."
echo "IMPORTANT: Run supabase/manual/v106_shipment_bunjang_purchases.sql once in the Supabase SQL editor."
echo "Then run: rm -rf .next && npm run typecheck && npm run lint && npm run build"
