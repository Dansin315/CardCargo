const fs = require('fs')
const path = require('path')

const root = process.argv[2]
if (!root) throw new Error('App-Root fehlt.')

function read(rel) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) throw new Error(`Datei fehlt: ${rel}`)
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

function write(rel, content) {
  const file = path.join(root, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content.endsWith('\n') ? content : content + '\n')
}

function backup(rel) {
  const file = path.join(root, rel)
  const bak = `${file}.bak-purchases-v38`
  if (fs.existsSync(file) && !fs.existsSync(bak)) fs.copyFileSync(file, bak)
}

function mustReplace(content, before, after, label) {
  if (content.includes(after)) return content
  const count = content.split(before).length - 1
  if (count !== 1) throw new Error(`${label}: erwartet 1 Treffer, gefunden ${count}.`)
  return content.replace(before, after)
}

// 1) Purchase page: full replacement based on the verified feature/olaeet-module page.
backup('app/(app)/purchases/page.tsx')
const pageTemplate = fs.readFileSync(path.join(__dirname, 'purchases-page.tsx'), 'utf8')
write('app/(app)/purchases/page.tsx', pageTemplate)

// 2) Purchase edit UI: allow removal of ALL archived images, not just manual ones.
let edit = read('components/purchase-edit-form.tsx')
backup('components/purchase-edit-form.tsx')
edit = edit.replaceAll('deleteManualImageIds', 'deleteImageIds')
edit = edit.replaceAll('setDeleteManualImageIds', 'setDeleteImageIds')
edit = mustReplace(
  edit,
  '              Manuelle Bilder können ergänzt oder entfernt werden. Automatisch archivierte\n              Angebotsbilder bleiben geschützt.',
  '              Bilder können ergänzt oder entfernt werden – auch automatisch importierte Angebotsbilder.\n              Mindestens ein Bild muss beim Einkauf archiviert bleiben.',
  'Hinweis Bildverwaltung',
)
edit = mustReplace(
  edit,
  "                    {image.kind === 'remote'\n                      ? 'Automatisch archiviert'\n                      : marked\n                        ? 'Wird beim Speichern entfernt'\n                        : 'Manuell hochgeladen'}",
  "                    {marked\n                      ? 'Wird beim Speichern entfernt'\n                      : image.kind === 'remote'\n                        ? 'Automatisch archiviert'\n                        : 'Manuell hochgeladen'}",
  'Bildstatus',
)
edit = mustReplace(
  edit,
  "                {image.kind === 'manual' ? (\n                  <button\n                    className=\"button button-ghost button-small\"\n                    type=\"button\"\n                    onClick={() => toggleExistingImageDeletion(image.id)}\n                  >\n                    {marked ? 'Behalten' : 'Entfernen'}\n                  </button>\n                ) : null}",
  "                <button\n                  className=\"button button-ghost button-small\"\n                  type=\"button\"\n                  onClick={() => toggleExistingImageDeletion(image.id)}\n                >\n                  {marked ? 'Behalten' : 'Entfernen'}\n                </button>",
  'Entfernen-Button für Importbilder',
)
write('components/purchase-edit-form.tsx', edit)

// 3) Schema: accept generic deleteImageIds; keep old field for compatibility.
let schema = read('lib/importer/schema.ts')
backup('lib/importer/schema.ts')
if (!schema.includes('deleteImageIds:')) {
  schema = mustReplace(
    schema,
    "  deleteManualImageIds: z.array(z.string().uuid()).max(24).default([]),",
    "  deleteImageIds: z.array(z.string().uuid()).max(24).default([]),\n  deleteManualImageIds: z.array(z.string().uuid()).max(24).default([]),",
    'Schema deleteImageIds',
  )
}
write('lib/importer/schema.ts', schema)

// 4) Image service: imported images become removable too.
let images = read('lib/purchase-images.ts')
backup('lib/purchase-images.ts')
images = mustReplace(
  images,
  ".filter((row) => row.kind === 'manual' && deletedImageIds.includes(row.id))",
  ".filter((row) => deletedImageIds.includes(row.id))",
  'Removable image ids',
)
images = images.replace('export async function removeManualPurchaseImages({', 'export async function removePurchaseImages({')
images = images.replace("    .select('id, storage_path, kind')", "    .select('id, storage_path')")
images = images.replace("  if (rows.some((row) => row.kind !== 'manual')) {\n    throw new Error('Automatisch archivierte Angebotsbilder können nicht hier gelöscht werden.')\n  }\n\n", '')
if (!images.includes('export const removeManualPurchaseImages = removePurchaseImages')) {
  images += '\n// Backwards-compatible alias for older imports.\nexport const removeManualPurchaseImages = removePurchaseImages\n'
}
write('lib/purchase-images.ts', images)

