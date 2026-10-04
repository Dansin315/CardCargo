const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'lib/bunjang-order-import.ts'
const file = path.join(appRoot, rel)

if (!fs.existsSync(file)) {
  throw new Error(`Datei nicht gefunden: ${rel}`)
}

let src = fs.readFileSync(file, 'utf8')
let changed = false

if (!src.includes('  productUrls: string[]')) {
  const anchor = '  imageUrls: string[]'

  if (!src.includes(anchor)) {
    throw new Error(
      'v80: imageUrls im BunjangOrderRecord-Interface nicht gefunden.',
    )
  }

  src = src.replace(
    anchor,
    `  productUrls: string[]\n${anchor}`,
  )
  changed = true
}

if (!src.includes('productUrls: [...new Set(snapshot.productUrls ?? [])]')) {
  const returnAnchor =
    '    imageUrls: [...new Set(snapshot.imageUrls ?? [])].slice(0, 12),'

  if (!src.includes(returnAnchor)) {
    throw new Error(
      'v80: imageUrls-Return im Bunjang-Parser nicht gefunden.',
    )
  }

  src = src.replace(
    returnAnchor,
    `    productUrls: [...new Set(snapshot.productUrls ?? [])].slice(0, 8),\n${returnAnchor}`,
  )
  changed = true
}

if (changed) {
  const backup = `${file}.bak-v80`
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup)
  }

  fs.writeFileSync(file, src)
  console.log(
    'v80: Bunjang-Parser bewahrt productUrls für den kombinierten Order+Listing-Sync.',
  )
} else {
  console.log('v80: productUrls sind im Parser bereits vorhanden.')
}
