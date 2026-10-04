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

echo "CardCargo v84 - OLAEET internationale Sendungs-Extraction"
echo "App: $APP_ROOT"
echo

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v84" ]]; then
    cp "$dst" "$dst.bak-v84"
  fi
  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch-site.js" "$APP_ROOT"

echo
echo "Patch v84 erfolgreich angewendet."
echo "Keine Supabase-Migration erforderlich."
echo
echo "WICHTIG:"
echo "  1. OLAEET Extension in chrome://extensions bzw. edge://extensions neu laden."
echo "  2. OLAEET Shipping-Popup öffnen und Extraction neu erzeugen."
echo "  3. In CardCargo unter Sendungen die Extraction importieren."
echo
echo "Empfohlen:"
echo "  rm -rf .next"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