// 5) Purchase PATCH route: use generic image deletion and merge legacy payloads.
let route = read('app/api/purchases/[id]/route.ts')
backup('app/api/purchases/[id]/route.ts')
route = route.replace('  removeManualPurchaseImages,', '  removePurchaseImages,')
if (!route.includes('const deleteImageIds =')) {
  route = mustReplace(
    route,
    '    const input = updatePurchaseSchema.parse(await request.json())\n    const admin = createAdminClient()',
    "    const input = updatePurchaseSchema.parse(await request.json())\n    const deleteImageIds = [...new Set([...input.deleteImageIds, ...input.deleteManualImageIds])]\n    const admin = createAdminClient()",
    'Route deleteImageIds',
  )
}
route = route.replace('deletedImageIds: input.deleteManualImageIds,', 'deletedImageIds: deleteImageIds,')
route = route.replace('imageIds: input.deleteManualImageIds,', 'imageIds: deleteImageIds,')
route = route.replace('await removeManualPurchaseImages({', 'await removePurchaseImages({')
write('app/api/purchases/[id]/route.ts', route)

// 6) CSS append.
let css = read('app/globals.css')
backup('app/globals.css')
const marker = '/* BEGIN CardCargo purchases management v38 */'
if (!css.includes(marker)) {
  css += `\n\n${marker}\n.purchase-workspace { display: grid; gap: 16px; }\n.purchase-toolbar { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 14px; }\n.purchase-toolbar-left, .purchase-toolbar-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }\n.purchase-sort-control { display: grid; gap: 5px; min-width: min(100%, 270px); }\n.purchase-sort-control > span { color: var(--muted); font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }\n.purchase-bulk-panel { display: grid; gap: 16px; padding: 18px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface-soft); }\n.purchase-bulk-heading { display: flex; justify-content: space-between; gap: 16px; align-items: start; }\n.purchase-bulk-heading strong, .purchase-bulk-heading span { display: block; }\n.purchase-bulk-heading span { margin-top: 3px; color: var(--muted); font-size: .82rem; }\n.purchase-bulk-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }\n.purchase-bulk-field { display: grid; gap: 8px; }\n.purchase-bulk-field > span { display: flex; gap: 8px; align-items: center; }\n.purchase-bulk-field input[type=checkbox], .purchase-select-cell input, .purchase-select-all input { width: 18px; height: 18px; min-height: 18px; }\n.purchase-bulk-actions { display: flex; justify-content: flex-end; }\n.purchase-select-all { display: flex; justify-content: flex-start; }\n.purchase-select-all label { display: inline-flex; gap: 8px; align-items: center; color: var(--muted); font-size: .82rem; cursor: pointer; }\n.purchase-list-manage { overflow: visible; }\n.purchase-manage-row { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: stretch; border-top: 1px solid var(--border); }\n.purchase-manage-row:first-child { border-top: 0; }\n.purchase-select-cell { display: grid; place-items: center; cursor: pointer; }\n.purchase-row-managed { border-top: 0; }\n.purchase-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.purchase-page-numbers { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }\n.purchase-page-number { display: inline-grid; place-items: center; min-width: 36px; height: 36px; padding: 0 8px; border: 1px solid var(--border); border-radius: 10px; font-size: .82rem; font-weight: 800; }\n.purchase-page-number:hover, .purchase-page-number.active { color: var(--accent-dark); border-color: #cfc6ff; background: var(--accent-soft); }\n.button.is-disabled { pointer-events: none; opacity: .42; }\n@media (max-width: 720px) { .purchase-toolbar, .purchase-pagination { align-items: stretch; flex-direction: column; } .purchase-toolbar-left, .purchase-toolbar-actions { align-items: stretch; flex-direction: column; } .purchase-sort-control { width: 100%; } .purchase-bulk-grid { grid-template-columns: 1fr; } .purchase-page-numbers { order: -1; } }\n/* END CardCargo purchases management v38 */\n`
}
write('app/globals.css', css)

console.log('CardCargo purchases management v38 erfolgreich angewendet.')
console.log('Geändert/neu:')
console.log('  - app/(app)/purchases/page.tsx')
console.log('  - components/purchase-list-workspace.tsx')
console.log('  - app/api/purchases/bulk/route.ts')
console.log('  - components/purchase-edit-form.tsx')
console.log('  - lib/importer/schema.ts')
console.log('  - lib/purchase-images.ts')
console.log('  - app/api/purchases/[id]/route.ts')
console.log('  - app/globals.css')
