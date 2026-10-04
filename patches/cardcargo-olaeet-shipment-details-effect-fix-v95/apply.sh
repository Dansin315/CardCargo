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
SRC="$PATCH_DIR/files/components/olaeet-shipment-record-details.tsx"
DST="$APP_ROOT/components/olaeet-shipment-record-details.tsx"

if [[ ! -f "$DST" ]]; then
  echo "FEHLER: Zieldatei nicht gefunden: $DST"
  exit 1
fi

if [[ ! -f "$DST.bak-v95" ]]; then
  cp "$DST" "$DST.bak-v95"
fi

cp "$SRC" "$DST"

echo "Aktualisiert: components/olaeet-shipment-record-details.tsx"
echo "Patch v95 erfolgreich angewendet."
echo "Keine Supabase-Migration erforderlich."
