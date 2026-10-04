const fs = require('fs')
const path = require('path')

const root = process.argv[2]
if (!root) throw new Error('App-Root fehlt.')
const patchDir = __dirname
const suffix = '.bak-url-import-grouping-v42'

function read(rel) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) throw new Error(`Datei nicht gefunden: ${rel}`)
  return fs.readFileSync(file, 'utf8')
}
function write(rel, content) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file + suffix)) fs.copyFileSync(file, file + suffix)
  fs.writeFileSync(file, content)
  console.log(`aktualisiert: ${rel}`)
}
function replaceOnce(text, oldValue, newValue, label) {
  const count = text.split(oldValue).length - 1
  if (count !== 1) throw new Error(`${label}: erwartet 1 Treffer, gefunden ${count}.`)
  return text.replace(oldValue, newValue)
}

// 1) URL import: Enter => preview, digit-only price fields, merged response.
{
  const rel = 'components/purchase-import-form.tsx'
  let text = read(rel)
  let changed = false

  if (!text.includes('function digitsOnlyInput(')) {
    const marker = "function readableFileSize(bytes: number) {\n  return `${(bytes / 1024 / 1024).toFixed(1)} MB`\n}\n"
    text = replaceOnce(
      text,
      marker,
      marker + "\nfunction digitsOnlyInput(value: string) {\n  return value.replace(/\\D+/g, '')\n}\n",
      'digitsOnlyInput',
    )
    changed = true
  }

  if (!text.includes('aria-label="Bunjang-Angebots-URL"\n            autoFocus')) {
    text = replaceOnce(
      text,
      '            aria-label="Bunjang-Angebots-URL"\n            type="url"',
      '            aria-label="Bunjang-Angebots-URL"\n            autoFocus\n            type="url"',
      'URL autofocus',
    )
    changed = true
  }

  if (!text.includes('className="url-row"\n          onSubmit=')) {
    text = replaceOnce(
      text,
      '        <div className="url-row">\n          <input',
      '        <form\n          className="url-row"\n          onSubmit={(event) => {\n            event.preventDefault()\n            if (!url || previewing) return\n            void loadPreview()\n          }}\n        >\n          <input',
      'URL preview form start',
    )
    text = replaceOnce(
      text,
      '<button className="button button-primary" type="button" onClick={loadPreview} disabled={!url || previewing}>',
      '<button className="button button-primary" type="submit" disabled={!url || previewing}>',
      'Preview submit button',
    )
    const manualEnd = `          <button className="button button-secondary" type="button" onClick={enableManualMode} disabled={!url}>\n            Manuell\n          </button>\n        </div>`
    text = replaceOnce(
      text,
      manualEnd,
      manualEnd.replace('</div>', '</form>'),
      'URL preview form end',
    )
    changed = true
  }

  const numberInputRegex = /type="number"\n\s+min="0"\n\s+step="1"\n\s+value=\{fields\.priceAmount\}\n\s+onChange=\{\(event\) => setFields\(\{ \.\.\.fields, priceAmount: event\.target\.value \}\)\}/
  if (numberInputRegex.test(text)) {
    text = text.replace(
      numberInputRegex,
      `type="text"\n                  inputMode="numeric"\n                  pattern="[0-9]*"\n                  value={fields.priceAmount}\n                  onChange={(event) =>\n                    setFields({ ...fields, priceAmount: digitsOnlyInput(event.target.value) })\n                  }`,
    )
    changed = true
  }

  const shippingRegex = /type="number"\n\s+min="0"\n\s+step="1"\n\s+value=\{fields\.domesticShippingAmount\}\n\s+onChange=\{\(event\) =>\n\s+setFields\(\{ \.\.\.fields, domesticShippingAmount: event\.target\.value \}\)\n\s+\}/
  if (shippingRegex.test(text)) {
    text = text.replace(
      shippingRegex,
      `type="text"\n                  inputMode="numeric"\n                  pattern="[0-9]*"\n                  value={fields.domesticShippingAmount}\n                  onChange={(event) =>\n                    setFields({ ...fields, domesticShippingAmount: digitsOnlyInput(event.target.value) })\n                  }`,
    )
    changed = true
  }

  if (!text.includes('merged?: boolean')) {
    text = replaceOnce(
      text,
      "const result = (await response.json()) as { id?: string; error?: string; warnings?: string[] }",
      "const result = (await response.json()) as { id?: string; merged?: boolean; error?: string; warnings?: string[] }",
      'Merge response type',
    )
    text = replaceOnce(
      text,
      "      const warningCount = result.warnings?.length ?? 0\n      const warningQuery = warningCount ? `&warnings=${warningCount}` : ''\n      router.push(`/purchases/${result.id}?created=1${warningQuery}`)",
      "      const warningCount = result.warnings?.length ?? 0\n      const warningQuery = warningCount ? `&warnings=${warningCount}` : ''\n      const resultState = result.merged ? 'merged=1' : 'created=1'\n      router.push(`/purchases/${result.id}?${resultState}${warningQuery}`)",
      'Merge redirect',
    )
    changed = true
  }

  if (changed) write(rel, text)
  else console.log(`bereits aktuell: ${rel}`)
}

