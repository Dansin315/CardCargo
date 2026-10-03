'use client'

import Link from 'next/link'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { InventoryLanguageFlag } from '@/components/inventory-language-flag'
import { InventoryCatalogPicker } from '@/components/inventory-catalog-picker'
import {
  inventoryLanguageFlag,
  inventoryLanguageLabel,
  inventoryLanguageOptions,
} from '@/lib/inventory-languages'

import { ConnectedInventoryModel } from '@/components/connected-inventory-model'
import { InventoryShipmentFilter } from '@/components/inventory-shipment-filter'
export type InventoryWorkspaceImage = {
  id: string
  signedUrl: string | null
  originalFilename: string | null
  sourceType: 'manual' | 'purchase' | 'warehouse_package'
  position: number
}

export type InventoryWorkspaceSourceImage = {
  sourceType: 'purchase' | 'warehouse_package'
  sourceImageId: string
  signedUrl: string | null
  label: string
}

export type InventoryWorkspaceUnit = {
  id: string
  purchaseItemId: string | null
  itemName: string
  pokemonNameEn: string | null
  pokemonSpecies: string[]
  setName: string | null
  setCode: string | null
  cardNumber: string | null
  language: string | null
  rarity: string | null
  quantity: number
  condition: string | null
  gradingCompany: string | null
  grade: string | null
  storageLocation: string | null
  allocatedTotalCost: number | null
  costCurrency: string
  estimatedValue: number | null
  estimatedValueCurrency: string
  status: string
  salePrice: number | null
  saleCurrency: string | null
  soldAt: string | null
  purchasedAt: string | null
  arrivedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  imageUrl: string | null
  images: InventoryWorkspaceImage[]
  sourceImages: InventoryWorkspaceSourceImage[]
  sourceLabel: string
  sourceHref: string | null
}

export type InventoryWorkspacePendingItem = {
  id: string
  itemName: string
  pokemonNameEn: string | null
  pokemonSpecies: string[]
  setName: string | null
  setCode: string | null
  cardNumber: string | null
  language: string | null
  rarity: string | null
  remaining: number
  imageUrl: string | null
  sourceLabel: string
  sourceHref: string | null
  purchasedAt: string | null
  arrivedAt: string | null
}

type DisplayRow = {
  rowKey: string
  kind: 'unit' | 'pending'
  unitId: string | null
  itemName: string
  pokemonNameEn: string | null
  pokemonSpecies: string[]
  setName: string | null
  setCode: string | null
  cardNumber: string | null
  language: string | null
  rarity: string | null
  quantity: number
  condition: string | null
  gradingCompany: string | null
  grade: string | null
  storageLocation: string | null
  allocatedTotalCost: number | null
  costCurrency: string
  estimatedValue: number | null
  estimatedValueCurrency: string
  status: string
  salePrice: number | null
  saleCurrency: string | null
  soldAt: string | null
  purchasedAt: string | null
  arrivedAt: string | null
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
  imageUrl: string | null
  imageCount: number
  sourceLabel: string
  sourceHref: string | null
}

type InventoryFormDraft = {
  itemName: string
  pokemonNameEn: string
  pokemonSpecies: string
  setName: string
  setCode: string
  cardNumber: string
  language: string
  rarity: string
  condition: string
  gradingCompany: string
  grade: string
  storageLocation: string
  allocatedTotalCost: string
  costCurrency: string
  estimatedValue: string
  estimatedValueCurrency: string
  status: string
  purchasedAt: string
  arrivedAt: string
  notes: string
  salePrice: string
  saleCurrency: string
  soldAt: string
}

const STATUS_LABELS: Record<string, string> = {
  in_delivery: 'In Zustellung',
  expected: 'Erwartet',
  in_warehouse: 'Bei OLAEET',
  in_transit: 'Unterwegs',
  in_collection: 'In Sammlung',
  listed_for_sale: 'Zum Verkauf',
  sold: 'Verkauft',
  lost: 'Verloren',
  returned: 'Zurückgegeben',
}

const EDITABLE_STATUSES = [
  'expected',
  'in_warehouse',
  'in_transit',
  'in_collection',
  'listed_for_sale',
  'sold',
  'lost',
  'returned',
]

const CONDITION_ORDER = [
  'Mint',
  'Near Mint',
  'Excellent',
  'Good',
  'Light Played',
  'Played',
  'Poor',
] as const

const CONDITION_RANK = new Map(
  CONDITION_ORDER.map((value, index) => [
    value.toLocaleLowerCase(),
    CONDITION_ORDER.length - index,
  ]),
)

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name A → Z' },
  { value: 'name-desc', label: 'Name Z → A' },
  { value: 'set-asc', label: 'Set A → Z' },
  { value: 'cost-asc', label: 'Kosten ↑' },
  { value: 'cost-desc', label: 'Kosten ↓' },
  { value: 'value-desc', label: 'Geschätzter Wert ↓' },
  { value: 'purchased-desc', label: 'Zuletzt gekauft' },
  { value: 'created-desc', label: 'Neueste zuerst' },
  { value: 'created-asc', label: 'Älteste zuerst' },
]

