#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$APP_ROOT" || ! -d "$APP_ROOT" ]]; then
  echo "Usage: bash apply.sh /path/to/poketracker-pwa" >&2
  exit 1
fi

if [[ ! -f "$APP_ROOT/package.json" ]]; then
  echo "Kein CardCargo/Next.js-Projekt: $APP_ROOT" >&2
  exit 1
fi

echo "CardCargo v102 - Umsatz workspace"
echo "App: $APP_ROOT"

copy_file() {
  local rel="$1"
  mkdir -p "$(dirname "$APP_ROOT/$rel")"
  cp "$PATCH_DIR/files/$rel" "$APP_ROOT/$rel"
  echo "Installed/updated: $rel"
}

copy_file "app/(app)/revenue/page.tsx"
copy_file "app/api/revenue/route.ts"
copy_file "components/revenue-workspace.tsx"
copy_file "supabase/manual/v102_revenue_workspace.sql"

node "$PATCH_DIR/patch-navigation.js" "$APP_ROOT"
node "$PATCH_DIR/patch-css.js" "$APP_ROOT"

echo
echo "v102 angewendet."
echo "WICHTIG: Supabase SQL Editor -> supabase/manual/v102_revenue_workspace.sql einmal ausführen."
echo "Danach: rm -rf .next && npm run typecheck && npm run lint && npm run build"
