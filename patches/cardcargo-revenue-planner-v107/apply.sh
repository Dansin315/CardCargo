#!/usr/bin/env bash
set -euo pipefail

APP="${1:-}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "Usage: bash apply.sh /path/to/poketracker-pwa" >&2
  exit 1
fi

printf '%s\n' "CardCargo v107 - temporary revenue planner"
printf 'App: %s\n\n' "$APP"

install_file() {
  local rel="$1"
  mkdir -p "$APP/$(dirname "$rel")"
  cp "$PATCH_DIR/files/$rel" "$APP/$rel"
  printf 'Installed/updated: %s\n' "$rel"
}

install_file "app/api/revenue-plan/purchases/route.ts"
install_file "app/(app)/revenue/plan/page.tsx"
install_file "components/revenue-plan-workspace.tsx"

node "$PATCH_DIR/patch-revenue-link.js" "$APP"

GLOBALS="$APP/app/globals.css"
if [[ ! -f "$GLOBALS" ]]; then
  echo "Could not find app/globals.css" >&2
  exit 1
fi
if ! grep -q "CardCargo v107 - Revenue planning workspace" "$GLOBALS"; then
  printf '\n\n' >> "$GLOBALS"
  cat "$PATCH_DIR/v107.css" >> "$GLOBALS"
  printf 'Patched: app/globals.css\n'
else
  printf 'CSS already present: app/globals.css\n'
fi

printf '\nDone. No Supabase migration is required. Plans are stored only in browser localStorage.\n'
