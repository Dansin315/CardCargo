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

echo "CardCargo OLAEET Tracking/Importer v51"
echo "App: $APP_ROOT"
echo

while IFS= read -r -d '' src; do
  rel="${src#"$FILES_DIR"/}"
  dst="$APP_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "Installiert/aktualisiert: $rel"
done < <(find "$FILES_DIR" -type f -print0)

node "$PATCH_DIR/patch.js" "$APP_ROOT"

MIG_DIR="$APP_ROOT/supabase/migrations"
mkdir -p "$MIG_DIR"

existing=""
for candidate in "$MIG_DIR"/*_purchase_domestic_tracking.sql; do
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
      migration_file="$MIG_DIR/${version}_purchase_domestic_tracking.sql"
      cp "$FILES_DIR/supabase/manual/v50_purchase_domestic_tracking.sql" "$migration_file"
      break
    fi
  done
fi

if [[ -z "$migration_file" ]]; then
  echo "FEHLER: Keine freie Migrationsnummer zwischen 0021 und 0099 gefunden."
  exit 1
fi

migration_version="$(basename "$migration_file" | cut -d_ -f1)"

echo
echo "Patch v51 erfolgreich angewendet."
echo
echo "Migration:"
echo "  $migration_file"
echo
echo "WICHTIG:"
echo "Wegen deiner noch nicht vollstaendig synchronisierten Supabase-Migrationshistorie"
echo "bitte NICHT blind 'npx supabase db push' ausfuehren."
echo
echo "1. Migration anzeigen:"
echo "   cat \"$migration_file\""
echo
echo "2. Deren SQL im Supabase SQL Editor ausfuehren."
echo
echo "3. Danach lokal als angewendet markieren:"
echo "   npx supabase migration repair $migration_version --status applied"
echo
echo "4. Code pruefen:"
echo "   npm run typecheck"
echo "   npm run lint"
echo "   npm run build"
