'use client'

import { useEffect, useMemo, useState } from 'react'

type PurchaseItemSnapshot = {
  id: string
  name: string
  subtitle: string
  setNumber: string | null
  cardNumber: string | null
  quantity: number
}

type PurchaseCandidate = {
  id: string
  orderId: string | null
  title: string
  sellerName: string | null
  purchasedAt: string | null
  purchaseCostKrw: number | null
  domesticTrackingNumber: string | null
  items: PurchaseItemSnapshot[]
}

type PurchaseSearchPayload = {
  error?: string
  candidates?: PurchaseCandidate[]
}

type PlanCard = {
  id: string
  source: 'bunjang' | 'manual'
  sourcePurchaseId: string | null
  sourcePurchaseLabel: string | null
  name: string
  subtitle: string
  setNumber: string | null
  cardNumber: string | null
  quantity: number
  plannedPurchasePriceEur: number | null
  minSalePriceEur: number | null
  targetSalePriceEur: number | null
}

type PlanPurchase = {
  id: string
  orderId: string | null
  title: string
  sellerName: string | null
  purchasedAt: string | null
  purchaseCostKrw: number | null
  cardIds: string[]
}

type RevenuePlan = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  purchases: PlanPurchase[]
  cards: PlanCard[]
}

const STORAGE_KEY = 'cardcargo.revenuePlans.v107'
const SELECTED_KEY = 'cardcargo.revenuePlans.v107.selected'

function makeId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${random}`
}

function formatEur(value: number) {
  return `${new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`
}

function formatKrw(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '–'
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)} ₩`
}

function formatDate(value: string | null) {
  if (!value) return '–'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('de-DE').format(parsed)
}

function parseMoney(raw: string) {
  const normalized = raw.trim().replace(/[€\s]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function moneyInput(value: number | null) {
  if (value === null || !Number.isFinite(value)) return ''
  return value.toFixed(2).replace('.', ',')
}

function loadStoredPlans() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return [] as RevenuePlan[]
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as RevenuePlan[]) : []
  } catch {
    return [] as RevenuePlan[]
  }
}

function blankPlan(name = 'Umsatzplan') : RevenuePlan {
  const now = new Date().toISOString()
  return {
    id: makeId('plan'),
    name,
    createdAt: now,
    updatedAt: now,
    purchases: [],
    cards: [],
  }
}

