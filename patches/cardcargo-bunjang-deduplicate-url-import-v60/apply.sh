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

echo "CardCargo Bunjang URL/Order Dedup Repair v60"
echo "App: $APP_ROOT"
echo

# Reinstall/overwrite the two v59 routes. Safe after a partial v59 run.
while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"

  if [[ -f "$dst" && ! -f "$dst.bak-v60" ]]; then
    cp "$dst" "$dst.bak-v60"
  fi

  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch v60 erfolgreich angewendet."
echo
echo "Keine neue Supabase-Migration erforderlich."
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
