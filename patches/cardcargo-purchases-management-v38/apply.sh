#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
if [[ -z "$APP_ROOT" ]]; then
  echo "Usage: bash apply.sh /path/to/poketracker-pwa" >&2
  exit 2
fi
if [[ ! -f "$APP_ROOT/package.json" ]]; then
  echo "FEHLER: package.json nicht gefunden unter: $APP_ROOT" >&2
  exit 2
fi
if [[ ! -f "$APP_ROOT/components/purchase-edit-form.tsx" ]]; then
  echo "FEHLER: CardCargo purchase-edit-form.tsx nicht gefunden." >&2
  exit 2
fi

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$APP_ROOT/components" "$APP_ROOT/app/api/purchases/bulk"
cp "$PATCH_DIR/files/components/purchase-list-workspace.tsx" "$APP_ROOT/components/purchase-list-workspace.tsx"
cp "$PATCH_DIR/files/app/api/purchases/bulk/route.ts" "$APP_ROOT/app/api/purchases/bulk/route.ts"

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch cardcargo-purchases-management-v38 angewendet."
echo "Danach ausführen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo "Kein supabase db push erforderlich."
