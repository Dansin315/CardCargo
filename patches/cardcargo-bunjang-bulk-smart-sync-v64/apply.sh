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

echo "CardCargo Bunjang Bulk/Smart Sync v64"
echo "App: $APP_ROOT"
echo

if [[ ! -d "$APP_ROOT/tools/bunjang-order-extractor" ]]; then
  echo "FEHLER: Der order-basierte Bunjang Extractor ist nicht installiert."
  echo "Bitte zuerst die v54+ Bunjang-Order-Extractor-Patches anwenden."
  exit 1
fi

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"

  if [[ -f "$dst" && ! -f "$dst.bak-v64" ]]; then
    cp "$dst" "$dst.bak-v64"
  fi

  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch v64 erfolgreich angewendet."
echo
echo "Keine neue Supabase-Migration erforderlich."
echo
echo "Die Browser-Extension hat jetzt zusaetzlich die lokale 'storage'-Berechtigung."
echo "Bitte die Extension in chrome://extensions bzw. edge://extensions neu laden."
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
