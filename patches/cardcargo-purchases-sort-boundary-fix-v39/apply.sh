#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-$(pwd)}"
PAGE="$APP_ROOT/app/(app)/purchases/page.tsx"
WORKSPACE="$APP_ROOT/components/purchase-list-workspace.tsx"
LIB="$APP_ROOT/lib/purchase-sorting.ts"

for f in "$PAGE" "$WORKSPACE"; do
  if [ ! -f "$f" ]; then
    echo "FEHLER: Datei nicht gefunden: $f" >&2
    exit 1
  fi
done

cp -n "$PAGE" "$PAGE.bak-purchase-sort-v39" || true
cp -n "$WORKSPACE" "$WORKSPACE.bak-purchase-sort-v39" || true
mkdir -p "$APP_ROOT/lib"

node - "$PAGE" "$WORKSPACE" "$LIB" <<'NODE'
const fs = require('fs')
const [pagePath, workspacePath, libPath] = process.argv.slice(2)

let page = fs.readFileSync(pagePath, 'utf8')
let workspace = fs.readFileSync(workspacePath, 'utf8')

const lib = `export const purchaseSortOptions = [
  ['date_desc', 'Kaufdatum: neu nach alt'],
  ['date_asc', 'Kaufdatum: alt nach neu'],
  ['price_desc', 'Preis: hoch nach niedrig'],
  ['price_asc', 'Preis: niedrig nach hoch'],
  ['created_desc', 'Erfasst: neu nach alt'],
  ['created_asc', 'Erfasst: alt nach neu'],
  ['updated_desc', 'Zuletzt geändert'],
  ['seller_asc', 'Verkäufer: A–Z'],
  ['seller_desc', 'Verkäufer: Z–A'],
  ['title_asc', 'Titel: A–Z'],
  ['title_desc', 'Titel: Z–A'],
] as const

export type PurchaseSortKey = (typeof purchaseSortOptions)[number][0]

export const purchaseSortKeys = new Set<PurchaseSortKey>(
  purchaseSortOptions.map(([key]) => key),
)
`

// Server page: never import runtime data from a 'use client' module.
page = page.replace(
  /import\s*\{\s*PurchaseListWorkspace\s*,\s*purchaseSortOptions\s*,\s*type\s+PurchaseSortKey\s*\}\s*from\s*['"]@\/components\/purchase-list-workspace['"]/,
  `import { PurchaseListWorkspace } from '@/components/purchase-list-workspace'\nimport { purchaseSortKeys, type PurchaseSortKey } from '@/lib/purchase-sorting'`,
)

// Handle an already partly edited import as well.
if (!page.includes("from '@/lib/purchase-sorting'")) {
  const marker = "import { PurchaseListWorkspace } from '@/components/purchase-list-workspace'"
  if (page.includes(marker)) {
    page = page.replace(marker, `${marker}\nimport { purchaseSortKeys, type PurchaseSortKey } from '@/lib/purchase-sorting'`)
  }
}

page = page.replace(
  /^const purchaseSortKeys = new Set<PurchaseSortKey>\(purchaseSortOptions\.map\(\(\[key\]\) => key\)\)\s*\n/m,
  '',
)

// Client workspace: move the shared runtime constant/type out of the client entry module.
workspace = workspace.replace(
  /\nexport const purchaseSortOptions = \[[\s\S]*?\] as const\n\nexport type PurchaseSortKey = \(typeof purchaseSortOptions\)\[number\]\[0\]\n/,
  '\n',
)

if (!workspace.includes("from '@/lib/purchase-sorting'")) {
  const importMarker = "import type { PurchaseStatus } from '@/lib/types'"
  if (!workspace.includes(importMarker)) {
    throw new Error('Import-Marker in purchase-list-workspace.tsx nicht gefunden.')
  }
  workspace = workspace.replace(
    importMarker,
    `${importMarker}\nimport { purchaseSortOptions, type PurchaseSortKey } from '@/lib/purchase-sorting'`,
  )
}

if (page.includes('purchaseSortOptions.map')) {
  throw new Error('Serverseite verwendet purchaseSortOptions.map weiterhin direkt.')
}
if (!page.includes('purchaseSortKeys.has')) {
  throw new Error('Sortier-Validierung auf der Purchases-Seite wurde nicht gefunden.')
}
if (!workspace.includes('purchaseSortOptions.map')) {
  throw new Error('Sortieroptionen werden im Client-Workspace nicht mehr gerendert.')
}
if (!workspace.startsWith("'use client'")) {
  throw new Error('purchase-list-workspace.tsx ist unerwartet keine Client Component.')
}

fs.writeFileSync(libPath, lib)
fs.writeFileSync(pagePath, page)
fs.writeFileSync(workspacePath, workspace)

console.log('v39 erfolgreich angewendet:')
console.log('  - Sortierkonfiguration nach lib/purchase-sorting.ts verschoben')
console.log('  - Server Component importiert keine Runtime-Werte mehr aus use-client-Modul')
console.log('  - Client-Workspace nutzt weiterhin dieselben Sortieroptionen')
console.log('Backups:')
console.log(`  ${pagePath}.bak-purchase-sort-v39`)
console.log(`  ${workspacePath}.bak-purchase-sort-v39`)
NODE

echo
echo "Naechste Schritte:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
