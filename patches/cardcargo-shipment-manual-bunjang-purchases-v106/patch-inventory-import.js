const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'app/api/shipments/inventory-import/route.ts'
const file = path.join(appRoot, rel)
if (!fs.existsSync(file)) {
  throw new Error(`${rel} nicht gefunden. v99 muss vor v106 installiert sein.`)
}

let source = fs.readFileSync(file, 'utf8')
const original = source

const helperMarker = 'async function resolveManualShipmentPurchaseIds('
if (!source.includes(helperMarker)) {
  const anchor = 'async function loadCandidates('
  const index = source.indexOf(anchor)
  if (index < 0) throw new Error('loadCandidates() in inventory-import route nicht gefunden.')

  const helper = `async function resolveManualShipmentPurchaseIds(\n  supabase: SupabaseClient,\n  userId: string,\n  shipmentId: string,\n) {\n  const response = await supabase\n    .from('shipment_bunjang_purchases' as never)\n    .select('purchase_id' as never)\n    .eq('user_id' as never, userId as never)\n    .eq('shipment_id' as never, shipmentId as never)\n\n  const typed = response as unknown as { data: unknown; error: { message: string } | null }\n  if (typed.error) return []\n  return [...new Set(rows(typed.data).map((row) => text(row.purchase_id)).filter(Boolean))]\n}\n\n`
  source = source.slice(0, index) + helper + source.slice(index)
}

if (!/manualPurchaseIds:\s*string\[\]/.test(source)) {
  const signature = /async function loadCandidates\(\s*supabase: SupabaseClient,\s*packages: GenericRow\[\],\s*\) \{/m
  if (!signature.test(source)) throw new Error('loadCandidates-Signatur konnte nicht erweitert werden.')
  source = source.replace(
    signature,
    `async function loadCandidates(\n  supabase: SupabaseClient,\n  packages: GenericRow[],\n  manualPurchaseIds: string[] = [],\n) {`,
  )
}

if (!source.includes('purchaseIds: packagePurchaseIds')) {
  const oldLine = 'const { purchaseIds, packageByPurchase } = await resolvePurchaseIdsByPackages(supabase, packages)'
  if (!source.includes(oldLine)) throw new Error('Purchase-ID-Zeile in loadCandidates() nicht gefunden.')
  source = source.replace(
    oldLine,
    `const { purchaseIds: packagePurchaseIds, packageByPurchase } = await resolvePurchaseIdsByPackages(supabase, packages)\n  const purchaseIds = [...new Set([...packagePurchaseIds, ...manualPurchaseIds])]`,
  )
}

if (!source.includes('const manualPurchaseIds = await resolveManualShipmentPurchaseIds(')) {
  const oldCall = 'const candidates = await loadCandidates(auth.supabase, packages)'
  if (!source.includes(oldCall)) throw new Error('loadCandidates-Aufruf in prepare() nicht gefunden.')
  source = source.replace(
    oldCall,
    `const manualPurchaseIds = await resolveManualShipmentPurchaseIds(\n    auth.supabase,\n    auth.user.id,\n    shipment.shipmentId,\n  )\n  const candidates = await loadCandidates(auth.supabase, packages, manualPurchaseIds)`,
  )
}

if (source !== original) {
  const backup = `${file}.bak-v106`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, source)
  console.log(`Patched: ${rel}`)
} else {
  console.log(`Already patched: ${rel}`)
}
