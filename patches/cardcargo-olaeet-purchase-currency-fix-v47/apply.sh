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

node - "$APP_ROOT" <<'NODE'
const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]

const files = [
  path.join(appRoot, 'app', '(app)', 'warehouse-packages', 'new', 'page.tsx'),
  path.join(appRoot, 'app', '(app)', 'warehouse-packages', '[id]', 'edit', 'page.tsx'),
]

let totalChanged = 0

for (const file of files) {
  if (!fs.existsSync(file)) {
    throw new Error(`Datei nicht gefunden: ${file}`)
  }

  let src = fs.readFileSync(file, 'utf8')
  const original = src

  // v44 queried purchases.currency, but the purchases table uses price_currency.
  // Keep the UI/type field name "currency" via a PostgREST alias.
  src = src.replace(
    /seller_name,\s*price_amount,\s*currency(?!:price_currency)/g,
    'seller_name, price_amount, currency:price_currency',
  )

  // Also handle a differently formatted select list.
  src = src.replace(
    /(['"`])currency\1(?=\s*[,)]|\s*$)/g,
    (match, quote, offset, full) => {
      const before = full.slice(Math.max(0, offset - 180), offset)
      if (
        before.includes(".from('purchases')") ||
        before.includes('.from("purchases")') ||
        before.includes("seller_name") ||
        before.includes("price_amount")
      ) {
        return `${quote}currency:price_currency${quote}`
      }
      return match
    },
  )

  if (src === original) {
    if (src.includes('currency:price_currency')) {
      console.log(`Bereits korrekt: ${file}`)
      continue
    }

    const hasBadCurrency =
      /\.from\(['"]purchases['"]\)[\s\S]{0,500}\.select\([\s\S]{0,500}\bcurrency\b/.test(src)

    if (hasBadCurrency) {
      throw new Error(
        `Purchase-Select mit "currency" gefunden, aber nicht sicher automatisch patchbar: ${file}`,
      )
    }

    console.log(`Kein v44-currency-Select gefunden: ${file}`)
    continue
  }

  const backup = `${file}.bak-purchase-currency-v47`
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup)
  }

  fs.writeFileSync(file, src)
  totalChanged += 1
  console.log(`Aktualisiert: ${file}`)
}

console.log(`v47: ${totalChanged} Datei(en) geaendert.`)
NODE

echo
echo "Patch cardcargo-olaeet-purchase-currency-fix-v47 angewendet."
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo
echo "Keine Datenbankmigration erforderlich."
