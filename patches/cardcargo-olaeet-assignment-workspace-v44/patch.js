const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) {
  console.error('FEHLER: App-Root fehlt.')
  process.exit(2)
}

const files = {
  form: path.join(appRoot, 'components', 'warehouse-package-form.tsx'),
  types: path.join(appRoot, 'lib', 'warehouse-packages.ts'),
  newPage: path.join(appRoot, 'app', '(app)', 'warehouse-packages', 'new', 'page.tsx'),
  editPage: path.join(appRoot, 'app', '(app)', 'warehouse-packages', '[id]', 'edit', 'page.tsx'),
  css: path.join(appRoot, 'components', 'warehouse-package-assignment.module.css'),
}

for (const [name, file] of Object.entries(files)) {
  if (name === 'css') continue
  if (!fs.existsSync(file)) {
    throw new Error(`Datei nicht gefunden: ${file}`)
  }
}

const patchDir = __dirname
const cssSource = path.join(patchDir, 'warehouse-package-assignment.module.css')
if (!fs.existsSync(cssSource)) throw new Error('CSS-Modul im Patch fehlt.')

function backup(file) {
  const backupPath = `${file}.bak-olaeet-assignment-v44`
  if (!fs.existsSync(backupPath)) fs.copyFileSync(file, backupPath)
}

function writeIfChanged(file, before, after) {
  if (before === after) return false
  backup(file)
  fs.writeFileSync(file, after)
  return true
}

function replaceOnce(text, search, replacement, label) {
  const count = text.split(search).length - 1
  if (count !== 1) {
    throw new Error(`${label}: erwartet genau 1 Treffer, gefunden ${count}.`)
  }
  return text.replace(search, replacement)
}

function replaceRegexOnce(text, regex, replacement, label) {
  const matches = [...text.matchAll(regex)]
  if (matches.length !== 1) {
    throw new Error(`${label}: erwartet genau 1 Treffer, gefunden ${matches.length}.`)
  }
  return text.replace(regex, replacement)
}

let types = fs.readFileSync(files.types, 'utf8')
if (!types.includes('seller_name: string | null') || !types.includes('price_amount: number | null')) {
  types = replaceOnce(
    types,
`export interface PackagePurchaseChoice {
  id: string
  title: string
  source_listing_id: string | null
  purchased_at: string | null
  status: string
}`,
`export interface PackagePurchaseChoice {
  id: string
  title: string
  source_listing_id: string | null
  purchased_at: string | null
  status: string
  seller_name: string | null
  price_amount: number | null
  currency: string
}`,
    'PackagePurchaseChoice erweitern',
  )
}
writeIfChanged(files.types, fs.readFileSync(files.types, 'utf8'), types)

for (const pageFile of [files.newPage, files.editPage]) {
  const original = fs.readFileSync(pageFile, 'utf8')
  let text = original
  const oldSelect = ".select('id, title, source_listing_id, purchased_at, status')"
  const newSelect = ".select('id, title, source_listing_id, purchased_at, status, seller_name, price_amount, currency')"
  if (text.includes(oldSelect)) {
    text = text.replace(oldSelect, newSelect)
  } else if (!text.includes(newSelect)) {
    throw new Error(`${path.basename(pageFile)}: Purchase-Select nicht gefunden.`)
  }
  writeIfChanged(pageFile, original, text)
}

const originalForm = fs.readFileSync(files.form, 'utf8')
let form = originalForm

if (!form.includes("import styles from './warehouse-package-assignment.module.css'")) {
  form = replaceOnce(
    form,
    "import { purchaseImageCategoryLabels } from '@/lib/purchase-image-categories'\n",
    "import styles from './warehouse-package-assignment.module.css'\n",
    'CSS-Modul importieren',
  )
} else {
  form = form.replace("import { purchaseImageCategoryLabels } from '@/lib/purchase-image-categories'\n", '')
}

if (!form.includes('  useMemo,')) {
  form = replaceOnce(
    form,
`  useEffect,
  useRef,`,
`  useEffect,
  useMemo,
  useRef,`,
    'useMemo importieren',
  )
}

form = form.replace('  filterPurchaseImagesForSelection,\n', '')

