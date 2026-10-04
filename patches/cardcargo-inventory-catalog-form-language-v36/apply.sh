#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-}"
if [ -z "$ROOT" ]; then
  echo "Usage: bash apply.sh /path/to/poketracker-pwa" >&2
  exit 2
fi

if [ ! -f "$ROOT/components/inventory-workspace.tsx" ]; then
  echo "FEHLER: inventory-workspace.tsx nicht gefunden: $ROOT/components/inventory-workspace.tsx" >&2
  exit 1
fi

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

backup_file() {
  local file="$1"
  if [ -f "$file" ]; then
    cp "$file" "$file.bak-v36-$STAMP"
  fi
}

backup_file "$ROOT/components/inventory-catalog-picker.tsx"
backup_file "$ROOT/lib/inventory-language-flags.ts"
backup_file "$ROOT/components/inventory-workspace.tsx"

mkdir -p "$ROOT/components" "$ROOT/lib"
cp "$PATCH_DIR/files/components/inventory-catalog-picker.tsx" "$ROOT/components/inventory-catalog-picker.tsx"
cp "$PATCH_DIR/files/lib/inventory-language-flags.ts" "$ROOT/lib/inventory-language-flags.ts"

node - "$ROOT/components/inventory-workspace.tsx" <<'NODE'
const fs = require('fs')
const file = process.argv[2]
let src = fs.readFileSync(file, 'utf8')

if (!src.includes('<InventoryCatalogPicker')) {
  throw new Error('InventoryCatalogPicker wurde in inventory-workspace.tsx nicht gefunden. Bitte zuerst v35 anwenden oder die Datei prüfen.')
}

if (!src.includes('onLanguageChange=')) {
  const pickerStart = src.indexOf('<InventoryCatalogPicker')
  const pickerEnd = src.indexOf('/>', pickerStart)
  if (pickerEnd < 0) throw new Error('InventoryCatalogPicker-Block konnte nicht vollständig gelesen werden.')

  const block = src.slice(pickerStart, pickerEnd)
  const languagePattern = /language=\{draft\.language\}/
  const match = block.match(languagePattern)
  if (!match || match.index === undefined) {
    throw new Error('language={draft.language} wurde im InventoryCatalogPicker-Block nicht gefunden.')
  }

  const insertAt = pickerStart + match.index + match[0].length
  const addition = `\n              onLanguageChange={(nextLanguage) =>\n                setDraft((current) => ({ ...current, language: nextLanguage }))\n              }\n`
  src = src.slice(0, insertAt) + addition + src.slice(insertAt)
  fs.writeFileSync(file, src)
  console.log('  - onLanguageChange im InventoryCatalogPicker ergänzt.')
} else {
  console.log('  - onLanguageChange bereits vorhanden.')
}
NODE

echo "Patch cardcargo-inventory-catalog-form-language-v36 angewendet."
echo "Geändert:"
echo "  - components/inventory-catalog-picker.tsx"
echo "  - lib/inventory-language-flags.ts"
echo "  - components/inventory-workspace.tsx (Language callback)"
echo
echo "Danach ausführen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
