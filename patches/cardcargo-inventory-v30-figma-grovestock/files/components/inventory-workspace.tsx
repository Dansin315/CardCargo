'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export type InventoryWorkspaceUnit = {
  id: string
  purchaseItemId: string | null
  itemName: string
  pokemonNameEn: string | null
  setName: string | null
  setCode: string | null
  cardNumber: string | null
  language: string | null
  quantity: number
  condition: string | null
  gradingCompany: string | null
  grade: string | null
  storageLocation: string | null
  allocatedTotalCost: number | null
  costCurrency: string
  status: string
  salePrice: number | null
  saleCurrency: string | null
  soldAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  imageUrl: string | null
  rarity: string | null
  sourceLabel: string
  sourceHref: string | null
}

export type InventoryWorkspacePendingItem = {
  id: string
  itemName: string
  pokemonNameEn: string | null
  setName: string | null
  setCode: string | null
  cardNumber: string | null
  language: string | null
  remaining: number
  imageUrl: string | null
  sourceLabel: string
  sourceHref: string | null
}

const STATUS_LABELS: Record<string, string> = {
  expected: 'Erwartet',
  in_warehouse: 'Bei OLAEET',
  in_transit: 'Unterwegs',
  in_collection: 'In Sammlung',
  listed_for_sale: 'Zum Verkauf',
  sold: 'Verkauft',
  lost: 'Verloren',
  returned: 'Zurückgegeben',
}

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
  CONDITION_ORDER.map((condition, index) => [
    condition.toLocaleLowerCase(),
    CONDITION_ORDER.length - index,
  ]),
)

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name A → Z' },
  { value: 'name-desc', label: 'Name Z → A' },
  { value: 'set-asc', label: 'Set A → Z' },
  { value: 'cost-asc', label: 'Kosten ↑' },
  { value: 'cost-desc', label: 'Kosten ↓' },
  { value: 'created-desc', label: 'Neueste zuerst' },
  { value: 'created-asc', label: 'Älteste zuerst' },
]

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

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '–'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }).format(date)
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
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
      <path
        d="M5 5.5h14v10H9l-4 3v-13Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
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
      <path
        d="M12 2.75c-5.1 0-8.25 4.35-8.25 9.08 0 3.03 1.5 5.7 3.92 7.23L12 21.25l4.33-2.19c2.42-1.53 3.92-4.2 3.92-7.23 0-4.73-3.15-9.08-8.25-9.08Z"
        fill="currentColor"
        fillOpacity=".17"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="M12 3v18M7.5 8.1c1.6 1.05 3.1 2.1 4.5 4.1"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  )
}

