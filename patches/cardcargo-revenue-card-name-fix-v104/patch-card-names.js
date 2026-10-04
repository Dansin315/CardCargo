const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('Usage: node patch-card-names.js /path/to/poketracker-pwa')

function patchRevenueRoute() {
  const file = path.join(appRoot, 'app/api/revenue/route.ts')
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`)

  let source = fs.readFileSync(file, 'utf8')
  const original = source

  // The actual CardCargo inventory title is stored in inventory_units.item_name.
  // v102 looked at card_name/name/title/... but accidentally omitted item_name,
  // so valid cards fell through to the literal fallback "Einzelkarte".
  const functionPattern = /function cardName\(inventory: GenericRow \| null, item: GenericRow \| null\) \{[\s\S]*?\n\}/
  const match = source.match(functionPattern)
  if (!match) throw new Error('Could not locate cardName() in app/api/revenue/route.ts')

  const replacement = `function cardName(inventory: GenericRow | null, item: GenericRow | null) {
  const inventoryCatalog = objectRow(inventory?.catalog_snapshot)
  const itemCatalog = objectRow(item?.catalog_snapshot)
  const values = [
    // Keep the Umsatz workspace aligned with the Inventory workspace: item_name
    // is the canonical visible card title on inventory_units/purchase_items.
    inventory?.item_name,
    item?.item_name,
    inventory?.card_name,
    inventory?.name,
    inventory?.title,
    inventory?.pokemon_name,
    inventory?.product_name,
    inventory?.display_name,
    item?.card_name,
    item?.name,
    item?.title,
    item?.pokemon_name,
    item?.product_name,
    item?.display_name,
    inventoryCatalog?.englishName,
    inventoryCatalog?.name,
    itemCatalog?.englishName,
    itemCatalog?.name,
  ]
  for (const value of values) {
    const normalized = text(value)
    if (normalized) return normalized
  }
  return 'Einzelkarte'
}`

  source = source.replace(functionPattern, replacement)

  if (source !== original) {
    fs.copyFileSync(file, `${file}.v104.bak`)
    fs.writeFileSync(file, source)
    console.log('Patched: app/api/revenue/route.ts')
  } else {
    console.log('Already fixed: app/api/revenue/route.ts')
  }

  if (!source.includes('inventory?.item_name') || !source.includes('item?.item_name')) {
    throw new Error('Revenue card-name verification failed.')
  }
}

function patchShipmentInventoryImport() {
  const file = path.join(appRoot, 'app/api/shipments/inventory-import/route.ts')
  if (!fs.existsSync(file)) {
    console.log('Skipped optional file: app/api/shipments/inventory-import/route.ts')
    return
  }

  let source = fs.readFileSync(file, 'utf8')
  const original = source

  // v99's import preview used the same incomplete fallback list. This does not
  // affect persistence of item_name, but fixing it keeps previews consistent.
  source = source.replace(
    /function itemName\(item: GenericRow\) \{\n  return \(\n    text\(\n      item\.card_name \|\|/,
    `function itemName(item: GenericRow) {\n  return (\n    text(\n      item.item_name ||\n        item.card_name ||`,
  )

  // Also teach generic aliases about item_name for schemas where a target name
  // column is selected dynamically.
  source = source.replace(
    /const aliases: Record<string, string\[\]> = \{\n  name: \['name', 'card_name', 'title', 'pokemon_name', 'product_name'\],/,
    `const aliases: Record<string, string[]> = {\n  item_name: ['item_name', 'card_name', 'name', 'title', 'pokemon_name', 'product_name'],\n  name: ['name', 'item_name', 'card_name', 'title', 'pokemon_name', 'product_name'],`,
  )
  source = source.replace(
    /  card_name: \['card_name', 'name', 'title', 'pokemon_name', 'product_name'\],/,
    `  card_name: ['card_name', 'item_name', 'name', 'title', 'pokemon_name', 'product_name'],`,
  )
  source = source.replace(
    /  pokemon_name: \['pokemon_name', 'card_name', 'name'\],/,
    `  pokemon_name: ['pokemon_name', 'item_name', 'card_name', 'name'],`,
  )
  source = source.replace(
    /  title: \['title', 'card_name', 'name'\],/,
    `  title: ['title', 'item_name', 'card_name', 'name'],`,
  )

  if (source !== original) {
    fs.copyFileSync(file, `${file}.v104.bak`)
    fs.writeFileSync(file, source)
    console.log('Patched: app/api/shipments/inventory-import/route.ts')
  } else {
    console.log('Already compatible: app/api/shipments/inventory-import/route.ts')
  }
}

patchRevenueRoute()
patchShipmentInventoryImport()
