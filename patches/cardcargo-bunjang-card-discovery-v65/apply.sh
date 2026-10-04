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

echo "CardCargo Bunjang Card Discovery v65"
echo "App: $APP_ROOT"
echo

if [[ ! -d "$APP_ROOT/tools/bunjang-order-extractor" ]]; then
  echo "FEHLER: Der Bunjang Order Extractor ist nicht installiert."
  exit 1
fi

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"

  if [[ -f "$dst" && ! -f "$dst.bak-v65" ]]; then
    cp "$dst" "$dst.bak-v65"
  fi

  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch v65 erfolgreich angewendet."
echo
echo "Keine neue Supabase-Migration erforderlich."
echo
echo "WICHTIG: manifest.json hat neue tabs/host_permissions."
echo "Die Extension in chrome://extensions bzw. edge://extensions neu laden."
echo
echo "Danach Code pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