const MAX_FILE_BYTES = 6 * 1024 * 1024
const MAX_NEW_IMAGES = 12
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const FILE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function normalized(value: string | null | undefined) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].sort(
    (a, b) => a.localeCompare(b, 'de'),
  )
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null || !Number.isFinite(amount)) return '–'
  const code = currency || 'EUR'
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'KRW' ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('de-DE')} ${code}`
  }
}

function formatDate(value: string | null) {
  if (!value) return '–'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return '–'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatShortDateTime(value: string | null) {
  if (!value) return '–'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '–'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }).format(date)
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function speciesLabel(species: string[], pokemonNameEn?: string | null, itemName?: string) {
  if (species.length) return species.join(', ')
  const derived = deriveSpeciesFromEditableFields(itemName ?? '', pokemonNameEn ?? '')
  if (derived.length) return derived.join(', ')
  return pokemonNameEn?.trim() || 'Pokémon-Art nicht gesetzt'
}

function rowSpeciesSearch(row: DisplayRow) {
  return row.pokemonSpecies.join(' ')
}

function parseSpeciesInput(value: string) {
  return [
    ...new Set(
      value
        .split(/[,;&]/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ]
}

function deriveSpeciesFromEditableFields(itemName: string, pokemonNameEn: string) {
  const source = (pokemonNameEn.trim() || (/\p{Script=Latin}/u.test(itemName) ? itemName.trim() : ''))
  if (!source) return []

  const clean = source
    .replace(/^(Shining|Radiant|Dark|Light|Birthday|Surfing|Flying)\s+/i, '')
    .replace(/^(Rocket's|Team Rocket's)\s+/i, '')
    .replace(/\s+(V-UNION|VMAX|VSTAR|BREAK|LV\.X|Prime|GX|EX|ex|V)$/i, '')

  return [
    ...new Set(
      clean
        .split(/\s*(?:&|,|\band\b)\s*/i)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ]
}

function unitToDraft(unit?: InventoryWorkspaceUnit | null): InventoryFormDraft {
  return {
    itemName: unit?.itemName ?? '',
    pokemonNameEn: unit?.pokemonNameEn ?? '',
    pokemonSpecies: unit?.pokemonSpecies.join(', ') ?? '',
    setName: unit?.setName ?? '',
    setCode: unit?.setCode ?? '',
    cardNumber: unit?.cardNumber ?? '',
    language: unit?.language ?? 'Korean',
    rarity: unit?.rarity ?? '',
    condition: unit?.condition ?? '',
    gradingCompany: unit?.gradingCompany ?? '',
    grade: unit?.grade ?? '',
    storageLocation: unit?.storageLocation ?? '',
    allocatedTotalCost: unit?.allocatedTotalCost?.toString() ?? '',
    costCurrency: unit?.costCurrency ?? 'EUR',
    estimatedValue: unit?.estimatedValue?.toString() ?? '',
    estimatedValueCurrency: unit?.estimatedValueCurrency ?? 'EUR',
    status: unit?.status ?? 'in_collection',
    purchasedAt: unit?.purchasedAt?.slice(0, 10) ?? '',
    arrivedAt: unit?.arrivedAt?.slice(0, 10) ?? '',
    notes: unit?.notes ?? '',
    salePrice: unit?.salePrice?.toString() ?? '',
    saleCurrency: unit?.saleCurrency ?? 'EUR',
    soldAt: unit?.soldAt ?? '',
  }
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m17 17 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5.5h14v10H9l-4 3v-13Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function InventoryMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.75c-5.1 0-8.25 4.35-8.25 9.08 0 3.03 1.5 5.7 3.92 7.23L12 21.25l4.33-2.19c2.42-1.53 3.92-4.2 3.92-7.23 0-4.73-3.15-9.08-8.25-9.08Z" fill="currentColor" fillOpacity=".17" stroke="currentColor" strokeWidth="1.45" />
      <path d="M12 3v18M7.5 8.1c1.6 1.05 3.1 2.1 4.5 4.1" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 20 4.3-1 10-10-3.3-3.3-10 10L4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m13.8 6.9 3.3 3.3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m5.5 17 4.2-4 3.1 2.8 2.2-2.1 3.5 3.3" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

function AccordionFilter({
  label,
  value,
  options,
  onChange,
  accent = 'green',
  formatOption,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  accent?: 'green' | 'brown'
  formatOption?: (value: string) => string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="inv-accordion" ref={ref}>
      <button
        className={`inv-accordion-trigger ${open ? 'is-open' : ''}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>
          <small>{label}</small>
          <strong>{formatOption ? formatOption(value) : value}</strong>
        </span>
        <span className={`inv-chevron ${open ? 'is-open' : ''}`}>
          <ChevronIcon />
        </span>
      </button>

      {open ? (
        <div className="inv-accordion-menu">
          {options.map((option) => (
            <button
              className={`inv-accordion-option ${value === option ? `is-active is-${accent}` : ''}`}
              type="button"
              key={option}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              {formatOption ? formatOption(option) : option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function InventoryEditorModal({
  mode,
  unit,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  unit: InventoryWorkspaceUnit | null
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<InventoryFormDraft>(() => unitToDraft(unit))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function field<K extends keyof InventoryFormDraft>(key: K, value: InventoryFormDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(
        mode === 'create' ? '/api/inventory/units' : `/api/inventory/units/${unit?.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            itemName: draft.itemName,
            pokemonNameEn: draft.pokemonNameEn || null,
            pokemonSpecies: (() => {
              const entered = parseSpeciesInput(draft.pokemonSpecies)
              return entered.length
                ? entered
                : deriveSpeciesFromEditableFields(draft.itemName, draft.pokemonNameEn)
            })(),
            setName: draft.setName || null,
            setCode: draft.setCode || null,
            cardNumber: draft.cardNumber || null,
            language: draft.language || null,
            rarity: draft.rarity || null,
            condition: draft.condition || null,
            gradingCompany: draft.gradingCompany || null,
            grade: draft.grade || null,
            storageLocation: draft.storageLocation || null,
            allocatedTotalCost: draft.allocatedTotalCost || null,
            costCurrency: draft.costCurrency,
            estimatedValue: draft.estimatedValue || null,
            estimatedValueCurrency: draft.estimatedValueCurrency,
            status: draft.status,
            purchasedAt: draft.purchasedAt || null,
            arrivedAt: draft.arrivedAt || null,
            notes: draft.notes || null,
            salePrice: draft.salePrice || null,
            saleCurrency: draft.saleCurrency || null,
            soldAt: draft.soldAt || null,
          }),
        },
      )

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || 'Inventareintrag konnte nicht gespeichert werden.')
      }

      onSaved()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventareintrag konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="inv-modal inv-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="inv-modal-head">
          <div>
            <span className="inv-kicker">{mode === 'create' ? 'Quelle: Manuell' : unit?.sourceLabel}</span>
            <h2 id="inventory-editor-title">
              {mode === 'create' ? 'Einzelkarte zum Inventar hinzufügen' : 'Inventareintrag bearbeiten'}
            </h2>
          </div>
          <button type="button" className="inv-modal-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        <form className="inv-editor-form" onSubmit={submit}>
          {mode === 'create' ? (
            <InventoryCatalogPicker
              initialName={draft.itemName}
              initialCardNumber={draft.cardNumber}
              initialSetCode={draft.setCode}
              language={draft.language}
              onLanguageChange={(nextLanguage) =>
                setDraft((current) => ({ ...current, language: nextLanguage }))
              }

              onSelect={(candidate) => {
                setDraft((current) => {
                  const resolvedPokemonName = candidate.pokemonNameEn?.trim() || ''
                  const resolvedItemName =
                    candidate.matchType === 'exact_language'
                      ? candidate.name
                      : current.itemName.trim() || candidate.englishName || candidate.name
                  const resolvedSpecies = resolvedPokemonName
                    ? deriveSpeciesFromEditableFields(resolvedItemName, resolvedPokemonName)
                    : []
                  return {
                    ...current,
                    itemName: resolvedItemName,
                    pokemonNameEn: resolvedPokemonName || current.pokemonNameEn,
                    pokemonSpecies: resolvedSpecies.length
                      ? resolvedSpecies.join(', ')
                      : current.pokemonSpecies,
                    setName: candidate.setName || current.setName,
                    setCode: candidate.setCode || current.setCode,
                    cardNumber: candidate.number || current.cardNumber,
                    rarity: candidate.rarity || current.rarity,
                  }
                })
              }}
            />
          ) : null}
          <div className="inv-editor-grid inv-editor-grid-primary">
            <label>
              <span>Kartenname *</span>
              <input value={draft.itemName} onChange={(event) => field('itemName', event.target.value)} required />
            </label>
            <label>
              <span>Pokémon-Art(en)</span>
              <input
                value={draft.pokemonSpecies}
                onChange={(event) => field('pokemonSpecies', event.target.value)}
                placeholder="z. B. Mimikyu, Gengar"
              />
              <small>Kommagetrennt. Dieses Feld wird in der Inventarsuche berücksichtigt.</small>
            </label>
            <label>
              <span>Englischer Pokémon-Name</span>
              <input value={draft.pokemonNameEn} onChange={(event) => field('pokemonNameEn', event.target.value)} />
            </label>
            <label>
              <span>Sprache</span>
              <select value={draft.language} onChange={(event) => field('language', event.target.value)}>
                {inventoryLanguageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.flag} {option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="inv-editor-grid">
            <label>
              <span>Setname</span>
              <input value={draft.setName} onChange={(event) => field('setName', event.target.value)} />
            </label>
            <label>
              <span>Setcode</span>
              <input value={draft.setCode} onChange={(event) => field('setCode', event.target.value)} />
            </label>
            <label>
              <span>Kartennummer</span>
              <input value={draft.cardNumber} onChange={(event) => field('cardNumber', event.target.value)} />
            </label>
            <label>
              <span>Seltenheit</span>
              <input value={draft.rarity} onChange={(event) => field('rarity', event.target.value)} />
            </label>
          </div>

          <div className="inv-editor-grid">
            <label>
              <span>Zustand</span>
              <select value={draft.condition} onChange={(event) => field('condition', event.target.value)}>
                <option value="">Nicht bewertet</option>
                {CONDITION_ORDER.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Grading</span>
              <input value={draft.gradingCompany} onChange={(event) => field('gradingCompany', event.target.value)} placeholder="PSA, CGC, BGS …" />
            </label>
            <label>
              <span>Grade</span>
              <input value={draft.grade} onChange={(event) => field('grade', event.target.value)} />
            </label>
            <label>
              <span>Lagerort</span>
              <input value={draft.storageLocation} onChange={(event) => field('storageLocation', event.target.value)} placeholder="Binder A · Seite 4" />
            </label>
          </div>

          <div className="inv-editor-grid">
            <label>
              <span>Kosten</span>
              <input type="number" step="0.01" min="0" value={draft.allocatedTotalCost} onChange={(event) => field('allocatedTotalCost', event.target.value)} />
            </label>
            <label>
              <span>Kostenwährung</span>
              <input maxLength={3} value={draft.costCurrency} onChange={(event) => field('costCurrency', event.target.value.toUpperCase())} />
            </label>
            <label>
              <span>Geschätzter Wert</span>
              <input type="number" step="0.01" min="0" value={draft.estimatedValue} onChange={(event) => field('estimatedValue', event.target.value)} />
            </label>
            <label>
              <span>Wertwährung</span>
              <input maxLength={3} value={draft.estimatedValueCurrency} onChange={(event) => field('estimatedValueCurrency', event.target.value.toUpperCase())} />
            </label>
          </div>

          <div className="inv-editor-grid">
            <label>
              <span>Gekauft am</span>
              <input type="date" value={draft.purchasedAt} onChange={(event) => field('purchasedAt', event.target.value)} />
            </label>
            <label>
              <span>Angekommen am</span>
              <input type="date" value={draft.arrivedAt} onChange={(event) => field('arrivedAt', event.target.value)} />
            </label>
            <label>
              <span>Status</span>
              <select value={draft.status} onChange={(event) => field('status', event.target.value)}>
                {EDITABLE_STATUSES.map((value) => (
                  <option key={value} value={value}>{STATUS_LABELS[value]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Verkaufspreis</span>
              <div className="inv-inline-fields">
                <input type="number" step="0.01" min="0" value={draft.salePrice} onChange={(event) => field('salePrice', event.target.value)} />
                <input className="inv-currency-input" maxLength={3} value={draft.saleCurrency} onChange={(event) => field('saleCurrency', event.target.value.toUpperCase())} />
              </div>
            </label>
          </div>

          <label className="inv-editor-notes">
            <span>Kommentar</span>
            <textarea rows={4} value={draft.notes} onChange={(event) => field('notes', event.target.value)} placeholder="Notizen zur Karte, Zustand, Herkunft …" />
          </label>

          {error ? <div className="inv-alert inv-editor-error">{error}</div> : null}

          <footer className="inv-modal-actions">
            <button className="inv-button inv-button-muted" type="button" onClick={onClose}>Abbrechen</button>
            <button className="inv-button inv-button-primary" type="submit" disabled={saving}>
              {saving ? 'Speichern …' : mode === 'create' ? 'Einzelkarte hinzufügen' : 'Änderungen speichern'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}


function BulkEditModal({
  ids,
  onClose,
  onSaved,
}: {
  ids: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [enabled, setEnabled] = useState({
    notes: false,
    purchasedAt: false,
    arrivedAt: false,
    language: false,
    status: false,
  })
  const [notes, setNotes] = useState('')
  const [purchasedAt, setPurchasedAt] = useState('')
  const [arrivedAt, setArrivedAt] = useState('')
  const [language, setLanguage] = useState('Korean')
  const [status, setStatus] = useState('in_collection')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const changes: Record<string, string | null> = {}
    if (enabled.notes) changes.notes = notes
    if (enabled.purchasedAt) changes.purchasedAt = purchasedAt || null
    if (enabled.arrivedAt) changes.arrivedAt = arrivedAt || null
    if (enabled.language) changes.language = language
    if (enabled.status) changes.status = status

    if (!Object.keys(changes).length) {
      setError('Wähle mindestens ein Feld für die Massenbearbeitung aus.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/inventory/units/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ids, changes }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Massenbearbeitung konnte nicht gespeichert werden.')
      onSaved()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Massenbearbeitung konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="inv-modal inv-editor-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-bulk-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="inv-modal-head">
          <div>
            <span className="inv-kicker">{ids.length} Inventareinträge ausgewählt</span>
            <h2 id="inventory-bulk-title">Massenbearbeitung</h2>
          </div>
          <button type="button" className="inv-modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </header>
        <form className="inv-editor-form" onSubmit={submit}>
          <p className="inv-muted-copy">Nur aktivierte Felder werden auf alle ausgewählten Karten angewendet. Alle anderen Werte bleiben unverändert.</p>

          <div className="inv-editor-grid">
            <label>
              <span><input type="checkbox" checked={enabled.purchasedAt} onChange={(event) => setEnabled((current) => ({ ...current, purchasedAt: event.target.checked }))} /> Gekauft am ändern</span>
              <input type="date" value={purchasedAt} disabled={!enabled.purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} />
            </label>
            <label>
              <span><input type="checkbox" checked={enabled.arrivedAt} onChange={(event) => setEnabled((current) => ({ ...current, arrivedAt: event.target.checked }))} /> Angekommen am ändern</span>
              <input type="date" value={arrivedAt} disabled={!enabled.arrivedAt} onChange={(event) => setArrivedAt(event.target.value)} />
            </label>
            <label>
              <span><input type="checkbox" checked={enabled.language} onChange={(event) => setEnabled((current) => ({ ...current, language: event.target.checked }))} /> Sprache ändern</span>
              <select value={language} disabled={!enabled.language} onChange={(event) => setLanguage(event.target.value)}>
                {inventoryLanguageOptions.filter((option) => option.value !== 'Other').map((option) => (
                  <option key={option.value} value={option.value}>{option.flag} {option.label}</option>
                ))}
                <option value="Other">{inventoryLanguageFlag('Other')} Andere</option>
              </select>
            </label>
            <label>
              <span><input type="checkbox" checked={enabled.status} onChange={(event) => setEnabled((current) => ({ ...current, status: event.target.checked }))} /> Status ändern</span>
              <select value={status} disabled={!enabled.status} onChange={(event) => setStatus(event.target.value)}>
                {EDITABLE_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
              </select>
            </label>
          </div>

          <label className="inv-editor-notes">
            <span><input type="checkbox" checked={enabled.notes} onChange={(event) => setEnabled((current) => ({ ...current, notes: event.target.checked }))} /> Kommentar / Notiz ändern</span>
            <textarea rows={4} value={notes} disabled={!enabled.notes} onChange={(event) => setNotes(event.target.value)} placeholder="Gemeinsamer Kommentar für alle ausgewählten Karten" />
          </label>

          {error ? <div className="inv-alert inv-editor-error">{error}</div> : null}
          <footer className="inv-modal-actions">
            <button className="inv-button inv-button-muted" type="button" onClick={onClose}>Abbrechen</button>
            <button className="inv-button inv-button-primary" type="submit" disabled={saving}>{saving ? 'Speichern …' : 'Auf Auswahl anwenden'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function InventoryImagesModal({
  userId,
  unit,
  onClose,
  onChanged,
}: {
  userId: string
  unit: InventoryWorkspaceUnit
  onClose: () => void
  onChanged: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? [])
    const accepted: File[] = []
    const errors: string[] = []

    for (const file of incoming.slice(0, Math.max(0, MAX_NEW_IMAGES - files.length))) {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        errors.push(`${file.name}: Dateityp nicht unterstützt`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name}: größer als 6 MB`)
        continue
      }
      accepted.push(file)
    }

    setFiles((current) => [...current, ...accepted].slice(0, MAX_NEW_IMAGES))
    setMessage(errors.length ? errors.join(' · ') : null)
    event.target.value = ''
  }

  function toggleSource(key: string) {
    setSelectedSources((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function stageFiles() {
    if (!files.length) return []
    const supabase = createClient()
    const uploadId = crypto.randomUUID()
    const staged: Array<{
      path: string
      originalName: string
      mimeType: string
      byteSize: number
    }> = []

    try {
      for (const [index, file] of files.entries()) {
        const extension = FILE_EXTENSIONS[file.type] ?? 'bin'
        const path = `${userId}/staging/inventory/${unit.id}/${uploadId}/${String(index + 1).padStart(2, '0')}-${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage.from('listing-images').upload(path, file, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false,
        })
        if (error) throw new Error(`${file.name}: ${error.message}`)
        staged.push({
          path,
          originalName: file.name,
          mimeType: file.type,
          byteSize: file.size,
        })
      }
      return staged
    } catch (error) {
      if (staged.length) {
        await supabase.storage.from('listing-images').remove(staged.map((image) => image.path))
      }
      throw error
    }
  }

  async function saveImages() {
    setBusy(true)
    setMessage(null)
    let staged: Awaited<ReturnType<typeof stageFiles>> = []

    try {
      staged = await stageFiles()
      const sourceSelections = unit.sourceImages
        .filter((image) => selectedSources.has(`${image.sourceType}:${image.sourceImageId}`))
        .map((image) => ({
          sourceType: image.sourceType,
          sourceImageId: image.sourceImageId,
        }))

      if (!staged.length && !sourceSelections.length) {
        throw new Error('Wähle mindestens ein neues Bild oder ein Quellbild aus.')
      }

      const response = await fetch(`/api/inventory/units/${unit.id}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ stagedImages: staged, sourceSelections }),
      })
      const payload = (await response.json()) as { error?: string; warnings?: string[] }
      if (!response.ok) {
        const supabase = createClient()
        if (staged.length) await supabase.storage.from('listing-images').remove(staged.map((image) => image.path))
        throw new Error(payload.error || 'Bilder konnten nicht gespeichert werden.')
      }

      setFiles([])
      setSelectedSources(new Set())
      setMessage(payload.warnings?.join(' · ') || 'Bilder gespeichert.')
      onChanged()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Bilder konnten nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteImage(imageId: string) {
    if (!window.confirm('Dieses Inventarbild wirklich entfernen?')) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/inventory/units/${unit.id}/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ imageIds: [imageId] }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Bild konnte nicht gelöscht werden.')
      onChanged()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Bild konnte nicht gelöscht werden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="inv-modal inv-images-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="inv-modal-head">
          <div>
            <span className="inv-kicker">{unit.itemName}</span>
            <h2>Bilder verwalten</h2>
          </div>
          <button type="button" className="inv-modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </header>

        <div className="inv-images-body">
          <section>
            <h3>Gespeicherte Inventarbilder</h3>
            {unit.images.length ? (
              <div className="inv-image-grid">
                {unit.images.map((image) => (
                  <article className="inv-image-card" key={image.id} data-cc-record-card="true">
                    {image.signedUrl ? <img src={image.signedUrl} alt={image.originalFilename || 'Inventarbild'} /> : <div className="inv-image-placeholder">Kein Preview</div>}
                    <div>
                      <strong>{image.originalFilename || 'Inventarbild'}</strong>
                      <small>{image.sourceType === 'manual' ? 'Manuell' : image.sourceType === 'purchase' ? 'Aus Einkauf übernommen' : 'Aus OLAEET-Paket übernommen'}</small>
                    </div>
                    <button type="button" className="inv-text-danger" disabled={busy} onClick={() => deleteImage(image.id)}>Entfernen</button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="inv-muted-copy">Noch keine eigenen Bilder für diese Einzelkarte gespeichert.</p>
            )}
          </section>

          <section>
            <h3>Manuell hochladen</h3>
            <label className="inv-upload-zone">
              <ImageIcon />
              <span>Bilder auswählen</span>
              <small>JPEG, PNG, WebP oder GIF · max. 6 MB · bis zu 12 pro Vorgang</small>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={addFiles} />
            </label>
            {files.length ? (
              <div className="inv-file-list">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`}>
                    {file.name}
                    <button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>×</button>
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          {unit.sourceImages.length ? (
            <section>
              <h3>Bilder aus Einkauf / OLAEET übernehmen</h3>
              <p className="inv-muted-copy">Ausgewählte Bilder werden als eigene Inventarkopie archiviert und bleiben damit an dieser Karte gespeichert.</p>
              <div className="inv-source-image-grid">
                {unit.sourceImages.map((image) => {
                  const key = `${image.sourceType}:${image.sourceImageId}`
                  return (
                    <label className={`inv-source-image ${selectedSources.has(key) ? 'is-selected' : ''}`} key={key}>
                      <input type="checkbox" checked={selectedSources.has(key)} onChange={() => toggleSource(key)} />
                      {image.signedUrl ? <img src={image.signedUrl} alt={image.label} /> : <div className="inv-image-placeholder">Kein Preview</div>}
                      <span>{image.label}</span>
                      <small>{image.sourceType === 'purchase' ? 'Einkauf' : 'OLAEET-Paket'}</small>
                    </label>
                  )
                })}
              </div>
            </section>
          ) : null}

          {message ? <div className="inv-image-message">{message}</div> : null}
        </div>

        <footer className="inv-modal-actions inv-images-actions">
          <button className="inv-button inv-button-muted" type="button" onClick={onClose}>Schließen</button>
          <button className="inv-button inv-button-primary" type="button" disabled={busy} onClick={saveImages}>
            {busy ? 'Speichern …' : 'Neue Bilder speichern'}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function InventoryWorkspace({
  userId,
  units,
  pendingItems,
  loadError,
}: {
  userId: string
  units: InventoryWorkspaceUnit[]
  pendingItems: InventoryWorkspacePendingItem[]
  loadError: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState('Alle')
  const [expansion, setExpansion] = useState('Alle')
  const [rarity, setRarity] = useState('Alle')
  const [condition, setCondition] = useState('Alle')
  const [status, setStatus] = useState('Alle')
  const [grading, setGrading] = useState('Alle')
  const [storage, setStorage] = useState('Alle')
  const [comments, setComments] = useState('')
  const [minCost, setMinCost] = useState('')
  const [maxCost, setMaxCost] = useState('')
  const [sort, setSort] = useState('created-desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null)
  const [editingUnit, setEditingUnit] = useState<InventoryWorkspaceUnit | null>(null)
  const [imageUnit, setImageUnit] = useState<InventoryWorkspaceUnit | null>(null)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units])

  const rows = useMemo<DisplayRow[]>(() => {
    const physicalRows: DisplayRow[] = units.map((unit) => ({
      rowKey: `unit:${unit.id}`,
      kind: 'unit',
      unitId: unit.id,
      itemName: unit.itemName,
      pokemonNameEn: unit.pokemonNameEn,
      pokemonSpecies: unit.pokemonSpecies,
      setName: unit.setName,
      setCode: unit.setCode,
      cardNumber: unit.cardNumber,
      language: unit.language,
      rarity: unit.rarity,
      quantity: unit.quantity,
      condition: unit.condition,
      gradingCompany: unit.gradingCompany,
      grade: unit.grade,
      storageLocation: unit.storageLocation,
      allocatedTotalCost: unit.allocatedTotalCost,
      costCurrency: unit.costCurrency,
      estimatedValue: unit.estimatedValue,
      estimatedValueCurrency: unit.estimatedValueCurrency,
      status: unit.status,
      salePrice: unit.salePrice,
      saleCurrency: unit.saleCurrency,
      soldAt: unit.soldAt,
      purchasedAt: unit.purchasedAt,
      arrivedAt: unit.arrivedAt,
      notes: unit.notes,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
      imageUrl: unit.imageUrl,
      imageCount: unit.images.length,
      sourceLabel: unit.sourceLabel,
      sourceHref: unit.sourceHref,
    }))

    const deliveryRows: DisplayRow[] = pendingItems.map((item) => ({
      rowKey: `pending:${item.id}`,
      kind: 'pending',
      unitId: null,
      itemName: item.itemName,
      pokemonNameEn: item.pokemonNameEn,
      pokemonSpecies: item.pokemonSpecies,
      setName: item.setName,
      setCode: item.setCode,
      cardNumber: item.cardNumber,
      language: item.language,
      rarity: item.rarity,
      quantity: item.remaining,
      condition: null,
      gradingCompany: null,
      grade: null,
      storageLocation: null,
      allocatedTotalCost: null,
      costCurrency: 'EUR',
      estimatedValue: null,
      estimatedValueCurrency: 'EUR',
      status: 'in_delivery',
      salePrice: null,
      saleCurrency: null,
      soldAt: null,
      purchasedAt: item.purchasedAt,
      arrivedAt: item.arrivedAt,
      notes: null,
      createdAt: null,
      updatedAt: null,
      imageUrl: item.imageUrl,
      imageCount: 0,
      sourceLabel: item.sourceLabel,
      sourceHref: item.sourceHref,
    }))

    return [...physicalRows, ...deliveryRows]
  }, [units, pendingItems])

  const languageOptions = useMemo(() => {
    const configured = inventoryLanguageOptions.map((option) => String(option.value))
    const extras = uniqueValues(rows.map((row) => row.language)).filter((value) => !configured.includes(value))
    return ['Alle', ...configured, ...extras]
  }, [rows])
  const expansionOptions = useMemo(
    () => [
      'Alle',
      ...uniqueValues(rows.map((row) => [row.setName, row.setCode].filter(Boolean).join(' · ') || null)),
    ],
    [rows],
  )
  const rarityOptions = useMemo(
    () => ['Alle', ...uniqueValues(rows.map((row) => row.rarity))],
    [rows],
  )
  const conditionOptions = useMemo(() => {
    const extras = uniqueValues(rows.map((row) => row.condition)).filter(
      (value) => !CONDITION_ORDER.includes(value as (typeof CONDITION_ORDER)[number]),
    )
    return ['Alle', ...CONDITION_ORDER, ...extras]
  }, [rows])
  const statusOptions = useMemo(
    () => [
      'Alle',
      'In Zustellung',
      ...uniqueValues(units.map((unit) => STATUS_LABELS[unit.status] ?? unit.status)),
    ],
    [units],
  )
  const gradingOptions = useMemo(
    () => ['Alle', ...uniqueValues(rows.map((row) => row.gradingCompany))],
    [rows],
  )
  const storageOptions = useMemo(
    () => ['Alle', ...uniqueValues(rows.map((row) => row.storageLocation))],
    [rows],
  )

  const filtered = useMemo(() => {
    const wanted = normalized(search)
    const wantedComments = normalized(comments)
    const selectedStatus =
      status === 'Alle'
        ? null
        : status === 'In Zustellung'
          ? 'in_delivery'
          : Object.entries(STATUS_LABELS).find(([, label]) => label === status)?.[0] ?? status

    const result = rows.filter((row) => {
      if (
        wanted &&
        ![
          row.itemName,
          row.pokemonNameEn,
          rowSpeciesSearch(row),
          row.setName,
          row.setCode,
          row.cardNumber,
          row.language,
          row.rarity,
          row.gradingCompany,
          row.grade,
          row.storageLocation,
          row.sourceLabel,
          row.notes,
        ].some((value) => normalized(value).includes(wanted))
      ) {
        return false
      }

      if (language !== 'Alle' && row.language !== language) return false

      if (expansion !== 'Alle') {
        const expansionLabel = [row.setName, row.setCode].filter(Boolean).join(' · ') || ''
        if (expansionLabel !== expansion) return false
      }

      if (rarity !== 'Alle' && row.rarity !== rarity) return false

      if (condition !== 'Alle') {
        if (row.kind === 'pending') return false
        const requestedRank = CONDITION_RANK.get(normalized(condition))
        const rowRank = CONDITION_RANK.get(normalized(row.condition))
        if (requestedRank !== undefined) {
          if (rowRank === undefined || rowRank < requestedRank) return false
        } else if (row.condition !== condition) {
          return false
        }
      }

      if (selectedStatus && row.status !== selectedStatus) return false
      if (grading !== 'Alle' && row.gradingCompany !== grading) return false
      if (storage !== 'Alle' && row.storageLocation !== storage) return false
      if (wantedComments && !normalized(row.notes).includes(wantedComments)) return false

      const cost = row.allocatedTotalCost
      if (minCost !== '' && (cost === null || cost < Number(minCost))) return false
      if (maxCost !== '' && (cost === null || cost > Number(maxCost))) return false

      return true
    })

    result.sort((a, b) => {
      if (sort === 'name-asc') return a.itemName.localeCompare(b.itemName, 'de')
      if (sort === 'name-desc') return b.itemName.localeCompare(a.itemName, 'de')
      if (sort === 'set-asc') return String(a.setName ?? '').localeCompare(String(b.setName ?? ''), 'de')
      if (sort === 'cost-asc') return (a.allocatedTotalCost ?? Number.POSITIVE_INFINITY) - (b.allocatedTotalCost ?? Number.POSITIVE_INFINITY)
      if (sort === 'cost-desc') return (b.allocatedTotalCost ?? Number.NEGATIVE_INFINITY) - (a.allocatedTotalCost ?? Number.NEGATIVE_INFINITY)
      if (sort === 'value-desc') return (b.estimatedValue ?? Number.NEGATIVE_INFINITY) - (a.estimatedValue ?? Number.NEGATIVE_INFINITY)
      if (sort === 'purchased-desc') return String(b.purchasedAt ?? '').localeCompare(String(a.purchasedAt ?? ''))
      if (sort === 'created-asc') return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    })

    return result
  }, [rows, search, language, expansion, rarity, condition, status, grading, storage, comments, minCost, maxCost, sort])

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const stats = useMemo(
    () => ({
      total: rows.reduce((sum, row) => sum + row.quantity, 0),
      inCollection: units
        .filter((unit) => unit.status === 'in_collection')
        .reduce((sum, unit) => sum + unit.quantity, 0),
      inDelivery: pendingItems.reduce((sum, item) => sum + item.remaining, 0),
      soldThisMonth: units
        .filter((unit) => {
          if (unit.status !== 'sold' || !unit.soldAt) return false
          const sold = new Date(unit.soldAt)
          return sold.getFullYear() === currentYear && sold.getMonth() === currentMonth
        })
        .reduce((sum, unit) => sum + unit.quantity, 0),
    }),
    [rows, units, pendingItems, currentMonth, currentYear],
  )

  const filteredCostTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of filtered) {
      if (row.kind !== 'unit' || row.allocatedTotalCost === null) continue
      totals.set(row.costCurrency, (totals.get(row.costCurrency) ?? 0) + row.allocatedTotalCost * Math.max(1, row.quantity))
    }
    return [...totals.entries()]
  }, [filtered])

  const visibleUnitIds = filtered.filter((row) => row.kind === 'unit' && row.unitId).map((row) => row.unitId as string)
  const allSelected = visibleUnitIds.length > 0 && visibleUnitIds.every((id) => selected.has(id))

  const activeFilterCount = [language, expansion, rarity, condition, status, grading, storage].filter((value) => value !== 'Alle').length +
    (comments ? 1 : 0) +
    (minCost ? 1 : 0) +
    (maxCost ? 1 : 0)

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((current) => {
      if (allSelected) {
        const visible = new Set(visibleUnitIds)
        return new Set([...current].filter((id) => !visible.has(id)))
      }
      return new Set([...current, ...visibleUnitIds])
    })
  }

  function clearFilters() {
    setSearch('')
    setLanguage('Alle')
    setExpansion('Alle')
    setRarity('Alle')
    setCondition('Alle')
    setStatus('Alle')
    setGrading('Alle')
    setStorage('Alle')
    setComments('')
    setMinCost('')
    setMaxCost('')
    setSort('created-desc')
  }

  function openEdit(unitId: string) {
    const unit = unitById.get(unitId)
    if (!unit) return
    setEditingUnit(unit)
    setEditorMode('edit')
  }

  function openImages(unitId: string) {
    const unit = unitById.get(unitId)
    if (unit) setImageUnit(unit)
  }

  function exportRows(exportRows: DisplayRow[]) {
    if (!exportRows.length) return

    const header = [
      'Status',
      'Kartenname',
      'Pokémon-Art(en)',
      'Englischer Pokémon-Name',
      'Set',
      'Setcode',
      'Kartennummer',
      'Sprache',
      'Seltenheit',
      'Zustand',
      'Grading',
      'Grade',
      'Lagerort',
      'Kosten',
      'Kostenwährung',
      'Geschätzter Wert',
      'Wertwährung',
      'Kommentar',
      'Bilder',
      'Gekauft am',
      'Angekommen am',
      'Quelle',
      'Menge',
    ]

    const body = exportRows.map((row) => [
      STATUS_LABELS[row.status] ?? row.status,
      row.itemName,
      row.pokemonSpecies.join(', '),
      row.pokemonNameEn,
      row.setName,
      row.setCode,
      row.cardNumber,
      row.language,
      row.rarity,
      row.condition,
      row.gradingCompany,
      row.grade,
      row.storageLocation,
      row.allocatedTotalCost,
      row.costCurrency,
      row.estimatedValue,
      row.estimatedValueCurrency,
      row.notes,
      row.imageCount,
      row.purchasedAt,
      row.arrivedAt,
      row.sourceLabel,
      row.quantity,
    ])

    const csv = [header, ...body].map((row) => row.map(csvCell).join(';')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `cardcargo-inventar-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function deleteSelected() {
    if (!selected.size || deleting) return
    if (!window.confirm(`${selected.size} ausgewählte Inventareinträge wirklich löschen? Zugehörige Purchase Items erscheinen danach wieder als „In Zustellung“.`)) return

    setDeleting(true)
    try {
      const response = await fetch('/api/inventory/units', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Inventareinträge konnten nicht gelöscht werden.')
      setSelected(new Set())
      router.refresh()
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Inventareinträge konnten nicht gelöscht werden.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="inventory-figma-shell inventory-v32-shell" data-cc-anydb="inventory">
      <ConnectedInventoryModel />
      <InventoryShipmentFilter />
      <section className="inv-topbar">
        <div className="inv-brand">
          <span className="inv-brand-mark"><InventoryMark /></span>
          <div>
            <span className="inv-kicker">CardCargo</span>
            <h1>Inventar</h1>
            <p>Physische Karten und Karten in Zustellung in einer gemeinsamen Ansicht</p>
          </div>
        </div>

        <div className="inv-top-actions">
          <button
            className="inv-button inv-button-muted"
            type="button"
            onClick={() => setStatus(status === 'In Zustellung' ? 'Alle' : 'In Zustellung')}
          >
            In Zustellung ({stats.inDelivery})
          </button>
          <button
            className="inv-button inv-button-primary"
            type="button"
            onClick={() => {
              setEditingUnit(null)
              setEditorMode('create')
            }}
          >
            + Einzelkarte hinzufügen
          </button>
        </div>
      </section>

      {loadError ? (
        <div className="inv-alert">
          Inventardaten konnten nicht vollständig geladen werden. Prüfe insbesondere die Migration 0017.
        </div>
      ) : null}

      <section className="inv-stat-grid" aria-label="Inventarstatistik">
        {[
          { label: 'Karten insgesamt', value: stats.total, tone: 'brown', filter: 'Alle' },
          { label: 'In Sammlung', value: stats.inCollection, tone: 'green', filter: 'In Sammlung' },
          { label: 'In Zustellung', value: stats.inDelivery, tone: 'ochre', filter: 'In Zustellung' },
          { label: 'In diesem Monat verkauft', value: stats.soldThisMonth, tone: 'red', filter: 'Verkauft' },
        ].map((stat) => (
          <button
            className="inv-stat-card inv-stat-button"
            key={stat.label}
            type="button"
            onClick={() => setStatus(stat.filter)}
          >
            <strong className={`tone-${stat.tone}`}>{stat.value}</strong>
            <span>{stat.label}</span>
          </button>
        ))}
      </section>

      <section className="inv-workspace">
        <aside className="inv-sidebar">
          <div className="inv-sidebar-head">
            <div>
              <span>Filter & Sortierung</span>
              {activeFilterCount ? <small>{activeFilterCount} aktiv</small> : null}
            </div>
            <button type="button" onClick={clearFilters}>Zurücksetzen</button>
          </div>

          <div className="inv-sidebar-body">
            <label className="inv-field-label" htmlFor="inventory-search">Suche</label>
            <div className="inv-input-wrap">
              <SearchIcon />
              <input
                id="inventory-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, Pokémon-Art, Set, Nr. …"
              />
            </div>

            <AccordionFilter label="Sprache" value={language} options={languageOptions} onChange={setLanguage} formatOption={(value) => value === 'Alle' ? 'Alle' : inventoryLanguageLabel(value)} />
            <AccordionFilter label="Set / Erweiterung" value={expansion} options={expansionOptions} onChange={setExpansion} />
            <AccordionFilter label="Seltenheit" value={rarity} options={rarityOptions} onChange={setRarity} />
            <AccordionFilter label="Mindestzustand" value={condition} options={conditionOptions} onChange={setCondition} />
            <AccordionFilter label="Status" value={status} options={statusOptions} onChange={setStatus} accent="brown" />

            <button className="inv-more-filter-toggle" type="button" onClick={() => setShowMoreFilters((current) => !current)}>
              <span>{showMoreFilters ? 'Weniger Filter' : 'Weitere Filter'}</span>
              <span className={`inv-chevron ${showMoreFilters ? 'is-open' : ''}`}><ChevronIcon /></span>
            </button>

            {showMoreFilters ? (
              <div className="inv-more-filters">
                <AccordionFilter label="Grading" value={grading} options={gradingOptions} onChange={setGrading} />
                <AccordionFilter label="Lagerort" value={storage} options={storageOptions} onChange={setStorage} />
              </div>
            ) : null}

            <label className="inv-field-label" htmlFor="inventory-comments">Kommentare / Notizen</label>
            <div className="inv-input-wrap">
              <CommentIcon />
              <input id="inventory-comments" value={comments} onChange={(event) => setComments(event.target.value)} placeholder="In Kommentaren suchen …" />
            </div>

            <span className="inv-field-label">Kostenbereich</span>
            <div className="inv-cost-range">
              <input type="number" inputMode="decimal" value={minCost} onChange={(event) => setMinCost(event.target.value)} placeholder="Min" aria-label="Mindestkosten" />
              <input type="number" inputMode="decimal" value={maxCost} onChange={(event) => setMaxCost(event.target.value)} placeholder="Max" aria-label="Maximalkosten" />
            </div>

            <label className="inv-field-label" htmlFor="inventory-sort">Sortieren nach</label>
            <div className="inv-select-wrap">
              <select id="inventory-sort" value={sort} onChange={(event) => setSort(event.target.value)}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronIcon />
            </div>
          </div>

          <footer className="inv-sidebar-footer">{filtered.length} / {rows.length} Zeilen</footer>
        </aside>

        <main className="inv-table-card">
          <header className="inv-table-head">
            <div>
              <span className="inv-kicker">Physische Exemplare + offene Karten</span>
              <h2>Inventory</h2>
            </div>

            <div className="inv-table-actions">
              <button className="inv-button inv-button-muted" type="button" onClick={() => exportRows(filtered)} disabled={!filtered.length}>CSV exportieren</button>
              <button className="inv-button inv-button-muted" type="button" disabled={!selected.size} onClick={() => setBulkEditOpen(true)}>Massenbearbeitung</button>
              {selected.size ? (
                <>
                  <span>{selected.size} ausgewählt</span>
                  <button className="inv-button inv-button-muted" type="button" onClick={() => exportRows(filtered.filter((row) => row.unitId && selected.has(row.unitId)))}>Auswahl exportieren</button>
                  <button className="inv-button inv-button-danger" type="button" disabled={deleting} onClick={deleteSelected}>{deleting ? 'Löschen …' : 'Löschen'}</button>
                </>
              ) : null}
            </div>
          </header>

          <div className="inv-table-scroll">
            <table className="inv-table inv-table-v32" data-cc-table="inventory">
              <thead>
                <tr>
                  <th className="inv-check-cell">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Alle sichtbaren Inventareinträge auswählen" />
                  </th>
                  <th>Karte</th>
                  <th>Sprache</th>
                  <th>Set</th>
                  <th>Nr.</th>
                  <th>Seltenheit</th>
                  <th>Zustand</th>
                  <th>Grading</th>
                  <th>Lagerort</th>
                  <th>Kosten</th>
                  <th>Geschätzter Wert</th>
                  <th>Status</th>
                  <th>Kommentar</th>
                  <th>Bilder</th>
                  <th>Gekauft am</th>
                  <th>Angekommen am</th>
                  <th>Quelle</th>
                  <th>Aktualisiert</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((row, index) => {
                    const selectable = row.kind === 'unit' && Boolean(row.unitId)
                    const selectedRow = Boolean(row.unitId && selected.has(row.unitId))
                    return (
                      <tr
                        className={`${selectedRow ? 'is-selected' : ''} ${row.kind === 'pending' ? 'is-pending-row' : ''}`}
                        key={row.rowKey}
                        onClick={() => selectable && row.unitId && toggleSelected(row.unitId)}
                        data-stripe={index % 2 ? 'odd' : 'even'}
                      >
                        <td className="inv-check-cell">
                          {selectable ? (
                            <input
                              type="checkbox"
                              checked={selectedRow}
                              onChange={() => row.unitId && toggleSelected(row.unitId)}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`${row.itemName} auswählen`}
                            />
                          ) : (
                            <span className="inv-pending-dot" title="Noch nicht als physisches Inventarexemplar übernommen" />
                          )}
                        </td>
                        <td className="inv-item-cell">
                          <div className="inv-card-thumb">
                            {row.imageUrl ? <img src={row.imageUrl} alt="" referrerPolicy="no-referrer" /> : <span>CC</span>}
                          </div>
                          <div>
                            <strong>{row.itemName}{row.quantity > 1 ? ` · ${row.quantity}×` : ''}</strong>
                            <small className="inv-species-line">{speciesLabel(row.pokemonSpecies, row.pokemonNameEn, row.itemName)}</small>
                          </div>
                        </td>
                        <td title={row.language ? inventoryLanguageLabel(row.language) : undefined} aria-label={row.language ? inventoryLanguageLabel(row.language) : 'Sprache nicht gesetzt'}><InventoryLanguageFlag language={row.language} /></td>
                        <td>
                          <strong className="inv-table-main">{row.setName || '–'}</strong>
                          <small>{row.setCode || 'Kein Setcode'}</small>
                        </td>
                        <td className="inv-mono">{row.cardNumber || '–'}</td>
                        <td>{row.rarity || '–'}</td>
                        <td>{row.kind === 'pending' ? '–' : row.condition || 'Nicht bewertet'}</td>
                        <td>
                          {row.kind === 'pending' ? '–' : row.gradingCompany ? (
                            <><strong className="inv-table-main">{row.gradingCompany}</strong><small>{row.grade || 'Grade offen'}</small></>
                          ) : 'Raw'}
                        </td>
                        <td>{row.kind === 'pending' ? '–' : row.storageLocation || 'Offen'}</td>
                        <td className="inv-mono">{formatMoney(row.allocatedTotalCost, row.costCurrency)}</td>
                        <td className="inv-mono">{formatMoney(row.estimatedValue, row.estimatedValueCurrency)}</td>
                        <td><span className={`inv-status inv-status-${row.status}`}>{STATUS_LABELS[row.status] ?? row.status}</span></td>
                        <td className="inv-comment-cell" title={row.notes || undefined}>{row.notes || '–'}</td>
                        <td>
                          {row.kind === 'unit' && row.unitId ? (
                            <button className="inv-table-link-button" type="button" onClick={(event) => { event.stopPropagation(); openImages(row.unitId as string) }}>
                              <ImageIcon /> {row.imageCount ? `${row.imageCount} ansehen` : 'Hinzufügen'}
                            </button>
                          ) : (
                            <span className="inv-muted-inline">Nach Übernahme</span>
                          )}
                        </td>
                        <td className="inv-mono">{formatDate(row.purchasedAt)}</td>
                        <td className="inv-mono">{formatDate(row.arrivedAt)}</td>
                        <td>
                          {row.sourceHref ? (
                            <Link className="inv-source-link" href={row.sourceHref} onClick={(event) => event.stopPropagation()}>{row.sourceLabel}</Link>
                          ) : row.sourceLabel}
                        </td>
                        <td className="inv-mono">{formatShortDateTime(row.updatedAt)}</td>
                        <td>
                          {row.kind === 'unit' && row.unitId ? (
                            <button className="inv-icon-action" type="button" onClick={(event) => { event.stopPropagation(); openEdit(row.unitId as string) }}>
                              <PencilIcon /> Bearbeiten
                            </button>
                          ) : row.sourceHref ? (
                            <Link className="inv-icon-action" href={row.sourceHref} onClick={(event) => event.stopPropagation()}>Quelle öffnen</Link>
                          ) : '–'}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={19}>
                      <div className="inv-empty">
                        <InventoryMark />
                        <strong>Keine Karten für diese Filter.</strong>
                        <span>Filter zurücksetzen oder Suchbegriff anpassen.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <footer className="inv-table-footer">
            <span>{filtered.length} Zeilen angezeigt · {filtered.reduce((sum, row) => sum + row.quantity, 0)} Karten</span>
            <span>
              Kosten:{' '}
              {filteredCostTotals.length
                ? filteredCostTotals.map(([currency, total]) => formatMoney(total, currency)).join(' · ')
                : '–'}
            </span>
          </footer>
        </main>
      </section>

      {editorMode ? (
        <InventoryEditorModal
          mode={editorMode}
          unit={editingUnit}
          onClose={() => {
            setEditorMode(null)
            setEditingUnit(null)
          }}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {bulkEditOpen ? (
        <BulkEditModal
          ids={[...selected]}
          onClose={() => setBulkEditOpen(false)}
          onSaved={() => {
            setSelected(new Set())
            router.refresh()
          }}
        />
      ) : null}
      {imageUnit ? (
        <InventoryImagesModal
          userId={userId}
          unit={imageUnit}
          onClose={() => setImageUnit(null)}
          onChanged={() => {
            setImageUnit(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
