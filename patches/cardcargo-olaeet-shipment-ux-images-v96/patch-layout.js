const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT missing.')

const candidates = [
  path.join(appRoot, 'app', '(app)', 'layout.tsx'),
  path.join(appRoot, 'src', 'app', '(app)', 'layout.tsx'),
]
const file = candidates.find((entry) => fs.existsSync(entry))
if (!file) throw new Error('App layout not found.')

const statement = "import { ArchivedImageDownloadEnhancer } from '@/components/archived-image-download-enhancer'"
let source = fs.readFileSync(file, 'utf8')
const before = source

if (!source.includes(statement)) {
  const directive = source.match(/^\s*['\"]use client['\"];?\s*\n/)
  if (directive) {
    const at = directive[0].length
    source = source.slice(0, at) + statement + '\n' + source.slice(at)
  } else {
    source = statement + '\n' + source
  }
}

if (!source.includes('<ArchivedImageDownloadEnhancer')) {
  const mainIndex = source.indexOf('<main')
  if (mainIndex < 0) throw new Error('Could not find <main> in app layout.')
  source = source.slice(0, mainIndex) + '<ArchivedImageDownloadEnhancer />\n        ' + source.slice(mainIndex)
}

if (source !== before) {
  const backup = `${file}.bak-v96`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, source)
  console.log(`Patched: ${path.relative(appRoot, file)}`)
} else {
  console.log('App layout already matches v96.')
}
