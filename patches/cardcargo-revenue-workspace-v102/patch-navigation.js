const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const candidates = [
  'components/app-navigation.tsx',
  'components/navigation.tsx',
  'app/(app)/layout.tsx',
].map((rel) => path.join(appRoot, rel))

const file = candidates.find((candidate) => fs.existsSync(candidate))
if (!file) throw new Error('Navigation konnte nicht gefunden werden.')

let source = fs.readFileSync(file, 'utf8')
if (/['"]\/revenue['"]/.test(source) || />\s*Umsatz\s*</.test(source)) {
  console.log(`Navigation bereits vorhanden: ${path.relative(appRoot, file)}`)
  process.exit(0)
}

const original = source

// Most CardCargo versions use a flat object nav array. Reuse its key naming.
const objectPattern = /\{([^{}]{0,500}?)(?:href|path|route|url)\s*:\s*['"]\/inventory['"]([^{}]{0,500}?)(?:label|title|name|text)\s*:\s*['"]Inventar['"]([^{}]{0,500}?)\}/i
const objectMatch = source.match(objectPattern)
if (objectMatch && objectMatch.index !== undefined) {
  const block = objectMatch[0]
  const hrefKey = block.match(/\b(href|path|route|url)\s*:/i)?.[1] || 'href'
  const labelKey = block.match(/\b(label|title|name|text)\s*:/i)?.[1] || 'label'
  const insertAt = objectMatch.index + block.length
  source = source.slice(0, insertAt) + `,\n  { ${hrefKey}: '/revenue', ${labelKey}: 'Umsatz' }` + source.slice(insertAt)
}

// Tuple nav fallback.
if (source === original) {
  const tuple = source.match(/\[\s*['"]\/inventory['"]\s*,\s*['"]Inventar['"]\s*\]/i)
  if (tuple && tuple.index !== undefined) {
    const at = tuple.index + tuple[0].length
    source = source.slice(0, at) + `,\n  ['/revenue', 'Umsatz']` + source.slice(at)
  }
}

// JSX fallback: a plain anchor inherits the main-nav styling. If pathname is
// available, preserve the active state too.
if (source === original) {
  const navClose = source.indexOf('</nav>')
  if (navClose >= 0) {
    const hasPathname = /\bpathname\b/.test(source)
    const anchor = hasPathname
      ? `\n        <a href="/revenue" className={pathname.startsWith('/revenue') ? 'is-active' : undefined} aria-current={pathname.startsWith('/revenue') ? 'page' : undefined}>Umsatz</a>`
      : `\n        <a href="/revenue">Umsatz</a>`
    source = source.slice(0, navClose) + anchor + '\n      ' + source.slice(navClose)
  }
}

if (source === original) throw new Error('Umsatz konnte nicht sicher in die Navigation eingefügt werden.')
const backup = `${file}.bak-v102`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
fs.writeFileSync(file, source)
console.log(`Navigation erweitert: ${path.relative(appRoot, file)}`)
