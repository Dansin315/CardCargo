const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'app/api/shipments/olaeet-details/route.ts'
const file = path.join(appRoot, rel)
if (!fs.existsSync(file)) {
  console.log(`Hinweis: ${rel} nicht gefunden; Kostenintegration übersprungen.`)
  process.exit(0)
}

let source = fs.readFileSync(file, 'utf8')
const original = source

if (!source.includes('async function resolveDirectShipmentPurchaseIds(')) {
  const anchor = 'async function loadBunjangCostBuckets('
  const index = source.indexOf(anchor)
  if (index < 0) {
    console.log('Hinweis: loadBunjangCostBuckets() nicht gefunden; Kostenintegration übersprungen.')
    process.exit(0)
  }

  const helper = `async function resolveDirectShipmentPurchaseIds(\n  supabase: SupabaseClient,\n  userId: string,\n  shipmentId: string,\n) {\n  if (!shipmentId) return []\n  const response = await supabase\n    .from('shipment_bunjang_purchases' as never)\n    .select('purchase_id' as never)\n    .eq('user_id' as never, userId as never)\n    .eq('shipment_id' as never, shipmentId as never)\n  const typed = response as unknown as { data: unknown; error: { message: string } | null }\n  if (typed.error) return []\n  return [...new Set(asRows(typed.data).map((row) => norm(row.purchase_id)).filter(Boolean))]\n}\n\n`
  source = source.slice(0, index) + helper + source.slice(index)
}

const oldBlock = `const purchaseIds = await resolvePurchaseIdsByPackage(auth.supabase, warehouseRows)\n    const purchaseCostBuckets = await loadBunjangCostBuckets(auth.supabase, purchaseIds)`
if (source.includes(oldBlock)) {
  source = source.replace(
    oldBlock,
    `const packagePurchaseIds = await resolvePurchaseIdsByPackage(auth.supabase, warehouseRows)\n    const directPurchaseIds = resolvedShipmentId\n      ? await resolveDirectShipmentPurchaseIds(auth.supabase, auth.user.id, resolvedShipmentId)\n      : []\n    const purchaseIds = [...new Set([...packagePurchaseIds, ...directPurchaseIds])]\n    const purchaseCostBuckets = await loadBunjangCostBuckets(auth.supabase, purchaseIds)`,
  )
} else if (!source.includes('const directPurchaseIds = resolvedShipmentId')) {
  console.log('Hinweis: Kosten-Purchase-Block nicht im erwarteten Format; bestehende Route blieb unverändert.')
}

if (source !== original) {
  const backup = `${file}.bak-v106`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, source)
  console.log(`Patched: ${rel}`)
} else {
  console.log(`Already patched or not applicable: ${rel}`)
}
