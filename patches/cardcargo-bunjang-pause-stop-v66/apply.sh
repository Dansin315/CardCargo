#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
if [[ -z "$APP_ROOT" ]]; then
  echo "Verwendung: bash apply.sh /pfad/zu/CardCargo/poketracker-pwa"
  exit 2
fi

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="$PATCH_DIR/files"
TARGET="$APP_ROOT/tools/bunjang-order-extractor"

if [[ ! -d "$TARGET" ]]; then
  echo "FEHLER: Bunjang Order Extractor nicht gefunden: $TARGET"
  exit 1
fi

echo "CardCargo Bunjang Pause/Stop v66"
echo "App: $APP_ROOT"
echo

for rel in manifest.json popup.html popup.js README.md; do
  src="$FILES_DIR/tools/bunjang-order-extractor/$rel"
  dst="$TARGET/$rel"
  if [[ ! -f "$src" ]]; then
    echo "FEHLER: Patch-Datei fehlt: $src"
    exit 1
  fi
  if [[ -f "$dst" && ! -f "$dst.bak-v66" ]]; then
    cp "$dst" "$dst.bak-v66"
  fi
  cp "$src" "$dst"
  echo "Installiert/aktualisiert: tools/bunjang-order-extractor/$rel"
done

echo
echo "Patch v66 erfolgreich angewendet."
echo "Keine Supabase-Migration erforderlich."
echo "Bitte die Extension in chrome://extensions bzw. edge://extensions neu laden."
