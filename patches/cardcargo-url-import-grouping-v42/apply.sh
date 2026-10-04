#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: bash \"$SCRIPT_DIR/apply.sh\" \"$HOME/CardCargo/poketracker-pwa\"" >&2
  exit 2
fi

if [[ ! -f "$TARGET/package.json" ]]; then
  echo "FEHLER: Kein CardCargo-App-Root: $TARGET" >&2
  exit 2
fi

node "$SCRIPT_DIR/patch.js" "$TARGET"

echo
echo "Patch cardcargo-url-import-grouping-v42 angewendet."
echo "Danach ausfuehren:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo "Kein supabase db push erforderlich."