// 2) Purchase POST: replace only the POST implementation, keep local imports/helpers.
{
  const rel = 'app/api/purchases/route.ts'
  let text = read(rel)
  if (!text.includes('grouped_listing_count')) {
    const start = text.indexOf('export async function POST(request: Request) {')
    if (start < 0) throw new Error('Purchase API: POST-Marker nicht gefunden.')
    const post = fs.readFileSync(path.join(patchDir, 'route-post.txt'), 'utf8').trimEnd() + '\n'
    text = text.slice(0, start) + post
    write(rel, text)
  } else {
    console.log(`bereits aktuell: ${rel}`)
  }
}

// 3) Detail page: grouped source rendering + scroll button.
{
  const rel = 'app/(app)/purchases/[id]/page.tsx'
  let text = read(rel)
  let changed = false

  if (!text.includes('function readGroupedPurchaseListings(')) {
    const marker = "export const dynamic = 'force-dynamic'\n"
    const helper = `\ntype PurchaseListingDetail = {\n  title: string\n  description: string\n  listingUrl: string\n  canonicalUrl: string | null\n}\n\nfunction readGroupedPurchaseListings(rawMetadata: unknown): PurchaseListingDetail[] {\n  if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) return []\n  const entries = (rawMetadata as { grouped_listings?: unknown }).grouped_listings\n  if (!Array.isArray(entries)) return []\n  return entries.flatMap((entry) => {\n    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []\n    const value = entry as Record<string, unknown>\n    if (typeof value.title !== 'string' || typeof value.listingUrl !== 'string') return []\n    return [{\n      title: value.title,\n      description: typeof value.description === 'string' ? value.description : '',\n      listingUrl: value.listingUrl,\n      canonicalUrl: typeof value.canonicalUrl === 'string' ? value.canonicalUrl : null,\n    }]\n  })\n}\n`
    text = replaceOnce(text, marker, marker + helper, 'Detail helper')
    changed = true
  }

  if (!text.includes('merged?: string')) {
    text = replaceOnce(
      text,
      'searchParams: Promise<{ created?: string; updated?: string; warnings?: string }>',
      'searchParams: Promise<{ created?: string; merged?: string; updated?: string; warnings?: string }>',
      'Detail merged search param',
    )
    changed = true
  }

  if (!text.includes('raw_metadata, purchase_images(')) {
    text = replaceOnce(
      text,
      'service_fee_amount, purchased_at, status, created_at, updated_at, purchase_images(',
      'service_fee_amount, purchased_at, status, created_at, updated_at, raw_metadata, purchase_images(',
      'Detail raw metadata select',
    )
    changed = true
  }

  if (!text.includes('const groupedListings = readGroupedPurchaseListings')) {
    text = replaceOnce(
      text,
      '  const purchase = data as unknown as PurchaseRow\n',
      '  const purchase = data as unknown as PurchaseRow & { raw_metadata?: unknown }\n  const groupedListings = readGroupedPurchaseListings(purchase.raw_metadata)\n  const isGroupedPurchase = groupedListings.length > 1\n',
      'Detail grouped state',
    )
    changed = true
  }

  if (!text.includes("query.merged === '1'")) {
    const createdBlock = `      {query.created === '1' ? (\n        <div className="alert alert-success">\n          Einkauf und {images.length} Angebotsbild{images.length === 1 ? '' : 'er'} wurden erfolgreich gespeichert.\n        </div>\n      ) : null}\n`
    const mergedBlock = `${createdBlock}      {query.merged === '1' ? (\n        <div className="alert alert-success">\n          Das Angebot wurde mit dem bestehenden Einkauf desselben Verkäufers und Kaufdatums zusammengefasst.\n        </div>\n      ) : null}\n`
    text = replaceOnce(text, createdBlock, mergedBlock, 'Detail merge success')
    changed = true
  }

  if (!text.includes('Originalangebote anzeigen ↓')) {
    const oldButton = `          <a\n            className="button button-secondary"\n            href={purchase.canonical_url || purchase.listing_url}\n            target="_blank"\n            rel="noreferrer"\n          >\n            Originalangebot öffnen ↗\n          </a>`
    const newButton = `          {isGroupedPurchase ? (\n            <a className="button button-secondary" href="#purchase-descriptions">\n              Originalangebote anzeigen ↓\n            </a>\n          ) : (\n            <a\n              className="button button-secondary"\n              href={purchase.canonical_url || purchase.listing_url}\n              target="_blank"\n              rel="noreferrer"\n            >\n              Originalangebot öffnen ↗\n            </a>\n          )}`
    text = replaceOnce(text, oldButton, newButton, 'Detail original offer button')
    changed = true
  }

  if (!text.includes('purchase-description-entry')) {
    const oldDescription = `          {purchase.description ? (\n            <div className="description-block">\n              <span className="section-label">Beschreibung / Notizen</span>\n              <p>{purchase.description}</p>\n            </div>\n          ) : null}`
    const newDescription = `          {isGroupedPurchase ? (\n            <div className="description-block" id="purchase-descriptions">\n              <span className="section-label">Beschreibung / Originalangebote</span>\n              <div className="purchase-description-list">\n                {groupedListings.map((entry, index) => (\n                  <div key={\`${'${entry.canonicalUrl || entry.listingUrl}'}-${'${index}'}\`}>\n                    {index > 0 ? <div className="purchase-description-separator">&&</div> : null}\n                    <article className="purchase-description-entry">\n                      <strong>{entry.title}</strong>\n                      {entry.description ? <p>{entry.description}</p> : <p className="muted">Keine Beschreibung erfasst.</p>}\n                      <a href={entry.canonicalUrl || entry.listingUrl} target="_blank" rel="noreferrer">\n                        Originalangebot öffnen ↗\n                      </a>\n                    </article>\n                  </div>\n                ))}\n              </div>\n            </div>\n          ) : purchase.description ? (\n            <div className="description-block" id="purchase-descriptions">\n              <span className="section-label">Beschreibung / Notizen</span>\n              <p>{purchase.description}</p>\n            </div>\n          ) : null}`
    text = replaceOnce(text, oldDescription, newDescription, 'Detail grouped descriptions')
    changed = true
  }

  if (changed) write(rel, text)
  else console.log(`bereits aktuell: ${rel}`)
}