if (!form.includes('function subtractDaysFromDate(')) {
  const helperCode = [
    '',
    'function dateTimestamp(value: string | null | undefined) {',
    '  if (!value || !isValidDateOnly(value)) return null',
    "  const timestamp = Date.parse(`${value}T00:00:00Z`)",
    '  return Number.isNaN(timestamp) ? null : timestamp',
    '}',
    '',
    'function subtractDaysFromDate(value: string | null | undefined, days: number) {',
    '  const timestamp = dateTimestamp(value)',
    "  if (timestamp === null || !Number.isInteger(days)) return ''",
    '  const date = new Date(timestamp)',
    '  date.setUTCDate(date.getUTCDate() - days)',
    "  return date.toISOString().slice(0, 10)",
    '}',
    '',
    'function purchaseDistanceDays(purchasedAt: string | null, arrivedAt: string) {',
    '  const purchaseTime = dateTimestamp(purchasedAt)',
    '  const arrivalTime = dateTimestamp(arrivedAt)',
    '  if (purchaseTime === null || arrivalTime === null) return Number.POSITIVE_INFINITY',
    '  return Math.abs(arrivalTime - purchaseTime) / 86_400_000',
    '}',
    '',
    'function isLikelyPurchaseDate(purchasedAt: string | null, arrivedAt: string) {',
    '  const purchaseTime = dateTimestamp(purchasedAt)',
    '  const arrivalTime = dateTimestamp(arrivedAt)',
    '  if (purchaseTime === null || arrivalTime === null) return false',
    '  const diffDays = (arrivalTime - purchaseTime) / 86_400_000',
    '  return diffDays >= 0 && diffDays <= 45',
    '}',
    '',
    'function formatPurchasePrice(amount: number | null, currency: string) {',
    '  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null',
    "  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Number(amount))} ${currency || 'KRW'}`",
    '}',
  ].join('\n')

  const readableRegex = /function readableFileSize\(bytes: number\) \{[\s\S]*?\n\}/g
  const matches = [...form.matchAll(readableRegex)]
  if (matches.length !== 1) {
    throw new Error(`Zuordnungs-Helper einfügen: erwartet genau 1 readableFileSize-Funktion, gefunden ${matches.length}.`)
  }
  form = form.replace(readableRegex, (match) => `${match}${helperCode}`)
}

if (!form.includes("const [purchaseSearch, setPurchaseSearch]")) {
  form = replaceOnce(
    form,
`  const [localImages, setLocalImages] = useState<LocalImage[]>([])
  const localImagesRef = useRef<LocalImage[]>([])`,
`  const [localImages, setLocalImages] = useState<LocalImage[]>([])
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const initialArrivalDate = toDateInput(packageData?.arrived_at)
  const [purchaseDateFrom, setPurchaseDateFrom] = useState(
    subtractDaysFromDate(initialArrivalDate, 45),
  )
  const [purchaseDateTo, setPurchaseDateTo] = useState(initialArrivalDate)
  const [purchaseDateFilterTouched, setPurchaseDateFilterTouched] = useState(false)
  const [purchaseSort, setPurchaseSort] = useState<
    'closest' | 'date_desc' | 'date_asc' | 'price_desc' | 'price_asc' | 'title'
  >('closest')
  const localImagesRef = useRef<LocalImage[]>([])`,
    'Zuordnungs-State einfügen',
  )
}

if (!form.includes('function handleArrivedAtChange(')) {
  form = replaceOnce(
    form,
`  function togglePurchase(purchaseId: string) {
    setSelectedPurchases((current) =>
      current.includes(purchaseId)
        ? current.filter((id) => id !== purchaseId)
        : [...current, purchaseId],
    )
  }`,
`  function togglePurchase(purchaseId: string) {
    setSelectedPurchases((current) =>
      current.includes(purchaseId)
        ? current.filter((id) => id !== purchaseId)
        : [...current, purchaseId],
    )
  }

  function handleArrivedAtChange(value: string) {
    setArrivedAt(value)
    if (!purchaseDateFilterTouched) {
      setPurchaseDateFrom(subtractDaysFromDate(value, 45))
      setPurchaseDateTo(value)
    }
  }

  function applyLikelyDateWindow() {
    if (!arrivedAt) return
    setPurchaseDateFrom(subtractDaysFromDate(arrivedAt, 45))
    setPurchaseDateTo(arrivedAt)
    setPurchaseDateFilterTouched(false)
  }

  function clearPurchaseDateFilter() {
    setPurchaseDateFrom('')
    setPurchaseDateTo('')
    setPurchaseDateFilterTouched(true)
  }`,
    'Datumsfilter-Handler einfügen',
  )
}

form = form.replace(
  'onChange={(event) => setArrivedAt(event.target.value)}',
  'onChange={(event) => handleArrivedAtChange(event.target.value)}',
)

form = form.replace(
/  const selectedPurchaseImages = filterPurchaseImagesForSelection\([\s\S]*?\n  \)\n/,
'',
)

