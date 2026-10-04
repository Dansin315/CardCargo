#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-$(pwd)}"
WORKSPACE="$APP_ROOT/components/purchase-list-workspace.tsx"
PAGE="$APP_ROOT/app/(app)/purchases/page.tsx"

for file in "$WORKSPACE" "$PAGE"; do
  if [ ! -f "$file" ]; then
    echo "FEHLER: Datei nicht gefunden: $file" >&2
    exit 1
  fi
done

cp -n "$WORKSPACE" "$WORKSPACE.bak-filter-lint-v41" || true
cp -n "$PAGE" "$PAGE.bak-filter-lint-v41" || true

APP_ROOT="$APP_ROOT" node <<'NODE'
const fs = require('fs')
const path = require('path')

const root = process.env.APP_ROOT
const workspacePath = path.join(root, 'components', 'purchase-list-workspace.tsx')
const pagePath = path.join(root, 'app', '(app)', 'purchases', 'page.tsx')

let workspace = fs.readFileSync(workspacePath, 'utf8')
let page = fs.readFileSync(pagePath, 'utf8')
let workspaceChanged = false
let pageChanged = false

// 1) useEffect is no longer needed for synchronising URL props into local filter state.
if (workspace.includes("import { useEffect, useMemo, useState } from 'react'")) {
  workspace = workspace.replace(
    "import { useEffect, useMemo, useState } from 'react'",
    "import { useMemo, useState } from 'react'",
  )
  workspaceChanged = true
} else if (/import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*['\"]react['\"]/.test(workspace)) {
  workspace = workspace.replace(
    /import\s*\{([^}]*)\}\s*from\s*(['\"]react['\"])/,
    (full, imports, source) => {
      const cleaned = imports
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part && part !== 'useEffect')
        .join(', ')
      return `import { ${cleaned} } from ${source}`
    },
  )
  workspaceChanged = true
}

const effectRegex = /\n\s*useEffect\(\(\) => \{\s*\n\s*setFilterStatus\(statusFilter\)\s*\n\s*setFilterDateFrom\(dateFrom\)\s*\n\s*setFilterDateTo\(dateTo\)\s*\n\s*\}, \[statusFilter, dateFrom, dateTo\]\)\s*\n/
if (effectRegex.test(workspace)) {
  workspace = workspace.replace(effectRegex, '\n')
  workspaceChanged = true
} else if (workspace.includes('setFilterStatus(statusFilter)') || workspace.includes('setFilterDateFrom(dateFrom)') || workspace.includes('setFilterDateTo(dateTo)')) {
  throw new Error('Der v40-Filter-Synchronisations-Effect wurde gefunden, aber nicht in der erwarteten Struktur. Keine unsichere Teiländerung vorgenommen.')
}

// 2) Force a fresh filter form state whenever URL-driven purchase view identity changes.
if (!/\bkey=\{\[sort, statusFilter, dateFrom, dateTo, page\]\.join\('\|'\)\}/.test(page)) {
  const marker = '<PurchaseListWorkspace\n'
  if (!page.includes(marker)) {
    throw new Error('PurchaseListWorkspace-Aufruf in purchases/page.tsx nicht gefunden.')
  }
  page = page.replace(
    marker,
    `<PurchaseListWorkspace\n          key={[sort, statusFilter, dateFrom, dateTo, page].join('|')}\n`,
  )
  pageChanged = true
}

// Safety checks
if (/\buseEffect\b/.test(workspace)) {
  throw new Error('useEffect ist nach dem Patch noch in purchase-list-workspace.tsx vorhanden. Abbruch.')
}
if (!page.includes("key={[sort, statusFilter, dateFrom, dateTo, page].join('|')}")) {
  throw new Error('Der Reset-Key konnte nicht gesetzt werden. Abbruch.')
}

if (workspaceChanged) fs.writeFileSync(workspacePath, workspace)
if (pageChanged) fs.writeFileSync(pagePath, page)

console.log('purchase-list-workspace.tsx:', workspaceChanged ? 'aktualisiert' : 'bereits korrigiert')
console.log('purchases/page.tsx:', pageChanged ? 'Reset-Key ergänzt' : 'Reset-Key bereits vorhanden')
NODE

echo
echo "CardCargo purchase filter lint fix v41 erfolgreich angewendet."
echo "Backups:"
echo "  $WORKSPACE.bak-filter-lint-v41"
echo "  $PAGE.bak-filter-lint-v41"
echo
echo "Naechste Schritte:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
