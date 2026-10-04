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

ROUTE="$APP_ROOT/app/api/revenue/route.ts"
WORKSPACE="$APP_ROOT/components/revenue-workspace.tsx"
if [[ ! -f "$ROUTE" || ! -f "$WORKSPACE" ]]; then
  echo "v102 Umsatz-Workspace wurde nicht gefunden. Bitte v102-v104 zuerst anwenden." >&2
  exit 1
fi
if ! grep -q "inventory_sales_values" "$ROUTE"; then
  echo "Unerwartete revenue route: inventory_sales_values fehlt." >&2
  exit 1
fi
if ! grep -q "cc102-sheet" "$WORKSPACE"; then
  echo "Unerwarteter revenue workspace: cc102-sheet fehlt." >&2
  exit 1
fi

echo "CardCargo v105 - Umsatz EUR-first, Setnummer und Inventar-Verkaufssync"
echo "App: $APP_ROOT"

backup_and_copy() {
  local rel="$1"
  local target="$APP_ROOT/$rel"
  local source="$PATCH_DIR/files/$rel"
  mkdir -p "$(dirname "$target")"
  if [[ -f "$target" && ! -f "$target.v105.bak" ]]; then
    cp "$target" "$target.v105.bak"
  fi
  cp "$source" "$target"
  echo "Installed/updated: $rel"
}

backup_and_copy "app/api/revenue/route.ts"
backup_and_copy "components/revenue-workspace.tsx"
node "$PATCH_DIR/patch-css.js" "$APP_ROOT"

echo
echo "v105 angewendet. Keine neue Supabase-Migration erforderlich."
echo "Danach: rm -rf .next && npm run typecheck && npm run lint && npm run build"
