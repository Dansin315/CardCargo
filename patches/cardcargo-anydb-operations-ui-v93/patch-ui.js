const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
const patchRoot = process.argv[3]
if (!appRoot) throw new Error('APP_ROOT fehlt.')
if (!patchRoot) throw new Error('PATCH_ROOT fehlt.')

const cssSource = fs.readFileSync(path.join(patchRoot, 'anydb-cardcargo.css'), 'utf8')
const marker = 'CardCargo v93 — AnyDB-inspired operations UI'

function findGlobalCss() {
  const candidates = [
    'app/globals.css',
    'src/app/globals.css',
    'styles/globals.css',
    'src/styles/globals.css',
  ]

  for (const rel of candidates) {
    const file = path.join(appRoot, rel)
    if (fs.existsSync(file)) return { file, rel }
  }

  throw new Error('Keine globale CSS-Datei gefunden (app/globals.css oder styles/globals.css).')
}

function patchCss() {
  const { file, rel } = findGlobalCss()
  let source = fs.readFileSync(file, 'utf8')

  if (source.includes(marker)) {
    console.log(`AnyDB-UI-CSS bereits vorhanden: ${rel}`)
    return
  }

  const backup = `${file}.bak-v93-anydb-ui`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)

  source = `${source.trimEnd()}\n\n${cssSource.trim()}\n`
  fs.writeFileSync(file, source)
  console.log(`AnyDB-UI-CSS ergänzt: ${rel}`)
}

function ensureImport(source, importLine) {
  if (source.includes(importLine)) return source

  const imports = [...source.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm)]
  if (imports.length) {
    const last = imports[imports.length - 1]
    const at = last.index + last[0].length
    return source.slice(0, at) + `\n${importLine}` + source.slice(at)
  }

  const simpleImports = [...source.matchAll(/^import .*$/gm)]
  if (!simpleImports.length) {
    throw new Error('inventory-workspace.tsx: Importbereich nicht gefunden.')
  }

  const last = simpleImports[simpleImports.length - 1]
  const at = last.index + last[0].length
  return source.slice(0, at) + `\n${importLine}` + source.slice(at)
}

function addAttributeToOpeningTag(opening, attr) {
  if (opening.includes(attr.split('=')[0])) return opening
  return opening.replace(/>$/, ` ${attr}>`)
}

function patchInventoryWorkspace() {
  const rel = 'components/inventory-workspace.tsx'
  const file = path.join(appRoot, rel)

  if (!fs.existsSync(file)) {
    throw new Error(`Nicht gefunden: ${rel}`)
  }

  let source = fs.readFileSync(file, 'utf8')
  const original = source

  source = ensureImport(
    source,
    "import { ConnectedInventoryModel } from '@/components/connected-inventory-model'",
  )

  if (!source.includes('<ConnectedInventoryModel')) {
    const returnIndex = source.indexOf('return (')
    if (returnIndex < 0) {
      throw new Error('inventory-workspace.tsx: return (-Block nicht gefunden.')
    }

    const tail = source.slice(returnIndex)
    const rootMatch = tail.match(/return\s*\(\s*(<[A-Za-z][A-Za-z0-9.]*\b[^>]*>)/)

    if (rootMatch && rootMatch.index !== undefined) {
      const absoluteOpeningStart = returnIndex + rootMatch.index + rootMatch[0].lastIndexOf(rootMatch[1])
      const opening = rootMatch[1]
      const withAttr = addAttributeToOpeningTag(opening, 'data-cc-anydb="inventory"')
      const insertAt = absoluteOpeningStart + opening.length

      source =
        source.slice(0, absoluteOpeningStart) +
        withAttr +
        '\n      <ConnectedInventoryModel />' +
        source.slice(insertAt)
    } else {
      const fragmentMatch = tail.match(/return\s*\(\s*<>/)
      if (!fragmentMatch || fragmentMatch.index === undefined) {
        throw new Error('inventory-workspace.tsx: JSX-Root konnte nicht sicher erkannt werden.')
      }
      const fragmentAt = returnIndex + fragmentMatch.index + fragmentMatch[0].length
      source =
        source.slice(0, fragmentAt) +
        '\n      <div data-cc-anydb="inventory">\n        <ConnectedInventoryModel />\n      </div>' +
        source.slice(fragmentAt)
    }
  }

  // Mark inventory record cards without relying on historic class names.
  source = source.replace(/<article\b([^>]*)>/g, (full, attrs) => {
    if (/data-cc-record-card\s*=/.test(full)) return full
    return `<article${attrs} data-cc-record-card="true">`
  })

  // Mark the inventory table for consistent record density.
  let tableTagged = false
  source = source.replace(/<table\b([^>]*)>/g, (full, attrs) => {
    if (tableTagged || /data-cc-table\s*=/.test(full)) return full
    tableTagged = true
    return `<table${attrs} data-cc-table="inventory">`
  })

  if (source === original) {
    console.log(`Inventar-Workspace bereits angepasst: ${rel}`)
    return
  }

  const backup = `${file}.bak-v93-anydb-ui`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, source)
  console.log(`Inventar-Workspace AnyDB-inspiriert strukturiert: ${rel}`)
}

patchCss()
patchInventoryWorkspace()
