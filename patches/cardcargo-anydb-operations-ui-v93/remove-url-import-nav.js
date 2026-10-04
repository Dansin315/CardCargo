const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, output)
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) output.push(full)
  }
  return output
}

function stripItem(source) {
  let next = source

  next = next.replace(
    /\s*<(?:Link|NavLink|a)\b[^>]*>\s*URL\s+import(?:ieren)?\s*<\/(?:Link|NavLink|a)>/gi,
    '',
  )

  next = next.replace(
    /\{[^{}]{0,1200}?(?:label|title|name|text)\s*:\s*['"]URL\s+import(?:ieren)?['"][^{}]{0,1200}?\}\s*,?/gi,
    '',
  )

  next = next.replace(
    /\[[^\[\]]{0,800}?['"]URL\s+import(?:ieren)?['"][^\[\]]{0,800}?\]\s*,?/gi,
    '',
  )

  // Explicit route-based fallback: if the navigation object points at the old
  // manual URL import page and its same flat object contains the label, remove it.
  next = next.replace(
    /\{[^{}]{0,1400}?(?:href|path|route|url)\s*:\s*['"]\/purchases\/new['"][^{}]{0,1400}?(?:label|title|name|text)\s*:\s*['"]URL\s+import(?:ieren)?['"][^{}]{0,1400}?\}\s*,?/gi,
    '',
  )

  return next
}

const files = [
  ...walk(path.join(appRoot, 'components')),
  ...walk(path.join(appRoot, 'app')),
  ...walk(path.join(appRoot, 'lib')),
]

let changed = 0
const unresolved = []

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  if (!/URL\s+import(?:ieren)?/i.test(source)) continue

  const looksLikeNavigation =
    /(?:Übersicht|Einkäufe|OLAEET-Pakete|Sendungen|Inventar)/.test(source) ||
    /nav|navigation|menu/i.test(path.basename(file))

  if (!looksLikeNavigation) continue

  const updated = stripItem(source)
  if (updated !== source) {
    const backup = `${file}.bak-v93-nav`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    fs.writeFileSync(file, updated)
    console.log(`URL-Import aus Navigation entfernt: ${path.relative(appRoot, file)}`)
    changed += 1
  }

  if (/URL\s+import(?:ieren)?/i.test(updated)) {
    unresolved.push(path.relative(appRoot, file))
  }
}

if (unresolved.length) {
  console.warn(
    'WARNUNG: Der Text „URL importieren“ existiert nach dem sicheren Navigation-Patch noch in: ' +
      unresolved.join(', '),
  )
}

console.log(
  changed
    ? `Navigation bereinigt (${changed} Datei(en)).`
    : 'Kein aktiver URL-Import-Navigationseintrag mehr gefunden.',
)
