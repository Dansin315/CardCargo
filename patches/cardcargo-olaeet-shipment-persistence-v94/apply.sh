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
FILES_DIR="$PATCH_DIR/files"

echo "CardCargo OLAEET Shipment Persistence v94"
echo "App: $APP_ROOT"
echo

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v94" ]]; then
    cp "$dst" "$dst.bak-v94"
  fi
  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch-shipment-detail.js" "$APP_ROOT"
node "$PATCH_DIR/patch-css.js" "$APP_ROOT" "$PATCH_DIR"

echo
echo "Patch v94 angewendet."
echo
echo "WICHTIG: v94 benoetigt einmalig die enthaltene SQL-Erweiterung:"
echo "  $APP_ROOT/supabase/manual/v94_olaeet_shipment_persistence.sql"
echo
echo "Fuehre diese Datei im Supabase SQL Editor aus."
echo "Nicht blind supabase db push verwenden, solange deine Remote-Migrationshistorie abweicht."
echo
echo "Danach:"
echo "  rm -rf .next"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
