#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$PWD}"

if [[ ! -f "$PROJECT_DIR/package.json" || ! -d "$PROJECT_DIR/app" ]]; then
  echo "Fehler: $PROJECT_DIR sieht nicht wie der CardCargo-Projektordner aus." >&2
  echo "Beispiel: bash $PATCH_DIR/apply.sh $HOME/CardCargo/poketracker-pwa" >&2
  exit 1
fi

cd "$PROJECT_DIR"

echo "Prüfe Patch gegen: $PROJECT_DIR"
patch --dry-run -p1 < "$PATCH_DIR/cardcargo-edit-delete-v5.patch"

echo "Wende Patch an ..."
patch -p1 < "$PATCH_DIR/cardcargo-edit-delete-v5.patch"

rm -rf .next
rm -f tsconfig.tsbuildinfo

echo
printf '%s\n' "Patch erfolgreich angewendet. Führe nun aus:" \
  "  nvm use 22" \
  "  npm run typecheck" \
  "  npm run lint" \
  "  npm run test" \
  "  npm run build"
