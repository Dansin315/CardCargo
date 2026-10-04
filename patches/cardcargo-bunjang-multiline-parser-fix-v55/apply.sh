#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
if [[ -z "$APP_ROOT" ]]; then
  echo "Verwendung: bash apply.sh /pfad/zu/CardCargo/poketracker-pwa"
  exit 2
fi

FILE="$APP_ROOT/lib/bunjang-order-import.ts"
if [[ ! -f "$FILE" ]]; then
  echo "FEHLER: Datei nicht gefunden: $FILE"
  exit 1
fi

BACKUP="$FILE.bak-bunjang-multiline-v55"
if [[ ! -f "$BACKUP" ]]; then
  cp "$FILE" "$BACKUP"
fi

node - "$FILE" <<'NODE'
const fs = require('fs')

const file = process.argv[2]
let src = fs.readFileSync(file, 'utf8')

if (src.includes('function valueAfterLabel(')) {
  console.log('v55 ist bereits angewendet.')
  process.exit(0)
}

const start = src.indexOf('function trackingFromText(text: string) {')
const endMarker = 'function labelledValue(text: string, label: string) {'
const endStart = src.indexOf(endMarker, start)

if (start < 0 || endStart < 0) {
  throw new Error('v55: v54-Parserblock nicht gefunden.')
}

const labelledEnd = src.indexOf('\n}', endStart)
if (labelledEnd < 0) {
  throw new Error('v55: Ende von labelledValue nicht gefunden.')
}
const replaceEnd = labelledEnd + 2

const replacement = `function valueAfterLabel(all: string[], label: string) {
  const index = all.findIndex(
    (line) =>
      line === label ||
      line.startsWith(\`\${label} \`) ||
      line.startsWith(\`\${label}:\`) ||
      line.startsWith(\`\${label}：\`),
  )

  if (index < 0) return null

  const sameLine = all[index]
    .slice(label.length)
    .trim()
    .replace(/^[:：]\\s*/, '')

  if (sameLine) return sameLine
  return all[index + 1] ?? null
}

function looksLikeTrackingNumber(value: string | null | undefined) {
  if (!value) return false
  const compact = value.replace(/[\\s-]/g, '')
  return /^[A-Z0-9]{8,32}$/i.test(compact) && /\\d{6,}/.test(compact.replace(/\\D/g, ''))
}

function trackingFromText(text: string) {
  const all = lines(text)

  for (let index = 0; index < all.length; index += 1) {
    const line = all[index]
    if (!line.startsWith('운송장')) continue

    const sameLine = line.match(/운송장\\s+(.+?)\\s+([A-Z0-9][A-Z0-9 -]{7,30})$/i)
    if (sameLine?.[2]) {
      return {
        carrier: sameLine[1].trim(),
        tracking: sameLine[2].replace(/[\\s-]/g, ''),
      }
    }

    const inlineCarrier = line
      .slice('운송장'.length)
      .trim()
      .replace(/^[:：]\\s*/, '')

    const carrier = inlineCarrier || all[index + 1] || null
    const trackingCandidate = inlineCarrier ? all[index + 1] : all[index + 2]

    if (looksLikeTrackingNumber(trackingCandidate)) {
      return {
        carrier,
        tracking: trackingCandidate.replace(/[\\s-]/g, ''),
      }
    }

    for (let offset = 1; offset <= 4; offset += 1) {
      const candidate = all[index + offset]
      if (!looksLikeTrackingNumber(candidate)) continue

      return {
        carrier:
          offset > 1
            ? all[index + offset - 1]
            : inlineCarrier || null,
        tracking: candidate.replace(/[\\s-]/g, ''),
      }
    }
  }

  return { carrier: null, tracking: null }
}

function labelledValue(text: string, label: string) {
  return valueAfterLabel(lines(text), label)
}`

src = src.slice(0, start) + replacement + src.slice(replaceEnd)
fs.writeFileSync(file, src)

console.log('v55: Multiline-Parser aktualisiert.')
NODE

echo
echo "Patch v55 erfolgreich angewendet."
echo
echo "Jetzt:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
echo
echo "Keine Datenbankmigration erforderlich."
