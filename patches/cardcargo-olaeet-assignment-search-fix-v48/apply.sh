#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"

if [[ -z "$APP_ROOT" ]]; then
  echo "Verwendung:"
  echo "  bash apply.sh /pfad/zu/CardCargo/poketracker-pwa"
  exit 2
fi

FORM="$APP_ROOT/components/warehouse-package-form.tsx"

if [[ ! -f "$FORM" ]]; then
  echo "FEHLER: Datei nicht gefunden:"
  echo "  $FORM"
  exit 1
fi

BACKUP="$FORM.bak-assignment-search-v48"
if [[ ! -f "$BACKUP" ]]; then
  cp "$FORM" "$BACKUP"
fi

node - "$FORM" <<'NODE'
const fs = require('fs')

const file = process.argv[2]
let src = fs.readFileSync(file, 'utf8')

if (src.includes('function normalizePurchaseSearchValue(')) {
  console.log('v48 ist bereits angewendet.')
  process.exit(0)
}

const helperAnchor = `function formatPurchasePrice(amount: number | null, currency: string) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null
  return \`\${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Number(amount))} \${currency || 'KRW'}\`
}`

if (!src.includes(helperAnchor)) {
  throw new Error(
    'v48: Helper-Anker aus v44 nicht gefunden. warehouse-package-form.tsx weicht unerwartet ab.',
  )
}

const helpers = `${helperAnchor}

function normalizePurchaseSearchValue(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\\p{L}\\p{N}]+/gu, ' ')
    .trim()
    .replace(/\\s+/g, ' ')
}

function purchaseMatchesSearch(purchase: PackagePurchaseChoice, query: string) {
  const normalizedQuery = normalizePurchaseSearchValue(query)
  if (!normalizedQuery) return true

  const listingId = String(purchase.source_listing_id ?? '')
  const haystack = normalizePurchaseSearchValue(
    [
      purchase.title,
      purchase.seller_name,
      listingId,
      listingId ? \`Bunjang \${listingId}\` : '',
      listingId ? \`Bunjang #\${listingId}\` : '',
    ]
      .filter(Boolean)
      .join(' '),
  )

  const tokens = normalizedQuery.split(' ').filter(Boolean)
  return tokens.every((token) => haystack.includes(token))
}`

src = src.replace(helperAnchor, helpers)

const startMarker = '  const filteredPurchases = useMemo(() => {'
const endMarker =
  '  }, [arrivedAt, purchaseDateFrom, purchaseDateTo, purchaseSearch, purchaseSort, purchases, selectedPurchases])'

const start = src.indexOf(startMarker)
if (start < 0) {
  throw new Error('v48: filteredPurchases-Block nicht gefunden.')
}

const endStart = src.indexOf(endMarker, start)
if (endStart < 0) {
  throw new Error('v48: Ende des filteredPurchases-Blocks nicht gefunden.')
}
const end = endStart + endMarker.length

const replacement = `  const filteredPurchases = useMemo(() => {
    const filtered = purchases.filter((purchase) => {
      if (!purchaseMatchesSearch(purchase, purchaseSearch)) return false

      if (purchaseDateFrom && (!purchase.purchased_at || purchase.purchased_at < purchaseDateFrom)) {
        return false
      }
      if (purchaseDateTo && (!purchase.purchased_at || purchase.purchased_at > purchaseDateTo)) {
        return false
      }
      return true
    })

    return [...filtered].sort((a, b) => {
      const selectionOrder =
        Number(selectedPurchases.includes(b.id)) - Number(selectedPurchases.includes(a.id))
      if (selectionOrder !== 0) return selectionOrder

      if (purchaseSort === 'closest') {
        const distance =
          purchaseDistanceDays(a.purchased_at, arrivedAt) -
          purchaseDistanceDays(b.purchased_at, arrivedAt)
        if (Number.isFinite(distance) && distance !== 0) return distance
      }

      if (purchaseSort === 'date_asc') {
        return (a.purchased_at || '9999-12-31').localeCompare(
          b.purchased_at || '9999-12-31',
        )
      }
      if (purchaseSort === 'price_desc') {
        return Number(b.price_amount ?? -1) - Number(a.price_amount ?? -1)
      }
      if (purchaseSort === 'price_asc') {
        return (
          Number(a.price_amount ?? Number.MAX_SAFE_INTEGER) -
          Number(b.price_amount ?? Number.MAX_SAFE_INTEGER)
        )
      }
      if (purchaseSort === 'title') {
        return a.title.localeCompare(b.title, 'de')
      }

      return (b.purchased_at || '').localeCompare(a.purchased_at || '')
    })
  }, [
    arrivedAt,
    purchaseDateFrom,
    purchaseDateTo,
    purchaseSearch,
    purchaseSort,
    purchases,
    selectedPurchases,
  ])`

src = src.slice(0, start) + replacement + src.slice(end)

fs.writeFileSync(file, src)
console.log('v48: OLAEET-Einkaufssuche aktualisiert.')
console.log('  - bereits ausgewählte Einträge werden jetzt ebenfalls gefiltert')
console.log('  - Titel-Suche verbessert')
console.log('  - Verkäufer-Suche verbessert')
console.log('  - Bunjang-ID unterstützt Nummer sowie "Bunjang #..."')
console.log('  - mehrere Suchwörter werden kombiniert')
NODE

echo
echo "Patch cardcargo-olaeet-assignment-search-fix-v48 angewendet."
echo "Backup:"
echo "  $BACKUP"
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo
echo "Keine Datenbankmigration erforderlich."
