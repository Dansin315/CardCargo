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

BACKUP="$TEST_FILE.bak-assignment-test-v46"
if [[ ! -f "$BACKUP" ]]; then
  cp "$TEST_FILE" "$BACKUP"
fi

# Wichtig: "-" weist Node an, das JavaScript aus stdin auszufuehren.
# TEST_FILE wird nur als Argument an das Patch-Script uebergeben.
node - "$TEST_FILE" <<'NODE'
const fs = require('fs')

const file = process.argv[2]
if (!file) {
  throw new Error('Interner Patchfehler: TEST_FILE-Argument fehlt.')
}

let src = fs.readFileSync(file, 'utf8')

const alreadyFixed =
  /id:\s*['"]purchase-a['"][\s\S]*?seller_name\s*:/.test(src) &&
  /id:\s*['"]purchase-b['"][\s\S]*?seller_name\s*:/.test(src) &&
  /id:\s*['"]purchase-c['"][\s\S]*?seller_name\s*:/.test(src)

if (alreadyFixed) {
  console.log('v46: Test-Fixtures sind bereits aktualisiert.')
  process.exit(0)
}

const fixtureValues = {
  'purchase-a': {
    seller: 'Seller A',
    price: 1000,
  },
  'purchase-b': {
    seller: 'Seller B',
    price: 2000,
  },
  'purchase-c': {
    seller: 'Seller C',
    price: 3000,
  },
}

let changed = 0

for (const [id, values] of Object.entries(fixtureValues)) {
  const re = new RegExp(
    `(\\{\\s*id:\\s*['"]${id}['"][\\s\\S]*?status:\\s*['"]ordered['"])(\\s*\\})`,
    'm',
  )

  const matches = src.match(re)
  if (!matches) {
    throw new Error(`Test-Fixture ${id} konnte nicht gefunden werden.`)
  }

  const block = matches[0]
  if (/seller_name\s*:/.test(block)) {
    continue
  }

  src = src.replace(
    re,
    `$1, seller_name: '${values.seller}', price_amount: ${values.price}, currency: 'KRW'$2`,
  )
  changed += 1
}

fs.writeFileSync(file, src)

console.log(`v46: ${changed} Test-Fixture(s) aktualisiert.`)
console.log(`Datei: ${file}`)
NODE

echo
echo "Patch cardcargo-olaeet-assignment-test-fix-v46 erfolgreich."
echo "Backup:"
echo "  $BACKUP"
echo
echo "Jetzt ausfuehren:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
