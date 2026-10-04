const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      walk(full, output)
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      output.push(full)
    }
  }

  return output
}

function removeAdjacentComma(source, start, end) {
  let left = start
  let right = end

  while (left > 0 && /[ \t]/.test(source[left - 1])) left -= 1
  while (right < source.length && /[ \t]/.test(source[right])) right += 1

  if (source[right] === ',') {
    right += 1
    while (right < source.length && /[ \t]/.test(source[right])) right += 1
    if (source[right] === '\r') right += 1
    if (source[right] === '\n') right += 1
    return source.slice(0, left) + source.slice(right)
  }

  let comma = left - 1
  while (comma >= 0 && /[ \t]/.test(source[comma])) comma -= 1
  if (source[comma] === ',') left = comma

  return source.slice(0, left) + source.slice(right)
}

function removeFlatContainer(source, markerIndex, openChar, closeChar) {
  const start = source.lastIndexOf(openChar, markerIndex)
  const end = source.indexOf(closeChar, markerIndex)
  if (start < 0 || end < 0 || end <= start) return source

  const chunk = source.slice(start, end + 1)
  if (chunk.length > 1200 || !/URL\s+importieren/i.test(chunk)) return source

  if (openChar === '{' && !/(href|path|route|url|label|title|name)\s*:/i.test(chunk)) {
    return source
  }

  return removeAdjacentComma(source, start, end + 1)
}

function removeNavigationItem(source) {
  let next = source

  // JSX navigation links.
  next = next.replace(
    /\s*<(?:Link|NavLink|a)\b[^>]*>\s*URL\s+importieren\s*<\/(?:Link|NavLink|a)>/gi,
    '',
  )

  // Common flat navigation object layouts.
  next = next.replace(
    /\{[^{}]{0,900}?(?:label|title|name)\s*:\s*['"]URL\s+importieren['"][^{}]{0,900}?\}\s*,?/gi,
    '',
  )

  // Common tuple navigation layouts.
  next = next.replace(
    /\[[^\[\]]{0,500}?['"]URL\s+importieren['"][^\[\]]{0,500}?\]\s*,?/gi,
    '',
  )

  // Last-resort removal for a flat object/tuple in a known navigation file.
  let guard = 0
  while (/URL\s+importieren/i.test(next) && guard < 8) {
    guard += 1
    const marker = next.search(/URL\s+importieren/i)
    const objectAttempt = removeFlatContainer(next, marker, '{', '}')
    if (objectAttempt !== next) {
      next = objectAttempt
      continue
    }

    const tupleAttempt = removeFlatContainer(next, marker, '[', ']')
    if (tupleAttempt !== next) {
      next = tupleAttempt
      continue
    }

    break
  }

  return next
}

const files = [
  ...walk(path.join(appRoot, 'components')),
  ...walk(path.join(appRoot, 'app')),
  ...walk(path.join(appRoot, 'lib')),
]

const navLabels = [
  'Übersicht',
  'Einkäufe',
  'OLAEET-Pakete',
  'Sendungen',
  'Inventar',
]

const candidates = files.filter((file) => {
  const source = fs.readFileSync(file, 'utf8')
  return (
    /URL\s+importieren/i.test(source) &&
    navLabels.filter((label) => source.includes(label)).length >= 3
  )
})

if (!candidates.length) {
  // Fallback: the navigation may be split into smaller components.
  candidates.push(
    ...files.filter((file) =>
      /URL\s+importieren/i.test(fs.readFileSync(file, 'utf8')),
    ),
  )
}

let changed = 0
const unresolved = []

for (const file of [...new Set(candidates)]) {
  const source = fs.readFileSync(file, 'utf8')
  const updated = removeNavigationItem(source)

  if (updated !== source) {
    const backup = `${file}.bak-v89-nav`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    fs.writeFileSync(file, updated)
    console.log(`Navigation aktualisiert: ${path.relative(appRoot, file)}`)
    changed += 1
  }

  if (/URL\s+importieren/i.test(updated)) {
    unresolved.push(path.relative(appRoot, file))
  }
}

if (unresolved.length) {
  throw new Error(
    'Der Navigationseintrag „URL importieren“ konnte in folgenden Dateien nicht sicher entfernt werden: ' +
      unresolved.join(', '),
  )
}

console.log(
  changed
    ? `URL-Import-Navigation entfernt (${changed} Datei(en)).`
    : 'URL-Import-Navigation war bereits entfernt.',
)
