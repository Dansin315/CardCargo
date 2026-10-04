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

TARGET="$APP_ROOT/app/api/revenue/route.ts"
if [[ ! -f "$TARGET" ]]; then
  echo "Fehlt: $TARGET" >&2
  echo "v102 muss zuerst installiert sein." >&2
  exit 1
fi

echo "CardCargo v103 - Umsatz TypeScript Fix"
echo "App: $APP_ROOT"

node "$PATCH_DIR/patch-route.js" "$APP_ROOT"

echo
echo "v103 angewendet. Keine Datenbankmigration erforderlich."
echo "Danach: rm -rf .next && npm run typecheck && npm run lint && npm run build"
