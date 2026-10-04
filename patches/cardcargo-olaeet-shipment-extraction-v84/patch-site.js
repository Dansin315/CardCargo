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

function backup(file, suffix) {
  const target = `${file}.${suffix}`
  if (!fs.existsSync(target)) fs.copyFileSync(file, target)
}

function removeUrlImportNavigation() {
  let changed = 0
  const candidates = [
    ...walk(path.join(appRoot, 'components')),
    ...walk(path.join(appRoot, 'app')),
  ]

  for (const file of candidates) {
    let source = fs.readFileSync(file, 'utf8')
    const original = source

    source = source.replace(
      /\s*<Link\b[^>]*>\s*URL\s+importieren\s*<\/Link>/gi,
      '',
    )
    source = source.replace(
      /\s*<a\b[^>]*>\s*URL\s+importieren\s*<\/a>/gi,
      '',
    )

    if (source !== original) {
      backup(file, 'bak-v84-nav')
      fs.writeFileSync(file, source)
      console.log(`Navigation: URL Importieren entfernt aus ${path.relative(appRoot, file)}`)
      changed += 1
    }
  }

  if (!changed) {
    console.log('Hinweis: Kein expliziter Navigationseintrag „URL Importieren“ gefunden oder bereits entfernt.')
  }
}

function addImport(source) {
  const statement =
    "import { OlaeetShipmentExtractionImporter } from '@/components/olaeet-shipment-extraction-importer'"
  if (source.includes(statement)) return source

  const imports = [...source.matchAll(/^import .*$/gm)]
  if (!imports.length) throw new Error('Keine Import-Zeile in der Sendungsseite gefunden.')
  const last = imports[imports.length - 1]
  const at = last.index + last[0].length
  return source.slice(0, at) + `\n${statement}` + source.slice(at)
}

function patchShipmentCapture() {
  const files = [
    ...walk(path.join(appRoot, 'app')),
    ...walk(path.join(appRoot, 'components')),
  ].filter((file) => /\.(tsx|jsx)$/.test(file))

  const patterns = [
    'Internationale Sendungen erfassen',
    'Internationale Sendung erfassen',
  ]

  const target = files.find((file) => {
    const source = fs.readFileSync(file, 'utf8')
    return patterns.some((pattern) => source.includes(pattern))
  })

  if (!target) {
    throw new Error(
      'v84: Die bestehende Ansicht „Internationale Sendungen erfassen“ wurde nicht gefunden. Der Patch wurde absichtlich nicht auf eine unbekannte Seite angewendet.',
    )
  }

  let source = fs.readFileSync(target, 'utf8')
  if (source.includes('<OlaeetShipmentExtractionImporter')) {
    console.log(`Sendungsimport bereits erweitert: ${path.relative(appRoot, target)}`)
    return
  }

  source = addImport(source)
  source = source
    .replace(/Internationale Sendungen erfassen/g, 'Internationale Sendungen importieren')
    .replace(/Internationale Sendung erfassen/g, 'Internationale Sendung importieren')

  const headingIndex = Math.max(
    source.indexOf('Internationale Sendungen importieren'),
    source.indexOf('Internationale Sendung importieren'),
  )

  let insertAt = -1
  const headerEnd = source.indexOf('</header>', headingIndex)
  if (headerEnd >= 0) {
    insertAt = headerEnd + '</header>'.length
  } else {
    const formIndex = source.indexOf('<form', headingIndex)
    if (formIndex >= 0) insertAt = formIndex
  }

  if (insertAt < 0) {
    throw new Error(
      `v84: Einfügepunkt auf ${path.relative(appRoot, target)} konnte nicht bestimmt werden.`,
    )
  }

  source =
    source.slice(0, insertAt) +
    `\n      <OlaeetShipmentExtractionImporter />\n` +
    source.slice(insertAt)

  backup(target, 'bak-v84-shipment')
  fs.writeFileSync(target, source)
  console.log(`Internationale Sendungen auf Extraction-Import umgestellt: ${path.relative(appRoot, target)}`)
}

removeUrlImportNavigation()
patchShipmentCapture()
