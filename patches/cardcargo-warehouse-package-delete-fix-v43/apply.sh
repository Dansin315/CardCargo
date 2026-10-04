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

MIG_DIR="$APP_ROOT/supabase/migrations"
if [[ ! -d "$MIG_DIR" ]]; then
  echo "FEHLER: Supabase-Migrationsordner nicht gefunden: $MIG_DIR"
  exit 1
fi

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_SRC="$PATCH_DIR/warehouse_package_delete_cascade.sql"

if [[ ! -f "$SQL_SRC" ]]; then
  echo "FEHLER: SQL-Datei fehlt: $SQL_SRC"
  exit 1
fi

existing=""
for candidate in "$MIG_DIR"/*_warehouse_package_delete_cascade.sql; do
  if [[ -f "$candidate" ]]; then
    existing="$candidate"
    break
  fi
done

if [[ -n "$existing" ]]; then
  echo "Bereits vorhanden: $existing"
  echo "Keine weitere Migration angelegt."
  exit 0
fi

target=""
for n in $(seq 20 99); do
  version="$(printf "%04d" "$n")"
  if ! compgen -G "$MIG_DIR/${version}_*.sql" > /dev/null; then
    target="$MIG_DIR/${version}_warehouse_package_delete_cascade.sql"
    break
  fi
done

if [[ -z "$target" ]]; then
  echo "FEHLER: Keine freie Migrationsnummer zwischen 0020 und 0099 gefunden."
  exit 1
fi

cp "$SQL_SRC" "$target"

echo
echo "Patch cardcargo-warehouse-package-delete-fix-v43 angewendet."
echo "Neue Migration:"
echo "  $target"
echo
echo "Naechster Schritt:"
echo "  cd "$APP_ROOT""
echo "  supabase db push"
