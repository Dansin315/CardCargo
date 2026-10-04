const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT missing.')

const statement =
  "import { ArchivedImageDownloadEnhancer } from '@/components/archived-image-download-enhancer'"

function ensureImport(source, importStatement) {
  if (source.includes(importStatement)) return source

  const directive = source.match(/^\s*['\"]use client['\"];?\s*\n/)
  if (directive) {
    const at = directive[0].length
    return source.slice(0, at) + importStatement + '\n' + source.slice(at)
  }

  return importStatement + '\n' + source
}

function removeGlobalLayoutMount() {
  const candidates = [
    path.join(appRoot, 'app', '(app)', 'layout.tsx'),
    path.join(appRoot, 'src', 'app', '(app)', 'layout.tsx'),
  ]

  const file = candidates.find((entry) => fs.existsSync(entry))
  if (!file) return

  let source = fs.readFileSync(file, 'utf8')
  const before = source

  source = source
    .split(/\r?\n/)
    .filter((line) => line.trim() !== statement)
    .join('\n')

  source = source.replace(/\s*<ArchivedImageDownloadEnhancer\s*\/>\s*/g, '\n')

  if (source !== before) {
    const backup = `${file}.bak-v97`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    fs.writeFileSync(file, source)
    console.log(`Removed old global enhancer mount: ${path.relative(appRoot, file)}`)
  }
}

function insertIntoOpeningTag(source, tagStart, jsx) {
  const close = source.indexOf('>', tagStart)
  if (close < 0) return null

  const opening = source.slice(tagStart, close + 1)
  if (/\/>\s*$/.test(opening)) return null

  return source.slice(0, close + 1) + `\n      ${jsx}` + source.slice(close + 1)
}

function patchNavigation() {
  const candidates = [
    path.join(appRoot, 'components', 'app-navigation.tsx'),
    path.join(appRoot, 'src', 'components', 'app-navigation.tsx'),
    path.join(appRoot, 'components', 'app-navigation.jsx'),
    path.join(appRoot, 'src', 'components', 'app-navigation.jsx'),
  ]

  const file = candidates.find((entry) => fs.existsSync(entry))
  if (!file) return false

  let source = fs.readFileSync(file, 'utf8')
  const before = source
  source = ensureImport(source, statement)

  if (!source.includes('<ArchivedImageDownloadEnhancer')) {
    const exportIndex = Math.max(
      source.indexOf('export function AppNavigation'),
      source.indexOf('export default function AppNavigation'),
      source.indexOf('function AppNavigation'),
    )

    const searchStart = exportIndex >= 0 ? exportIndex : 0
    const navIndex = source.indexOf('<nav', searchStart)

    if (navIndex >= 0) {
      const updated = insertIntoOpeningTag(
        source,
        navIndex,
        '<ArchivedImageDownloadEnhancer />',
      )
      if (updated) source = updated
    }
  }

  if (!source.includes('<ArchivedImageDownloadEnhancer')) {
    return false
  }

  if (source !== before) {
    const backup = `${file}.bak-v97`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    fs.writeFileSync(file, source)
    console.log(`Mounted archive download enhancer: ${path.relative(appRoot, file)}`)
  } else {
    console.log('Archive download enhancer is already mounted in AppNavigation.')
  }

  return true
}

function patchDetailPage(relativeCandidates) {
  const candidates = relativeCandidates.map((relative) => path.join(appRoot, relative))
  const file = candidates.find((entry) => fs.existsSync(entry))
  if (!file) return false

  let source = fs.readFileSync(file, 'utf8')
  const before = source
  source = ensureImport(source, statement)

  if (!source.includes('<ArchivedImageDownloadEnhancer')) {
    const exportIndex = source.search(/export\s+default\s+(?:async\s+)?function\b/)
    const returnMatch = source.slice(Math.max(0, exportIndex)).match(/return\s*\(/)

    if (returnMatch) {
      const returnIndex = Math.max(0, exportIndex) + returnMatch.index + returnMatch[0].length
      const fragmentIndex = source.indexOf('<>', returnIndex)
      const firstTagMatch = source.slice(returnIndex).match(/<(div|main|section)\b[^>]*>/)
      const firstTagIndex = firstTagMatch ? returnIndex + firstTagMatch.index : -1

      if (fragmentIndex >= 0 && (firstTagIndex < 0 || fragmentIndex < firstTagIndex)) {
        source =
          source.slice(0, fragmentIndex + 2) +
          '\n      <ArchivedImageDownloadEnhancer />' +
          source.slice(fragmentIndex + 2)
      } else if (firstTagIndex >= 0) {
        const updated = insertIntoOpeningTag(
          source,
          firstTagIndex,
          '<ArchivedImageDownloadEnhancer />',
        )
        if (updated) source = updated
      }
    }
  }

  if (!source.includes('<ArchivedImageDownloadEnhancer')) return false

  if (source !== before) {
    const backup = `${file}.bak-v97`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    fs.writeFileSync(file, source)
    console.log(`Mounted archive download enhancer: ${path.relative(appRoot, file)}`)
  }

  return true
}

removeGlobalLayoutMount()

let mounted = patchNavigation()

// Fallback for installations where AppNavigation is structured unusually or
// does not exist. Mount only on the two views where downloads are intended.
if (!mounted) {
  const purchaseMounted = patchDetailPage([
    path.join('app', '(app)', 'purchases', '[id]', 'page.tsx'),
    path.join('src', 'app', '(app)', 'purchases', '[id]', 'page.tsx'),
  ])
  const warehouseMounted = patchDetailPage([
    path.join('app', '(app)', 'warehouse-packages', '[id]', 'page.tsx'),
    path.join('src', 'app', '(app)', 'warehouse-packages', '[id]', 'page.tsx'),
  ])
  mounted = purchaseMounted || warehouseMounted
}

if (!mounted) {
  throw new Error(
    'Could not mount ArchivedImageDownloadEnhancer in AppNavigation or the supported detail pages.',
  )
}
