#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"

if [[ -z "$APP_ROOT" ]]; then
  echo "Verwendung:"
  echo "  bash apply.sh /pfad/zu/CardCargo/poketracker-pwa"
  exit 2
fi

FILE="$APP_ROOT/lib/olaeet-import.ts"

if [[ ! -f "$FILE" ]]; then
  echo "FEHLER: Datei nicht gefunden:"
  echo "  $FILE"
  exit 1
fi

BACKUP="$FILE.bak-olaeet-import-type-v52"
if [[ ! -f "$BACKUP" ]]; then
  cp "$FILE" "$BACKUP"
fi

node - "$FILE" <<'NODE'
const fs = require('fs')

const file = process.argv[2]
let src = fs.readFileSync(file, 'utf8')

const fixed =
  ".filter((value: OlaeetImportRecord | null): value is OlaeetImportRecord => Boolean(value))"

if (src.includes(fixed)) {
  console.log('v52 ist bereits angewendet.')
  process.exit(0)
}

const old =
  ".filter((value): value is OlaeetImportRecord => Boolean(value))"

if (!src.includes(old)) {
  throw new Error(
    'v52: Erwartete Filter-Zeile in lib/olaeet-import.ts nicht gefunden.',
  )
}

src = src.replace(old, fixed)

fs.writeFileSync(file, src)
console.log('v52: OlaeetImportRecord-Filter explizit typisiert.')
NODE

echo
echo "Patch cardcargo-olaeet-import-type-fix-v52 erfolgreich angewendet."
echo "Backup:"
echo "  $BACKUP"
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo
echo "Keine Datenbankmigration erforderlich."
