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

BACKUP="$FILE.bak-bunjang-cache-v57"
if [[ ! -f "$BACKUP" ]]; then
  cp "$FILE" "$BACKUP"
fi

node - "$FILE" <<'NODE'
const fs = require('fs')

const file = process.argv[2]
let src = fs.readFileSync(file, 'utf8')

if (src.includes('const bunjangOrderCacheSnapshot = useSyncExternalStore(')) {
  console.log('v57 ist bereits angewendet.')
  process.exit(0)
}

// 1) React import erweitern.
src = src.replace(
  /import\s*\{\s*([^}]*?)\s*\}\s*from\s*['"]react['"]/,
  (full, names) => {
    const list = names
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    if (!list.includes('useSyncExternalStore')) {
      list.push('useSyncExternalStore')
    }

    return `import { ${list.join(', ')} } from 'react'`
  },
)

if (!src.includes('useSyncExternalStore')) {
  throw new Error('v57: React-Import konnte nicht um useSyncExternalStore erweitert werden.')
}

// 2) Alten State fuer den Cache entfernen.
const oldState =
  '  const [cachedBunjangOrders, setCachedBunjangOrders] = useState<BunjangOrderRecord[]>([])'

if (!src.includes(oldState)) {
  throw new Error('v57: cachedBunjangOrders-State aus v56 nicht gefunden.')
}

const newState = `  const bunjangOrderCacheSnapshot = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(BUNJANG_ORDER_CACHE_KEY) ?? ''
      } catch {
        return ''
      }
    },
    () => '',
  )

  const cachedBunjangOrders = useMemo(() => {
    if (!bunjangOrderCacheSnapshot) return []
    return parseBunjangOrderImport(bunjangOrderCacheSnapshot).records
  }, [bunjangOrderCacheSnapshot])`

src = src.replace(oldState, newState)

// 3) Den problematischen useEffect komplett entfernen.
const effectStart = src.indexOf(`  useEffect(() => {
    try {
      const cached = localStorage.getItem(BUNJANG_ORDER_CACHE_KEY)`)

if (effectStart >= 0) {
  const effectEndMarker = `  }, [])

`
  const effectEnd = src.indexOf(effectEndMarker, effectStart)

  if (effectEnd < 0) {
    throw new Error('v57: Ende des v56-Bunjang-Cache-useEffect nicht gefunden.')
  }

  src =
    src.slice(0, effectStart) +
    src.slice(effectEnd + effectEndMarker.length)
}

// 4) Direkte setCachedBunjangOrders-Aufrufe entfernen.
// Der Snapshot wird bei jeder normalen Render-Aktualisierung direkt aus localStorage gelesen.
src = src.replace(
  /^\s*setCachedBunjangOrders\(parsed\.records\)\s*$/gm,
  '',
)

// 5) Nach localStorage.setItem bewusst eine bestehende State-Aktualisierung nutzen,
// damit der aktuelle Tab sofort neu rendert. In changeRawText passiert ohnehin setRawText.
// In loadBunjangOrderExtraction gab es bisher setCached..., dort sorgt setBunjangOrderMessage
// fuer denselben Render. Es ist daher kein zusaetzlicher State noetig.

fs.writeFileSync(file, src)

console.log('v57: Bunjang-Cache auf useSyncExternalStore umgestellt.')
console.log('  - kein setState mehr innerhalb des Cache-useEffect')
console.log('  - localStorage-Cache bleibt automatisch fuer URL-Import verfuegbar')
NODE

echo
echo "Patch cardcargo-bunjang-cache-lint-fix-v57 erfolgreich angewendet."
echo "Backup:"
echo "  $BACKUP"
echo
echo "Jetzt pruefen:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo
echo "Keine Datenbankmigration erforderlich."
