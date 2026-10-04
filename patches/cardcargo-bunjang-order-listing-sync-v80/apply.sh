#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"

if [[ -z "$APP_ROOT" ]]; then
  echo "Verwendung:"
  echo "  bash apply.sh /pfad/zu/CardCargo/poketracker-pwa"
  exit 2
fi

if [[ ! -d "$APP_ROOT" ]]; then
  echo "FEHLER: App-Root existiert nicht: $APP_ROOT"
  exit 1
fi

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="$PATCH_DIR/files"

echo "CardCargo Bunjang Order + Listing Sync v80"
echo "App: $APP_ROOT"
echo

for required in \
  "$APP_ROOT/lib/importer/parse-listing.ts" \
  "$APP_ROOT/lib/importer/download-image.ts" \
  "$APP_ROOT/lib/bunjang-order-import.ts" \
  "$APP_ROOT/components/bunjang-order-importer.tsx"
do
  if [[ ! -f "$required" ]]; then
    echo "FEHLER: erforderliche Datei fehlt: $required"
    exit 1
  fi
done

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"

  mkdir -p "$(dirname "$dst")"

  if [[ -f "$dst" && ! -f "$dst.bak-v80" ]]; then
    cp "$dst" "$dst.bak-v80"
  fi

  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch v80 erfolgreich angewendet."
echo "Keine Supabase-Migration erforderlich."
echo
echo "Empfohlen:"
echo "  rm -rf .next"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
