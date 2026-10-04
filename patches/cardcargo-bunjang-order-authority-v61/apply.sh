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

node "$PATCH_DIR/patch.js" "$APP_ROOT"

echo
echo "Patch cardcargo-bunjang-order-authority-v61 erfolgreich angewendet."
echo
echo "Neue Prioritaet:"
echo "  Order -> Verkaeufer, Kaufdatum, Preis/Warenwert, Versandkosten"
echo "  Listing -> Titel, Beschreibung, URL, Listing-ID, Angebotsbilder"
echo
echo "Keine Datenbankmigration erforderlich."
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
