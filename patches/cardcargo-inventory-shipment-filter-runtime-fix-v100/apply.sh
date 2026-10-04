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
SRC="$PATCH_DIR/files/components/inventory-shipment-filter.tsx"
DST="$APP_ROOT/components/inventory-shipment-filter.tsx"

mkdir -p "$(dirname "$DST")"
if [[ -f "$DST" && ! -f "$DST.bak-v100" ]]; then
  cp "$DST" "$DST.bak-v100"
fi
cp "$SRC" "$DST"

echo "CardCargo v100 - Inventory shipment filter runtime fix"
echo "Updated: components/inventory-shipment-filter.tsx"
echo "No Supabase migration required."
