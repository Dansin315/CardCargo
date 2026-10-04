#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
if [[ -z "$APP_ROOT" ]]; then
  echo "Verwendung: bash apply.sh /pfad/zu/CardCargo/poketracker-pwa"
  exit 2
fi
if [[ ! -d "$APP_ROOT" ]]; then
  echo "FEHLER: App-Root existiert nicht: $APP_ROOT"
  exit 1
fi

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "CardCargo v101 - Inventory hydration structure fix"
echo "App: $APP_ROOT"
echo

node "$PATCH_DIR/repair-inventory-workspace.js" "$APP_ROOT"

echo
echo "Patch v101 erfolgreich angewendet."
echo "Keine Supabase-Migration erforderlich."
echo
echo "Danach:"
echo "  rm -rf .next"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