// 4) Keep grouped purchases editable even when title/description become longer.
{
  const rel = 'lib/importer/schema.ts'
  let text = read(rel)
  let changed = false
  const marker = 'export const updatePurchaseSchema = z.object({'
  const idx = text.indexOf(marker)
  if (idx < 0) throw new Error('Update-Schema nicht gefunden.')
  const before = text.slice(0, idx)
  let after = text.slice(idx)
  if (after.includes("title: z.string().trim().min(1).max(300),")) {
    after = after.replace("title: z.string().trim().min(1).max(300),", "title: z.string().trim().min(1).max(5_000),")
    changed = true
  }
  if (after.includes("description: z.string().max(10_000).default(''),")) {
    after = after.replace("description: z.string().max(10_000).default(''),", "description: z.string().max(50_000).default(''),")
    changed = true
  }
  if (changed) write(rel, before + after)
  else console.log(`bereits aktuell: ${rel}`)
}

// 5) Styling for grouped listing descriptions.
{
  const rel = 'app/globals.css'
  let text = read(rel)
  if (!text.includes('/* CardCargo grouped purchase descriptions v42 */')) {
    text += `\n\n/* CardCargo grouped purchase descriptions v42 */\n.purchase-description-list {\n  display: grid;\n  gap: 0.75rem;\n  margin-top: 0.75rem;\n}\n.purchase-description-entry {\n  display: grid;\n  gap: 0.5rem;\n  padding: 0.85rem 0;\n}\n.purchase-description-entry > strong {\n  font-size: 0.95rem;\n  font-weight: 650;\n}\n.purchase-description-entry > p {\n  margin: 0;\n  white-space: pre-wrap;\n}\n.purchase-description-entry > a {\n  width: fit-content;\n  font-size: 0.9rem;\n}\n.purchase-description-separator {\n  border-top: 1px solid var(--border, rgba(127, 127, 127, 0.25));\n  padding-top: 0.75rem;\n  color: var(--muted-foreground, #777);\n  font-size: 0.8rem;\n  font-weight: 700;\n  letter-spacing: 0.08em;\n}\n#purchase-descriptions {\n  scroll-margin-top: 6rem;\n}\n`
    write(rel, text)
  } else {
    console.log(`bereits aktuell: ${rel}`)
  }
}

console.log('v42 fertig: URL-Enter, numerische Eingabe, Auto-Gruppierung und Detaildarstellung.')
