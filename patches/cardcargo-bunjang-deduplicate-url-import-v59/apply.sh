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

echo "CardCargo Bunjang URL/Order Dedup v59"
echo "App: $APP_ROOT"
echo

if [[ ! -f "$APP_ROOT/components/purchase-import-form.tsx" ]]; then
  echo "FEHLER: purchase-import-form.tsx nicht gefunden."
  exit 1
fi
if [[ ! -f "$APP_ROOT/lib/bunjang-order-import.ts" ]]; then
  echo "FEHLER: Bunjang Order Extractor v54/v55 fehlt."
  exit 1
fi

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v59" ]]; then
    cp "$dst" "$dst.bak-v59"
  fi
  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch v59 erfolgreich angewendet."
echo "Keine neue Datenbankmigration erforderlich."
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
