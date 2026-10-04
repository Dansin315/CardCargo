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

echo "CardCargo Bunjang Date Filter Fix v73"
echo "App: $APP_ROOT"
echo

if [[ ! -d "$APP_ROOT/tools/bunjang-order-extractor" ]]; then
  echo "FEHLER: Bunjang Order Extractor nicht gefunden."
  exit 1
fi

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v73" ]]; then
    cp "$dst" "$dst.bak-v73"
  fi
  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

echo
echo "Patch v73 erfolgreich angewendet."
echo "Keine Supabase-Migration erforderlich."
echo "Extension in chrome://extensions bzw. edge://extensions neu laden."