function AccordionFilter({
  label,
  value,
  options,
  onChange,
  accent = 'green',
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  accent?: 'green' | 'brown'
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
          <strong>{value}</strong>
        </span>
        <span className={`inv-chevron ${open ? 'is-open' : ''}`}>
          <ChevronIcon />
        </span>
      </button>

      {open ? (
        <div className="inv-accordion-menu">
          {options.map((option) => (
            <button
              className={`inv-accordion-option ${
                value === option ? `is-active is-${accent}` : ''
              }`}
              type="button"
              key={option}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function InventoryWorkspace({
  units,
  pendingItems,
  loadError,
}: {
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

  const languageOptions = useMemo(
    () => ['Alle', ...uniqueValues(units.map((unit) => unit.language))],
    [units],
  )
  const expansionOptions = useMemo(
    () => [
      'Alle',
      ...uniqueValues(
        units.map((unit) =>
          [unit.setName, unit.setCode].filter(Boolean).join(' · ') || null,
        ),
      ),
    ],
    [units],
  )
  const rarityOptions = useMemo(
    () => ['Alle', ...uniqueValues(units.map((unit) => unit.rarity))],
    [units],
  )
  const conditionOptions = useMemo(() => {
    const extras = uniqueValues(units.map((unit) => unit.condition)).filter(
      (value) => !CONDITION_ORDER.includes(value as (typeof CONDITION_ORDER)[number]),
    )
    return ['Alle', ...CONDITION_ORDER, ...extras]
  }, [units])
  const statusOptions = useMemo(
    () => [
      'Alle',
      ...uniqueValues(units.map((unit) => STATUS_LABELS[unit.status] ?? unit.status)),
    ],
    [units],
  )
  const gradingOptions = useMemo(
    () => ['Alle', ...uniqueValues(units.map((unit) => unit.gradingCompany))],
    [units],
  )
  const storageOptions = useMemo(
    () => ['Alle', ...uniqueValues(units.map((unit) => unit.storageLocation))],
    [units],
  )

  const filtered = useMemo(() => {
    const wanted = normalized(search)
    const wantedComments = normalized(comments)
    const selectedStatus =
      status === 'Alle'
        ? null
        : Object.entries(STATUS_LABELS).find(([, label]) => label === status)?.[0] ?? status

    const selectedExpansion = expansion === 'Alle' ? null : expansion

    const result = units.filter((unit) => {
      if (
        wanted &&
        ![
          unit.itemName,
          unit.pokemonNameEn,
          unit.setName,
          unit.setCode,
          unit.cardNumber,
          unit.language,
          unit.rarity,
          unit.gradingCompany,
          unit.grade,
          unit.storageLocation,
          unit.sourceLabel,
        ].some((value) => normalized(value).includes(wanted))
      ) {
        return false
      }

      if (language !== 'Alle' && unit.language !== language) return false

      if (selectedExpansion) {
        const expansionLabel =
          [unit.setName, unit.setCode].filter(Boolean).join(' · ') || ''
        if (expansionLabel !== selectedExpansion) return false
      }

      if (rarity !== 'Alle' && unit.rarity !== rarity) return false

      if (condition !== 'Alle') {
        const requestedRank = CONDITION_RANK.get(normalized(condition))
        const unitRank = CONDITION_RANK.get(normalized(unit.condition))

        if (requestedRank !== undefined) {
          if (unitRank === undefined || unitRank < requestedRank) return false
        } else if (unit.condition !== condition) {
          return false
        }
      }

      if (selectedStatus && unit.status !== selectedStatus) return false
      if (grading !== 'Alle' && unit.gradingCompany !== grading) return false
      if (storage !== 'Alle' && unit.storageLocation !== storage) return false

      if (wantedComments && !normalized(unit.notes).includes(wantedComments)) return false

      const cost = unit.allocatedTotalCost
      if (minCost !== '' && (cost === null || cost < Number(minCost))) return false
      if (maxCost !== '' && (cost === null || cost > Number(maxCost))) return false

      return true
    })

    result.sort((a, b) => {
      if (sort === 'name-asc') return a.itemName.localeCompare(b.itemName, 'de')
      if (sort === 'name-desc') return b.itemName.localeCompare(a.itemName, 'de')
      if (sort === 'set-asc') return String(a.setName ?? '').localeCompare(String(b.setName ?? ''), 'de')
      if (sort === 'cost-asc') {
        return (a.allocatedTotalCost ?? Number.POSITIVE_INFINITY) -
          (b.allocatedTotalCost ?? Number.POSITIVE_INFINITY)
      }
      if (sort === 'cost-desc') {
        return (b.allocatedTotalCost ?? Number.NEGATIVE_INFINITY) -
          (a.allocatedTotalCost ?? Number.NEGATIVE_INFINITY)
      }
      if (sort === 'created-asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return result
  }, [
    units,
    search,
    language,
    expansion,
    rarity,
    condition,
    status,
    grading,
    storage,
    comments,
    minCost,
    maxCost,
    sort,
  ])

  const stats = useMemo(
    () => ({
      total: units.reduce((sum, unit) => sum + unit.quantity, 0),
      inCollection: units
        .filter((unit) => unit.status === 'in_collection')
        .reduce((sum, unit) => sum + unit.quantity, 0),
      listed: units
        .filter((unit) => unit.status === 'listed_for_sale')
        .reduce((sum, unit) => sum + unit.quantity, 0),
      sold: units
        .filter((unit) => unit.status === 'sold')
        .reduce((sum, unit) => sum + unit.quantity, 0),
    }),
    [units],
  )

  const filteredCostTotals = useMemo(() => {
    const totals = new Map<string, number>()

    for (const unit of filtered) {
      if (unit.allocatedTotalCost === null) continue
      totals.set(
        unit.costCurrency,
        (totals.get(unit.costCurrency) ?? 0) +
          unit.allocatedTotalCost * Math.max(1, unit.quantity),
      )
    }

    return [...totals.entries()]
  }, [filtered])

  const allSelected =
    filtered.length > 0 && filtered.every((unit) => selected.has(unit.id))

  const activeFilterCount = [
    language,
    expansion,
    rarity,
    condition,
    status,
    grading,
    storage,
  ].filter((value) => value !== 'Alle').length +
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
        const visible = new Set(filtered.map((unit) => unit.id))
        return new Set([...current].filter((id) => !visible.has(id)))
      }

      return new Set([...current, ...filtered.map((unit) => unit.id)])
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

  function exportRows(rows: InventoryWorkspaceUnit[]) {
    if (!rows.length) return

    const header = [
      'Kartenname',
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
      'Währung',
      'Status',
      'Quelle',
      'Kommentar',
      'Übernommen',
      'Aktualisiert',
    ]

    const body = rows.map((unit) => [
      unit.itemName,
      unit.pokemonNameEn,
      unit.setName,
      unit.setCode,
      unit.cardNumber,
      unit.language,
      unit.rarity,
      unit.condition,
      unit.gradingCompany,
      unit.grade,
      unit.storageLocation,
      unit.allocatedTotalCost,
      unit.costCurrency,
      STATUS_LABELS[unit.status] ?? unit.status,
      unit.sourceLabel,
      unit.notes,
      unit.createdAt,
      unit.updatedAt,
    ])

    const csv = [header, ...body]
      .map((row) => row.map(csvCell).join(';'))
      .join('\r\n')

    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `cardcargo-inventar-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function deleteSelected() {
    if (!selected.size || deleting) return

    const confirmed = window.confirm(
      `${selected.size} ausgewählte Inventareinträge wirklich löschen? Die zugehörigen Purchase Items werden dadurch wieder als noch nicht vollständig übernommen angezeigt.`,
    )
    if (!confirmed) return

    setDeleting(true)

    try {
      const response = await fetch('/api/inventory/units', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ ids: [...selected] }),
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || 'Inventareinträge konnten nicht gelöscht werden.')
      }

      setSelected(new Set())
      router.refresh()
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : 'Inventareinträge konnten nicht gelöscht werden.',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="inventory-figma-shell">
      <section className="inv-topbar">
        <div className="inv-brand">
          <span className="inv-brand-mark">
            <InventoryMark />
          </span>
          <div>
            <span className="inv-kicker">CardCargo</span>
            <h1>Inventar</h1>
            <p>Physische Pokémon-Karten · einzeln nachverfolgbar</p>
          </div>
        </div>

        <div className="inv-top-actions">
          <div className="inv-sync">
            <span>Letzte Ansicht</span>
            <strong>{new Intl.DateTimeFormat('de-DE', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date())}</strong>
          </div>
          <a className="inv-button inv-button-muted" href="#inventory-pending">
            Offene Karten ({pendingItems.reduce((sum, item) => sum + item.remaining, 0)})
          </a>
          <Link className="inv-button inv-button-primary" href="/purchases">
            + Karte erfassen
          </Link>
        </div>
      </section>

      {loadError ? (
        <div className="inv-alert">
          Inventardaten konnten nicht vollständig geladen werden. Bitte prüfe den
          aktuellen Supabase-Migrationsstand.
        </div>
      ) : null}

      <section className="inv-stat-grid" aria-label="Inventarstatistik">
        {[
          { label: 'Karten gesamt', value: stats.total, tone: 'brown' },
          { label: 'In Sammlung', value: stats.inCollection, tone: 'green' },
          { label: 'Zum Verkauf', value: stats.listed, tone: 'ochre' },
          { label: 'Verkauft', value: stats.sold, tone: 'red' },
        ].map((stat) => (
          <article className="inv-stat-card" key={stat.label}>
            <strong className={`tone-${stat.tone}`}>{stat.value}</strong>
            <span>{stat.label}</span>
          </article>
        ))}
      </section>

      <section className="inv-workspace">
        <aside className="inv-sidebar">
          <div className="inv-sidebar-head">
            <div>
              <span>Filter & Sortierung</span>
              {activeFilterCount ? <small>{activeFilterCount} aktiv</small> : null}
            </div>
            <button type="button" onClick={clearFilters}>
              Zurücksetzen
            </button>
          </div>

          <div className="inv-sidebar-body">
            <label className="inv-field-label" htmlFor="inventory-search">
              Suche
            </label>
            <div className="inv-input-wrap">
              <SearchIcon />
              <input
                id="inventory-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, Set, Setcode, Nr., Quelle …"
              />
            </div>

            <AccordionFilter
              label="Sprache"
              value={language}
              options={languageOptions}
              onChange={setLanguage}
            />
            <AccordionFilter
              label="Set / Erweiterung"
              value={expansion}
              options={expansionOptions}
              onChange={setExpansion}
            />
            <AccordionFilter
              label="Seltenheit"
              value={rarity}
              options={rarityOptions}
              onChange={setRarity}
            />
            <AccordionFilter
              label="Mindestzustand"
              value={condition}
              options={conditionOptions}
              onChange={setCondition}
            />
            <AccordionFilter
              label="Status"
              value={status}
              options={statusOptions}
              onChange={setStatus}
              accent="brown"
            />

            <button
              className="inv-more-filter-toggle"
              type="button"
              onClick={() => setShowMoreFilters((current) => !current)}
            >
              <span>{showMoreFilters ? 'Weniger Filter' : 'Weitere Filter'}</span>
              <span className={`inv-chevron ${showMoreFilters ? 'is-open' : ''}`}>
                <ChevronIcon />
              </span>
            </button>

            {showMoreFilters ? (
              <div className="inv-more-filters">
                <AccordionFilter
                  label="Grading"
                  value={grading}
                  options={gradingOptions}
                  onChange={setGrading}
                />
                <AccordionFilter
                  label="Lagerort"
                  value={storage}
                  options={storageOptions}
                  onChange={setStorage}
                />
              </div>
            ) : null}

            <label className="inv-field-label" htmlFor="inventory-comments">
              Kommentare / Notizen
            </label>
            <div className="inv-input-wrap">
              <CommentIcon />
              <input
                id="inventory-comments"
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                placeholder="In Notizen suchen …"
              />
            </div>

            <span className="inv-field-label">Kostenbereich</span>
            <div className="inv-cost-range">
              <input
                type="number"
                inputMode="decimal"
                value={minCost}
                onChange={(event) => setMinCost(event.target.value)}
                placeholder="Min"
                aria-label="Mindestkosten"
              />
              <input
                type="number"
                inputMode="decimal"
                value={maxCost}
                onChange={(event) => setMaxCost(event.target.value)}
                placeholder="Max"
                aria-label="Maximalkosten"
              />
            </div>

            <label className="inv-field-label" htmlFor="inventory-sort">
              Sortieren nach
            </label>
            <div className="inv-select-wrap">
              <select
                id="inventory-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronIcon />
            </div>
          </div>

          <footer className="inv-sidebar-footer">
            {filtered.length} / {units.length} Einträge
          </footer>
        </aside>

        <main className="inv-table-card">
          <header className="inv-table-head">
            <div>
              <span className="inv-kicker">Physische Exemplare</span>
              <h2>Inventory</h2>
            </div>

            <div className="inv-table-actions">
              {selected.size ? (
                <>
                  <span>{selected.size} ausgewählt</span>
                  <button
                    className="inv-button inv-button-muted"
                    type="button"
                    onClick={() =>
                      exportRows(units.filter((unit) => selected.has(unit.id)))
                    }
                  >
                    Auswahl exportieren
                  </button>
                  <button
                    className="inv-button inv-button-danger"
                    type="button"
                    disabled={deleting}
                    onClick={deleteSelected}
                  >
                    {deleting ? 'Löschen …' : 'Löschen'}
                  </button>
                </>
              ) : (
                <button
                  className="inv-button inv-button-muted"
                  type="button"
                  onClick={() => exportRows(filtered)}
                  disabled={!filtered.length}
                >
                  CSV exportieren
                </button>
              )}
            </div>
          </header>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th className="inv-check-cell">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Alle sichtbaren Inventareinträge auswählen"
                    />
                  </th>
                  <th>Karte</th>
                  <th>Set</th>
                  <th>Nr.</th>
                  <th>Sprache</th>
                  <th>Seltenheit</th>
                  <th>Zustand</th>
                  <th>Grading</th>
                  <th>Lagerort</th>
                  <th>Kosten</th>
                  <th>Status</th>
                  <th>Quelle</th>
                  <th>Aktualisiert</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((unit, index) => (
                    <tr
                      className={selected.has(unit.id) ? 'is-selected' : ''}
                      key={unit.id}
                      onClick={() => toggleSelected(unit.id)}
                      data-stripe={index % 2 ? 'odd' : 'even'}
                    >
                      <td className="inv-check-cell">
                        <input
                          type="checkbox"
                          checked={selected.has(unit.id)}
                          onChange={() => toggleSelected(unit.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`${unit.itemName} auswählen`}
                        />
                      </td>
                      <td className="inv-item-cell">
                        <div className="inv-card-thumb">
                          {unit.imageUrl ? (
                            <img
                              src={unit.imageUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span>CC</span>
                          )}
                        </div>
                        <div>
                          <strong>{unit.itemName}</strong>
                          <small>
                            {unit.pokemonNameEn &&
                            normalized(unit.pokemonNameEn) !== normalized(unit.itemName)
                              ? unit.pokemonNameEn
                              : 'Physisches Exemplar'}
                          </small>
                        </div>
                      </td>
                      <td>
                        <strong className="inv-table-main">
                          {unit.setName || '–'}
                        </strong>
                        <small>{unit.setCode || 'Kein Setcode'}</small>
                      </td>
                      <td className="inv-mono">{unit.cardNumber || '–'}</td>
                      <td>{unit.language || '–'}</td>
                      <td>{unit.rarity || '–'}</td>
                      <td>{unit.condition || 'Nicht bewertet'}</td>
                      <td>
                        {unit.gradingCompany ? (
                          <>
                            <strong className="inv-table-main">
                              {unit.gradingCompany}
                            </strong>
                            <small>{unit.grade || 'Grade offen'}</small>
                          </>
                        ) : (
                          'Raw'
                        )}
                      </td>
                      <td>{unit.storageLocation || 'Offen'}</td>
                      <td className="inv-mono">
                        {formatMoney(unit.allocatedTotalCost, unit.costCurrency)}
                      </td>
                      <td>
                        <span className={`inv-status inv-status-${unit.status}`}>
                          {STATUS_LABELS[unit.status] ?? unit.status}
                        </span>
                      </td>
                      <td>
                        {unit.sourceHref ? (
                          <Link
                            className="inv-source-link"
                            href={unit.sourceHref}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {unit.sourceLabel}
                          </Link>
                        ) : (
                          unit.sourceLabel
                        )}
                      </td>
                      <td className="inv-mono">{formatShortDate(unit.updatedAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={13}>
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
            <span>{filtered.length} Einträge angezeigt</span>
            <span>
              Kosten:{' '}
              {filteredCostTotals.length
                ? filteredCostTotals
                    .map(([currency, total]) => formatMoney(total, currency))
                    .join(' · ')
                : '–'}
            </span>
          </footer>
        </main>
      </section>

      <section className="inv-pending-card" id="inventory-pending">
        <header>
          <div>
            <span className="inv-kicker">Noch nicht übernommen</span>
            <h2>Offene Karten</h2>
            <p>
              Erfasste Purchase Items und OLAEET-Bonuskarten, für die noch nicht
              alle physischen Exemplare im Inventar angelegt wurden.
            </p>
          </div>
          <strong>
            {pendingItems.reduce((sum, item) => sum + item.remaining, 0)} offen
          </strong>
        </header>

        {pendingItems.length ? (
          <div className="inv-pending-grid">
            {pendingItems.map((item) => (
              <article className="inv-pending-item" key={item.id}>
                <div className="inv-pending-thumb">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>CC</span>
                  )}
                </div>
                <div className="inv-pending-copy">
                  <strong>{item.itemName}</strong>
                  <span>
                    {[item.setName, item.setCode, item.cardNumber, item.language]
                      .filter(Boolean)
                      .join(' · ') || 'Kartendaten noch unvollständig'}
                  </span>
                  <small>{item.sourceLabel}</small>
                </div>
                <strong className="inv-pending-count">{item.remaining}×</strong>
                {item.sourceHref ? (
                  <Link className="inv-button inv-button-muted" href={item.sourceHref}>
                    Quelle öffnen
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="inv-empty inv-empty-compact">
            <strong>Alles übernommen.</strong>
            <span>Aktuell gibt es keine offenen Kartenpositionen.</span>
          </div>
        )}
      </section>
    </div>
  )
}
