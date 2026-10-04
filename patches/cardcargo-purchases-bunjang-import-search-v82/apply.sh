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

echo "CardCargo v82 - Bunjang Import + Einkaufssuche"
echo "App: $APP_ROOT"
echo

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"

  mkdir -p "$(dirname "$dst")"

  if [[ -f "$dst" && ! -f "$dst.bak-v82" ]]; then
    cp "$dst" "$dst.bak-v82"
  fi

  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch-site.js" "$APP_ROOT"

echo
echo "Patch v82 erfolgreich angewendet."
echo "Keine Supabase-Migration erforderlich."
echo
echo "Neu:"
echo "  - Bunjang Einkäufe importieren ersetzt die alten Bunjang-Aktionen"
echo "  - Sync-Optionen sind fest aktiviert und nicht mehr als Abschnitt sichtbar"
echo "  - Suche nach Einkauf, Einzelkarte, Tracking und gespeicherten Metadaten"
echo
echo "Empfohlen:"
echo "  rm -rf .next"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
