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

echo "CardCargo Bunjang Order Extractor v54"
echo "App: $APP_ROOT"
echo

node "$PATCH_DIR/patch.js" "$APP_ROOT"

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && ! -f "$dst.bak-v54" ]]; then
    cp "$dst" "$dst.bak-v54"
  fi
  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

MIG_DIR="$APP_ROOT/supabase/migrations"
mkdir -p "$MIG_DIR"

existing=""
for candidate in "$MIG_DIR"/*_bunjang_order_id.sql; do
  if [[ -f "$candidate" ]]; then
    existing="$candidate"
    break
  fi
done

if [[ -n "$existing" ]]; then
  migration_file="$existing"
else
  migration_file=""
  for n in $(seq 21 99); do
    version="$(printf "%04d" "$n")"
    if ! compgen -G "$MIG_DIR/${version}_*.sql" > /dev/null; then
      migration_file="$MIG_DIR/${version}_bunjang_order_id.sql"
      cp "$FILES_DIR/supabase/manual/v54_bunjang_order_id.sql" "$migration_file"
      break
    fi
  done
fi

if [[ -z "$migration_file" ]]; then
  echo "FEHLER: Keine freie Migrationsnummer gefunden."
  exit 1
fi

migration_version="$(basename "$migration_file" | cut -d_ -f1)"

echo
echo "v54 erfolgreich angewendet."
echo
echo "Neue Migration:"
echo "  $migration_file"
echo
echo "Wegen deiner noch nicht vollstaendig synchronisierten Supabase-Migrationshistorie:"
echo "  1. NICHT blind 'npx supabase db push' ausfuehren."
echo "  2. SQL aus dieser Migration im Supabase SQL Editor ausfuehren."
echo "  3. Danach:"
echo "     npx supabase migration repair $migration_version --status applied"
echo
echo "Danach:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo
echo "Neue Extension:"
echo "  $APP_ROOT/tools/bunjang-order-extractor"
