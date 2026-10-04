#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"

if [ -z "$APP_ROOT" ]; then
  echo "Usage: bash apply.sh /path/to/poketracker-pwa" >&2
  exit 2
fi

if [ ! -f "$APP_ROOT/lib/card-catalog-server.ts" ]; then
  echo "ERROR: lib/card-catalog-server.ts not found under: $APP_ROOT" >&2
  exit 1
fi

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch cardcargo-team-rocket-catalog-v37 applied."
echo "Next:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
