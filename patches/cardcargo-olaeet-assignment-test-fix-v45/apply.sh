#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"

if [[ -z "$APP_ROOT" ]]; then
  echo "Verwendung:"
  echo "  bash apply.sh /pfad/zu/CardCargo/poketracker-pwa"
  exit 2
fi

TEST_FILE="$APP_ROOT/tests/warehouse-package-assignment.test.ts"

if [[ ! -f "$TEST_FILE" ]]; then
  echo "FEHLER: Testdatei nicht gefunden:"
  echo "  $TEST_FILE"
  exit 1
fi

BACKUP="$TEST_FILE.bak-assignment-test-v45"
if [[ ! -f "$BACKUP" ]]; then
  cp "$TEST_FILE" "$BACKUP"
fi

node <<'NODE' "$TEST_FILE"
const fs = require('fs')
const file = process.argv[2]
let src = fs.readFileSync(file, 'utf8')

if (
  src.includes("seller_name: 'Seller A'") &&
  src.includes("seller_name: 'Seller B'") &&
  src.includes("seller_name: 'Seller C'")
) {
  console.log('v45 ist bereits angewendet.')
  process.exit(0)
}

const replacements = [
  [
    "{ id: 'purchase-a', title: 'A', source_listing_id: null, purchased_at: null, status: 'ordered' },",
    "{ id: 'purchase-a', title: 'A', source_listing_id: null, purchased_at: null, status: 'ordered', seller_name: 'Seller A', price_amount: 1000, currency: 'KRW' },",
  ],
  [
    "{ id: 'purchase-b', title: 'B', source_listing_id: null, purchased_at: null, status: 'ordered' },",
    "{ id: 'purchase-b', title: 'B', source_listing_id: null, purchased_at: null, status: 'ordered', seller_name: 'Seller B', price_amount: 2000, currency: 'KRW' },",
  ],
  [
    "{ id: 'purchase-c', title: 'C', source_listing_id: null, purchased_at: null, status: 'ordered' },",
    "{ id: 'purchase-c', title: 'C', source_listing_id: null, purchased_at: null, status: 'ordered', seller_name: 'Seller C', price_amount: 3000, currency: 'KRW' },",
  ],
]

for (const [before, after] of replacements) {
  const count = src.split(before).length - 1
  if (count !== 1) {
    throw new Error(`Erwartet genau 1 Treffer fuer Test-Fixture, gefunden: ${count}\n${before}`)
  }
  src = src.replace(before, after)
}

fs.writeFileSync(file, src)
console.log('warehouse-package-assignment.test.ts aktualisiert.')
NODE

echo
echo "Patch cardcargo-olaeet-assignment-test-fix-v45 angewendet."
echo "Backup:"
echo "  $BACKUP"
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
