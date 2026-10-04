#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
if [[ -z "$APP_ROOT" ]]; then
  echo "FEHLER: App-Root fehlt."
  echo "Aufruf: bash apply.sh \"$HOME/CardCargo/poketracker-pwa\""
  exit 2
fi
APP_ROOT="$(cd "$APP_ROOT" && pwd)"
PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$APP_ROOT/package.json" || ! -f "$APP_ROOT/components/inventory-workspace.tsx" ]]; then
  echo "FEHLER: $APP_ROOT ist kein erwarteter CardCargo poketracker-pwa Ordner."
  exit 3
fi

mkdir -p \
  "$APP_ROOT/components" \
  "$APP_ROOT/lib" \
  "$APP_ROOT/app/api/inventory/catalog-search" \
  "$APP_ROOT/public/flags"

cp "$PATCH_ROOT/files/components/inventory-catalog-picker.tsx" "$APP_ROOT/components/inventory-catalog-picker.tsx"
cp "$PATCH_ROOT/files/components/inventory-language-flag.tsx" "$APP_ROOT/components/inventory-language-flag.tsx"
cp "$PATCH_ROOT/files/lib/inventory-language-flags.ts" "$APP_ROOT/lib/inventory-language-flags.ts"
cp "$PATCH_ROOT/files/app/api/inventory/catalog-search/route.ts" "$APP_ROOT/app/api/inventory/catalog-search/route.ts"
cp "$PATCH_ROOT"/files/public/flags/*.svg "$APP_ROOT/public/flags/"

node "$PATCH_ROOT/patch.js" "$APP_ROOT"

echo
echo "Patch cardcargo-inventory-catalog-flags-v34 angewendet."
echo "Geändert/neu:"
echo "  components/inventory-workspace.tsx"
echo "  components/inventory-catalog-picker.tsx"
echo "  components/inventory-language-flag.tsx"
echo "  lib/inventory-language-flags.ts"
echo "  app/api/inventory/catalog-search/route.ts"
echo "  public/flags/*.svg"
echo
echo "Jetzt ausführen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
