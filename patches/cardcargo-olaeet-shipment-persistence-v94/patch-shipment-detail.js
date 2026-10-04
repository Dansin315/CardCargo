const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const importLine =
  "import { OlaeetShipmentRecordDetails } from '@/components/olaeet-shipment-record-details'"

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, output)
    else if (entry.name === 'page.tsx') output.push(full)
  }
  return output
}

function ensureImport(source) {
  if (source.includes(importLine)) return source

  const useClient = source.match(/^\s*['\"]use client['\"];?\s*\n/)
  if (useClient) {
    const at = useClient[0].length
    return source.slice(0, at) + importLine + '\n' + source.slice(at)
  }

  const imports = [...source.matchAll(/^import[\s\S]*?from\s+['\"][^'\"]+['\"]\s*$/gm)]
  if (imports.length) {
    const last = imports[imports.length - 1]
    const at = last.index + last[0].length
    return source.slice(0, at) + '\n' + importLine + source.slice(at)
  }

  return importLine + '\n' + source
}

function patchPage(file) {
  let source = fs.readFileSync(file, 'utf8')
  if (source.includes('<OlaeetShipmentRecordDetails')) return false

  source = ensureImport(source)

  const header = source.indexOf('</header>')
  if (header >= 0) {
    const at = header + '</header>'.length
    source = source.slice(0, at) + '\n      <OlaeetShipmentRecordDetails />' + source.slice(at)
  } else {
    const section = source.indexOf('<section')
    if (section >= 0) {
      source = source.slice(0, section) + '<OlaeetShipmentRecordDetails />\n      ' + source.slice(section)
    } else {
      return false
    }
  }

  const backup = `${file}.bak-v94`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, source)
  return true
}

const roots = [
  path.join(appRoot, 'app'),
  path.join(appRoot, 'src', 'app'),
]

let patched = 0
for (const root of roots) {
  for (const file of walk(root)) {
    const normalized = file.split(path.sep).join('/')
    if (!normalized.includes('/shipments/')) continue
    if (!normalized.includes('/[')) continue
    if (normalized.includes('/new/')) continue
    if (normalized.includes('/edit/')) continue
    if (normalized.includes('/olaeet/')) continue

    if (patchPage(file)) {
      console.log(`OLAEET-Schnellprüfung ergänzt: ${path.relative(appRoot, file)}`)
      patched += 1
    }
  }
}

if (!patched) {
  console.log('Hinweis: Keine dynamische Standard-Sendungsdetailseite gefunden. Die gespeicherten Daten bleiben trotzdem im Shipment und sind über die Importseite vorhanden.')
}
