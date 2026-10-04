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

if [[ ! -f "$APP_ROOT/lib/bunjang-order-import.ts" ]]; then
  echo "FEHLER: Der order-basierte Bunjang Extractor aus v54/v55 ist nicht installiert."
  exit 1
fi

if [[ ! -f "$APP_ROOT/app/api/purchases/bunjang-order-sync/route.ts" ]]; then
  echo "FEHLER: Bunjang Order Sync aus v54 fehlt."
  exit 1
fi

if [[ ! -f "$APP_ROOT/components/bunjang-order-importer.tsx" ]]; then
  echo "FEHLER: Bunjang Order Importer aus v54 fehlt."
  exit 1
fi

if [[ ! -f "$APP_ROOT/components/purchase-import-form.tsx" ]]; then
  echo "FEHLER: Bunjang URL-Importer nicht gefunden."
  exit 1
fi

echo "CardCargo Bunjang Enrichment v56"
echo "App: $APP_ROOT"
echo

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"

  if [[ -f "$dst" && ! -f "$dst.bak-v56" ]]; then
    cp "$dst" "$dst.bak-v56"
  fi

  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch v56 erfolgreich angewendet."
echo
echo "Keine neue Datenbankmigration erforderlich."
echo "Voraussetzungen in Supabase:"
echo "  purchases.domestic_carrier"
echo "  purchases.domestic_tracking_number"
echo "  purchases.bunjang_order_id"
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
