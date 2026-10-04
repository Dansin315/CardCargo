#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-$PWD}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$PATCH_DIR/files/lib/card-catalog-server.ts"
DST="$TARGET/lib/card-catalog-server.ts"
BACKUP="/tmp/cardcargo-catalog-search-v24-card-catalog-server.ts"

if [ ! -f "$TARGET/package.json" ]; then
  echo "Target does not look like poketracker-pwa: $TARGET" >&2
  exit 1
fi

cp "$DST" "$BACKUP"
cp "$SRC" "$DST"

echo "CardCargo catalog search v24 (modifier-aware) applied."
echo "Backup: $BACKUP"
echo "No database migration is required."