if (!form.includes('const filteredPurchases = useMemo(')) {
  form = replaceOnce(
    form,
`  const visibleManualImages = manualImages.filter(
    (image) => !removedManualImageIds.includes(image.id),
  )`,
`  const visibleManualImages = manualImages.filter(
    (image) => !removedManualImageIds.includes(image.id),
  )
  const packagePreviewImage = visibleManualImages.find((image) => image.signed_url)
  const purchaseImageByPurchaseId = useMemo(() => {
    const result = new Map<string, PackagePurchaseImageChoice>()
    for (const image of purchaseImages) {
      const existing = result.get(image.purchase_id)
      if (!existing || image.position < existing.position) result.set(image.purchase_id, image)
    }
    return result
  }, [purchaseImages])
  const filteredPurchases = useMemo(() => {
    const normalizedSearch = purchaseSearch.trim().toLocaleLowerCase()
    const filtered = purchases.filter((purchase) => {
      const alreadySelected = selectedPurchases.includes(purchase.id)
      if (alreadySelected) return true
      const haystack = [
        purchase.title,
        purchase.source_listing_id,
        purchase.seller_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
      if (normalizedSearch && !haystack.includes(normalizedSearch)) return false
      if (purchaseDateFrom && (!purchase.purchased_at || purchase.purchased_at < purchaseDateFrom)) {
        return false
      }
      if (purchaseDateTo && (!purchase.purchased_at || purchase.purchased_at > purchaseDateTo)) {
        return false
      }
      return true
    })

    return [...filtered].sort((a, b) => {
      const selectionOrder = Number(selectedPurchases.includes(b.id)) - Number(selectedPurchases.includes(a.id))
      if (selectionOrder !== 0) return selectionOrder
      if (purchaseSort === 'closest') {
        const distance = purchaseDistanceDays(a.purchased_at, arrivedAt) - purchaseDistanceDays(b.purchased_at, arrivedAt)
        if (Number.isFinite(distance) && distance !== 0) return distance
      }
      if (purchaseSort === 'date_asc') return (a.purchased_at || '9999-12-31').localeCompare(b.purchased_at || '9999-12-31')
      if (purchaseSort === 'price_desc') return Number(b.price_amount ?? -1) - Number(a.price_amount ?? -1)
      if (purchaseSort === 'price_asc') return Number(a.price_amount ?? Number.MAX_SAFE_INTEGER) - Number(b.price_amount ?? Number.MAX_SAFE_INTEGER)
      if (purchaseSort === 'title') return a.title.localeCompare(b.title, 'de')
      return (b.purchased_at || '').localeCompare(a.purchased_at || '')
    })
  }, [arrivedAt, purchaseDateFrom, purchaseDateTo, purchaseSearch, purchaseSort, purchases, selectedPurchases])`,
    'Gefilterte Einkäufe berechnen',
  )
}

const sectionStartMarker = '<section className="panel">\n        <div className="panel-heading">\n          <div>\n            <h2>Enthaltene Einkäufe</h2>'
const nextSectionMarker = '<section className="panel">\n        <div className="panel-heading">\n          <div>\n            <h2>Manuelle OLAEET-Paketbilder</h2>'

if (!form.includes('className={`panel ${styles.assignmentPanel}`}')) {
  const start = form.indexOf(sectionStartMarker)
  const next = form.indexOf(nextSectionMarker)
  if (start < 0 || next < 0 || next <= start) {
    throw new Error('Einkaufszuordnungs-Section konnte nicht eindeutig gefunden werden.')
  }
  const sectionSource = path.join(patchDir, 'assignment-section.txt')
  if (!fs.existsSync(sectionSource)) throw new Error('assignment-section.txt fehlt.')
  const replacement = fs.readFileSync(sectionSource, 'utf8')
  form = form.slice(0, start) + replacement + form.slice(next)
}

writeIfChanged(files.form, originalForm, form)

if (!fs.existsSync(files.css) || fs.readFileSync(files.css, 'utf8') !== fs.readFileSync(cssSource, 'utf8')) {
  if (fs.existsSync(files.css)) backup(files.css)
  fs.copyFileSync(cssSource, files.css)
}

console.log('OLAEET-Zuordnungsworkspace aktualisiert:')
console.log('  - Split-View Paket / Einkäufe')
console.log('  - Angebotsbilder direkt an Einkäufen')
console.log('  - Suche + Datumsfilter + 45-Tage-Fenster')
console.log('  - Sortierung nach Nähe, Datum, Preis, Titel')
console.log('  - Verkäufer + Preis in der Auswahl')
console.log('  - Auswahlaktionen')
