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

echo "CardCargo Bunjang Listing URL Fix v81"
echo "App: $APP_ROOT"
echo

for required in \
  "$APP_ROOT/lib/bunjang-order-import.ts" \
  "$APP_ROOT/tools/bunjang-order-extractor/popup.js" \
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

  if [[ -f "$dst" && ! -f "$dst.bak-v81" ]]; then
    cp "$dst" "$dst.bak-v81"
  fi

  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch-lib.js" "$APP_ROOT"
node "$PATCH_DIR/patch-extractor.js" "$APP_ROOT"

echo
echo "Patch v81 erfolgreich angewendet."
echo "Keine Supabase-Migration erforderlich."
echo
echo "WICHTIG:"
echo "  1. Browser-Extension neu laden."
echo "  2. Bunjang Extraction erneut ausfuehren."
echo "  3. Das NEUE JSON in CardCargo einlesen."
echo "  4. Auf 'Listing-URLs erkannt: X/Y' achten."
