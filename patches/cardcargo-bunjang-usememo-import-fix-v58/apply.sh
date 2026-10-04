#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"

if [[ -z "$APP_ROOT" ]]; then
  echo "Verwendung:"
  echo "  bash apply.sh /pfad/zu/CardCargo/poketracker-pwa"
  exit 2
fi

FILE="$APP_ROOT/components/purchase-import-form.tsx"

if [[ ! -f "$FILE" ]]; then
  echo "FEHLER: Datei nicht gefunden:"
  echo "  $FILE"
  exit 1
fi

BACKUP="$FILE.bak-usememo-v58"
if [[ ! -f "$BACKUP" ]]; then
  cp "$FILE" "$BACKUP"
fi

node - "$FILE" <<'NODE'
const fs = require('fs')

const file = process.argv[2]
let src = fs.readFileSync(file, 'utf8')

const reactImport = src.match(/import\s*\{\s*([^}]*?)\s*\}\s*from\s*['"]react['"]/)

if (!reactImport) {
  throw new Error('v58: React-Import in purchase-import-form.tsx nicht gefunden.')
}

const imports = reactImport[1]
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

if (imports.includes('useMemo')) {
  console.log('v58: useMemo ist bereits importiert.')
  process.exit(0)
}

imports.push('useMemo')

const replacement = `import { ${imports.join(', ')} } from 'react'`

src =
  src.slice(0, reactImport.index) +
  replacement +
  src.slice(reactImport.index + reactImport[0].length)

fs.writeFileSync(file, src)

console.log('v58: useMemo zum React-Import hinzugefuegt.')
NODE

echo
echo "Patch cardcargo-bunjang-usememo-import-fix-v58 erfolgreich angewendet."
echo "Backup:"
echo "  $BACKUP"
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo
echo "Keine Datenbankmigration erforderlich."