export function RevenuePlanWorkspace() {
  const [plans, setPlans] = useState<RevenuePlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [results, setResults] = useState<PurchaseCandidate[]>([])
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<string[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = loadStoredPlans()
      const nextPlans = stored.length ? stored : [blankPlan('Umsatzplan 1')]
      const storedSelected = window.localStorage.getItem(SELECTED_KEY) || ''
      const nextSelected = nextPlans.some((plan) => plan.id === storedSelected)
        ? storedSelected
        : nextPlans[0].id
      if (!stored.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPlans))
      window.localStorage.setItem(SELECTED_KEY, nextSelected)
      setPlans(nextPlans)
      setSelectedPlanId(nextSelected)
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const plan = plans.find((entry) => entry.id === selectedPlanId) ?? null

  const totals = useMemo(() => {
    const cards = plan?.cards ?? []
    const quantity = cards.reduce((sum, card) => sum + Math.max(1, card.quantity), 0)
    const minimumRevenue = cards.reduce(
      (sum, card) => sum + (card.minSalePriceEur ?? 0) * Math.max(1, card.quantity),
      0,
    )
    const targetRevenue = cards.reduce(
      (sum, card) => sum + (card.targetSalePriceEur ?? 0) * Math.max(1, card.quantity),
      0,
    )
    const manualPurchaseCost = cards.reduce(
      (sum, card) => sum + (card.plannedPurchasePriceEur ?? 0) * Math.max(1, card.quantity),
      0,
    )
    const bunjangPurchaseCost = (plan?.purchases ?? []).reduce(
      (sum, purchase) => sum + (purchase.purchaseCostKrw ?? 0),
      0,
    )
    return { quantity, minimumRevenue, targetRevenue, manualPurchaseCost, bunjangPurchaseCost }
  }, [plan])

  function persist(nextPlans: RevenuePlan[], nextSelected = selectedPlanId) {
    setPlans(nextPlans)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPlans))
    if (nextSelected) {
      setSelectedPlanId(nextSelected)
      window.localStorage.setItem(SELECTED_KEY, nextSelected)
    }
  }

  function updatePlan(mutator: (current: RevenuePlan) => RevenuePlan) {
    if (!plan) return
    const nextPlans = plans.map((entry) =>
      entry.id === plan.id
        ? { ...mutator(entry), updatedAt: new Date().toISOString() }
        : entry,
    )
    persist(nextPlans)
  }

  function createPlan() {
    const next = blankPlan(`Umsatzplan ${plans.length + 1}`)
    persist([...plans, next], next.id)
    setResults([])
    setSelectedPurchaseIds([])
  }

  function deletePlan() {
    if (!plan) return
    const remaining = plans.filter((entry) => entry.id !== plan.id)
    const nextPlans = remaining.length ? remaining : [blankPlan('Umsatzplan 1')]
    persist(nextPlans, nextPlans[0].id)
  }

  async function searchPurchases() {
    setSearching(true)
    setSearchError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const response = await fetch(`/api/revenue-plan/purchases?${params.toString()}`)
      const payload = (await response.json()) as PurchaseSearchPayload
      if (!response.ok) throw new Error(payload.error || 'Bunjang-Einkäufe konnten nicht geladen werden.')
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
      setResults(candidates)
      setSelectedPurchaseIds([])
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : String(error))
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  function addSelectedPurchases(useAllResults = false) {
    if (!plan) return
    const ids = useAllResults ? results.map((result) => result.id) : selectedPurchaseIds
    const chosen = results.filter((result) => ids.includes(result.id))
    if (!chosen.length) return

    updatePlan((current) => {
      const existingPurchaseIds = new Set(current.purchases.map((purchase) => purchase.id))
      const existingItemIds = new Set(
        current.cards
          .filter((card) => card.source === 'bunjang')
          .map((card) => card.id.replace(/^bunjang-/, '')),
      )
      const purchases = [...current.purchases]
      const cards = [...current.cards]

      for (const purchase of chosen) {
        const cardIds: string[] = []
        for (const item of purchase.items) {
          cardIds.push(item.id)
          if (existingItemIds.has(item.id)) continue
          cards.push({
            id: `bunjang-${item.id}`,
            source: 'bunjang',
            sourcePurchaseId: purchase.id,
            sourcePurchaseLabel: purchase.orderId || purchase.title,
            name: item.name,
            subtitle: item.subtitle,
            setNumber: item.setNumber,
            cardNumber: item.cardNumber,
            quantity: Math.max(1, item.quantity),
            plannedPurchasePriceEur: null,
            minSalePriceEur: null,
            targetSalePriceEur: null,
          })
          existingItemIds.add(item.id)
        }
        if (!existingPurchaseIds.has(purchase.id)) {
          purchases.push({
            id: purchase.id,
            orderId: purchase.orderId,
            title: purchase.title,
            sellerName: purchase.sellerName,
            purchasedAt: purchase.purchasedAt,
            purchaseCostKrw: purchase.purchaseCostKrw,
            cardIds,
          })
          existingPurchaseIds.add(purchase.id)
        }
      }
      return { ...current, purchases, cards }
    })
    setSelectedPurchaseIds([])
  }

  function removePurchase(purchaseId: string) {
    updatePlan((current) => ({
      ...current,
      purchases: current.purchases.filter((purchase) => purchase.id !== purchaseId),
      cards: current.cards.filter(
        (card) => !(card.source === 'bunjang' && card.sourcePurchaseId === purchaseId),
      ),
    }))
  }

  function addManualCard() {
    updatePlan((current) => ({
      ...current,
      cards: [
        ...current.cards,
        {
          id: makeId('manual'),
          source: 'manual',
          sourcePurchaseId: null,
          sourcePurchaseLabel: 'Noch nicht gekauft',
          name: 'Neue Karte',
          subtitle: '',
          setNumber: null,
          cardNumber: null,
          quantity: 1,
          plannedPurchasePriceEur: null,
          minSalePriceEur: null,
          targetSalePriceEur: null,
        },
      ],
    }))
  }

  function updateCard(cardId: string, patch: Partial<PlanCard>) {
    updatePlan((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
    }))
  }

  function removeCard(cardId: string) {
    updatePlan((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== cardId),
    }))
  }

  if (!hydrated || !plan) {
    return <section className="panel cc107-loading">Umsatzplan wird geladen …</section>
  }

  const purchaseGroups = plan.purchases.map((purchase) => ({
    purchase,
    cards: plan.cards.filter(
      (card) => card.source === 'bunjang' && card.sourcePurchaseId === purchase.id,
    ),
  }))
  const manualCards = plan.cards.filter((card) => card.source === 'manual')

  return (
    <div className="page-stack cc107-plan-page">
      <header className="cc107-plan-header">
        <div>
          <span className="eyebrow">Umsatz · Test & Planung</span>
          <div className="cc107-title-row">
            <h1>Umsatzplan</h1>
            <a className="button button-secondary" href="/revenue">← Tatsächlicher Umsatz</a>
          </div>
          <p>
            Szenarien lokal planen, ohne Inventarstatus oder echte Verkaufswerte zu verändern.
          </p>
        </div>
      </header>

      <section className="panel cc107-plan-toolbar">
        <label>
          <span>Plan</span>
          <select
            value={selectedPlanId}
            onChange={(event) => {
              setSelectedPlanId(event.target.value)
              window.localStorage.setItem(SELECTED_KEY, event.target.value)
            }}
          >
            {plans.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        </label>
        <label className="cc107-plan-name">
          <span>Name</span>
          <input
            value={plan.name}
            onChange={(event) => updatePlan((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <div className="cc107-toolbar-actions">
          <button className="button button-secondary" type="button" onClick={createPlan}>Neuer Plan</button>
          <button className="button button-danger" type="button" onClick={deletePlan}>Plan löschen</button>
        </div>
        <p className="cc107-local-note">Automatisch nur in diesem Browser gespeichert · keine Supabase-Daten werden verändert.</p>
      </section>

      <section className="cc107-metrics" aria-label="Plan-Kennzahlen">
        <article>
          <span>Zielumsatz</span>
          <strong>{formatEur(totals.targetRevenue)}</strong>
          <small>geplanter Verkaufspreis × Menge</small>
        </article>
        <article>
          <span>Mindestumsatz</span>
          <strong>{formatEur(totals.minimumRevenue)}</strong>
          <small>Summe Mindestverkaufswerte</small>
        </article>
        <article>
          <span>Karten</span>
          <strong>{totals.quantity}</strong>
          <small>{plan.purchases.length} Bunjang-Bestellungen + manuelle Karten</small>
        </article>
        <article>
          <span>Einkaufsbasis</span>
          <strong>{formatKrw(totals.bunjangPurchaseCost)}</strong>
          <small>+ {formatEur(totals.manualPurchaseCost)} geplante manuelle Käufe</small>
        </article>
      </section>

      <section className="panel cc107-import-panel">
        <div className="panel-heading">
          <div>
            <h2>Bunjang-Einkäufe übernehmen</h2>
            <p>Bestellungen einzeln suchen oder einen kompletten Kaufzeitraum in den Plan übernehmen.</p>
          </div>
        </div>
        <div className="cc107-search-grid">
          <label className="cc107-search-wide">
            <span>Bestellung, Karte, Verkäufer oder Tracking</span>
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="z. B. 424191752 oder Mew" />
          </label>
          <label>
            <span>Von</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span>Bis</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button className="button button-primary" type="button" onClick={searchPurchases} disabled={searching}>
            {searching ? 'Suche …' : 'Suchen'}
          </button>
        </div>
        {searchError ? <div className="alert alert-error">{searchError}</div> : null}
        {results.length ? (
          <>
            <div className="cc107-result-actions">
              <span>{results.length} Treffer</span>
              <button className="button button-secondary" type="button" onClick={() => addSelectedPurchases(false)} disabled={!selectedPurchaseIds.length}>
                Auswahl übernehmen
              </button>
              <button className="button button-secondary" type="button" onClick={() => addSelectedPurchases(true)}>
                Alle Treffer übernehmen
              </button>
            </div>
            <div className="cc107-purchase-results">
              {results.map((purchase) => {
                const checked = selectedPurchaseIds.includes(purchase.id)
                const alreadyAdded = plan.purchases.some((entry) => entry.id === purchase.id)
                return (
                  <label key={purchase.id} className={`cc107-purchase-result${alreadyAdded ? ' is-added' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={alreadyAdded}
                      onChange={(event) => {
                        setSelectedPurchaseIds((current) =>
                          event.target.checked
                            ? [...current, purchase.id]
                            : current.filter((id) => id !== purchase.id),
                        )
                      }}
                    />
                    <span>
                      <strong>{purchase.orderId ? `Bestellung ${purchase.orderId}` : purchase.title}</strong>
                      <small>{purchase.title} · {formatDate(purchase.purchasedAt)} · {purchase.items.length} Einzelkarten</small>
                    </span>
                    <span className="cc107-result-cost">{formatKrw(purchase.purchaseCostKrw)}</span>
                  </label>
                )
              })}
            </div>
          </>
        ) : null}
      </section>

      <section className="panel cc107-manual-panel">
        <div className="panel-heading">
          <div>
            <h2>Noch nicht gekaufte Karten</h2>
            <p>Hypothetische Karten hinzufügen und Kauf-/Verkaufswerte direkt im Plan bearbeiten.</p>
          </div>
          <button className="button button-primary" type="button" onClick={addManualCard}>+ Karte hinzufügen</button>
        </div>
      </section>

      <section className="panel cc107-plan-table-panel">
        <div className="panel-heading">
          <div>
            <h2>Bestellungen & Karten</h2>
            <p>Alle Werte werden sofort lokal gespeichert. EUR-Felder sind Planwerte und verändern nicht das echte Inventar.</p>
          </div>
          <span className="panel-note">{totals.quantity} Karten</span>
        </div>
        <div className="cc107-table-wrap">
          <table className="cc107-plan-table">
            <thead>
              <tr>
                <th>Bestellung / Karte</th>
                <th>Menge</th>
                <th>Kaufbasis</th>
                <th>Min. Verkaufswert EUR</th>
                <th>Ziel-Verkaufspreis EUR</th>
                <th>Zielumsatz</th>
                <th aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {purchaseGroups.map(({ purchase, cards }) => (
                <PurchaseRows key={purchase.id} purchase={purchase} cards={cards} updateCard={updateCard} removePurchase={removePurchase} />
              ))}
              {manualCards.length ? (
                <tr className="cc107-group-row cc107-manual-group">
                  <td colSpan={7}>
                    <strong>Noch nicht gekauft</strong>
                    <span>Manuell geplante Karten</span>
                  </td>
                </tr>
              ) : null}
              {manualCards.map((card) => (
                <EditableCardRow key={card.id} card={card} updateCard={updateCard} removeCard={removeCard} />
              ))}
              {!plan.cards.length ? (
                <tr>
                  <td colSpan={7} className="cc107-empty-cell">Noch keine Karten im Plan.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function PurchaseRows({
  purchase,
  cards,
  updateCard,
  removePurchase,
}: {
  purchase: PlanPurchase
  cards: PlanCard[]
  updateCard: (cardId: string, patch: Partial<PlanCard>) => void
  removePurchase: (purchaseId: string) => void
}) {
  const min = cards.reduce((sum, card) => sum + (card.minSalePriceEur ?? 0) * Math.max(1, card.quantity), 0)
  const target = cards.reduce((sum, card) => sum + (card.targetSalePriceEur ?? 0) * Math.max(1, card.quantity), 0)
  return (
    <>
      <tr className="cc107-group-row">
        <td>
          <strong>{purchase.orderId ? `Bestellung ${purchase.orderId}` : purchase.title}</strong>
          <span>{purchase.title} · {formatDate(purchase.purchasedAt)}</span>
        </td>
        <td>{cards.reduce((sum, card) => sum + Math.max(1, card.quantity), 0)}</td>
        <td>{formatKrw(purchase.purchaseCostKrw)}</td>
        <td>{formatEur(min)}</td>
        <td>{formatEur(target)}</td>
        <td>{formatEur(target)}</td>
        <td><button type="button" className="cc107-icon-button" onClick={() => removePurchase(purchase.id)} aria-label="Bestellung aus Plan entfernen">×</button></td>
      </tr>
      {cards.map((card) => (
        <EditableCardRow key={card.id} card={card} updateCard={updateCard} />
      ))}
    </>
  )
}

function EditableCardRow({
  card,
  updateCard,
  removeCard,
}: {
  card: PlanCard
  updateCard: (cardId: string, patch: Partial<PlanCard>) => void
  removeCard?: (cardId: string) => void
}) {
  const isManual = card.source === 'manual'
  const targetTotal = (card.targetSalePriceEur ?? 0) * Math.max(1, card.quantity)
  return (
    <tr className="cc107-card-row">
      <td>
        {isManual ? (
          <div className="cc107-card-editor">
            <input className="cc107-card-name-input" value={card.name} onChange={(event) => updateCard(card.id, { name: event.target.value })} />
            <div>
              <input placeholder="Kartennr." value={card.cardNumber ?? ''} onChange={(event) => updateCard(card.id, { cardNumber: event.target.value || null })} />
              <input placeholder="Setnummer" value={card.setNumber ?? ''} onChange={(event) => updateCard(card.id, { setNumber: event.target.value || null })} />
            </div>
          </div>
        ) : (
          <div className="cc107-card-copy">
            <strong>{card.name}</strong>
            <span>{card.subtitle || [card.cardNumber ? `Kartennr. ${card.cardNumber}` : '', card.setNumber ? `Set ${card.setNumber}` : ''].filter(Boolean).join(' · ') || 'Einzelkarte'}</span>
          </div>
        )}
      </td>
      <td>
        <input
          className="cc107-qty-input"
          type="number"
          min={1}
          step={1}
          value={card.quantity}
          onChange={(event) => updateCard(card.id, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
        />
      </td>
      <td>
        {isManual ? (
          <MoneyCell value={card.plannedPurchasePriceEur} onChange={(value) => updateCard(card.id, { plannedPurchasePriceEur: value })} />
        ) : (
          <span className="cc107-muted">über Bestellung</span>
        )}
      </td>
      <td><MoneyCell value={card.minSalePriceEur} onChange={(value) => updateCard(card.id, { minSalePriceEur: value })} /></td>
      <td><MoneyCell value={card.targetSalePriceEur} onChange={(value) => updateCard(card.id, { targetSalePriceEur: value })} /></td>
      <td className="cc107-target-total">{formatEur(targetTotal)}</td>
      <td>{removeCard ? <button type="button" className="cc107-icon-button" onClick={() => removeCard(card.id)} aria-label="Karte aus Plan entfernen">×</button> : null}</td>
    </tr>
  )
}

function MoneyCell({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const [draft, setDraft] = useState(() => moneyInput(value))

  useEffect(() => {
    const timer = window.setTimeout(() => setDraft(moneyInput(value)), 0)
    return () => window.clearTimeout(timer)
  }, [value])

  function commit() {
    onChange(parseMoney(draft))
  }

  return (
    <div className="cc107-money-input">
      <input
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
            event.currentTarget.blur()
          }
        }}
        placeholder="0,00"
      />
      <span>€</span>
    </div>
  )
}
