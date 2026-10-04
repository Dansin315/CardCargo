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
echo "CardCargo Bunjang Validated/Persistent Export v70"
echo "App: $APP_ROOT"
echo
while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v70" ]]; then cp "$dst" "$dst.bak-v70"; fi
  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)
echo
echo "Patch v70 erfolgreich angewendet."
echo "Keine Supabase-Migration erforderlich."
echo "Extension in chrome://extensions bzw. edge://extensions neu laden."
echo "v70 verwendet einen neuen sauberen Netzwerk-Capture-Store."
