#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-$PWD}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$PATCH_DIR/files/lib/card-catalog-server.ts"
DST="$TARGET/lib/card-catalog-server.ts"
BACKUP="/tmp/cardcargo-catalog-search-v23-card-catalog-server.ts"

if [ ! -f "$TARGET/package.json" ]; then
  echo "Target does not look like poketracker-pwa: $TARGET" >&2
  exit 1
fi

cp "$DST" "$BACKUP"
cp "$SRC" "$DST"

echo "CardCargo catalog search v23 (TCGdex only) applied."
echo "Backup: $BACKUP"
echo "If migration 0013_scrydex_catalog_provider.sql was run, also run 0014_remove_scrydex_provider.sql."
echo "If 0013 was never run, 0014 is optional."
