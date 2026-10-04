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

if [[ ! -d "$FILES_DIR" ]]; then
  echo "FEHLER: Patch-Dateien fehlen: $FILES_DIR"
  exit 1
fi

echo "CardCargo Bunjang Extractor + Sync v53"
echo "App: $APP_ROOT"
echo

if ! grep -q "domestic_tracking_number" "$APP_ROOT/lib/types.ts"; then
  echo "FEHLER: Die Tracking-Infrastruktur aus v50/v51 ist noch nicht installiert."
  echo "Bitte zuerst den OLAEET Tracking/Importer-Patch erfolgreich abschliessen."
  exit 1
fi

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v53" ]]; then
    cp "$dst" "$dst.bak-v53"
  fi
  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch v53 erfolgreich angewendet."
echo
echo "Keine neue Datenbankmigration erforderlich."
echo "Voraussetzung: domestic_carrier und domestic_tracking_number aus v50/v51 sind in Supabase vorhanden."
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo
echo "Browser-Extension laden aus:"
echo "  $APP_ROOT/tools/bunjang-extractor"
