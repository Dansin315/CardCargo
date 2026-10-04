const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output

  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true,
  })) {
    const full = path.join(dir, entry.name)

    if (
      entry.name === 'node_modules' ||
      entry.name === '.next' ||
      entry.name === '.git'
    ) {
      continue
    }

    if (entry.isDirectory()) {
      walk(full, output)
    } else if (
      /\.(tsx|ts|jsx|js)$/.test(entry.name)
    ) {
      output.push(full)
    }
  }

  return output
}

for (const base of [
  path.join(appRoot, 'app'),
  path.join(appRoot, 'components'),
]) {
  for (const file of walk(base)) {
    let source = fs.readFileSync(file, 'utf8')
    const original = source

    // Only rename explicit legacy Bunjang URL links. Generic URL import
    // functionality remains in the codebase, it simply isn't the primary
    // purchase-page action anymore.
    source = source.replace(
      /(<(?:Link|a)\b[^>]*href=["'])\/purchases\/new(["'][^>]*>[\s\S]{0,160}?)(Bunjang(?:-| )URL)([\s\S]{0,80}?<\/(?:Link|a)>)/gi,
      '$1/purchases/bunjang-import$2Bunjang Einkäufe importieren$4',
    )

    source = source.replace(
      /Bunjang Bestellungen synchronisieren/g,
      'Bunjang Einkäufe importieren',
    )

    if (source !== original) {
      const backup = `${file}.bak-v82-nav`
      if (!fs.existsSync(backup)) {
        fs.copyFileSync(file, backup)
      }
      fs.writeFileSync(file, source)
      console.log(
        `Navigation aktualisiert: ${path.relative(appRoot, file)}`,
      )
    }
  }
}
