'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type ShipmentOption = {
  shipmentId: string
  externalShipmentId: string
  cardCount: number
}

type FxSnapshot = {
  requestedDate: string
  rateDate: string
  krwPerEur: number
  source: string
  persistenceWarning?: string | null
}

type RevenueCard = {
  inventoryUnitId: string
  purchaseItemId: string | null
  name: string
  subtitle: string
  status: string
  sourceType: string
  storageNumber: string | null
  minSalePriceKrw: number | null
  salePriceKrw: number | null
}

type RevenueGroup = {
  key: string
  type: 'purchase' | 'package'
  label: string
  subtitle: string
  purchaseId: string | null
  purchaseCostKrw: number | null
  cards: RevenueCard[]
}

type RevenuePayload = {
  error?: string
  shipments?: ShipmentOption[]
  shipment?: {
    id: string
    externalShipmentId: string
    createdDate: string
    providerCreatedAt: string | null
  }
  fx?: FxSnapshot | null
  groups?: RevenueGroup[]
  totals?: {
    cardCount: number
    orderGroupCount: number
    purchaseCostKrw: number
    minimumRevenueKrw: number
    actualRevenueKrw: number
    soldCardCount: number
  }
  warnings?: string[]
}

type CustomsCost = {
  amount: number | null
  currency: string
}

type ShipmentCostSummary = {
  customs: CustomsCost
  totals: {
    primaryCurrency: string
    preCustomsTotal: number | null
    totalWithCustoms: number | null
  }
}

type ShipmentDetailsPayload = {
  error?: string
  costSummary?: ShipmentCostSummary
}

function formatKrw(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '–'
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)} ₩`
}

function formatEur(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '–'
  return `${new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`
}

function eurFromKrw(value: number | null, fx: FxSnapshot | null | undefined) {
  if (value === null || !fx?.krwPerEur) return null
  return value / fx.krwPerEur
}

function krwFromEur(value: number | null, fx: FxSnapshot | null | undefined) {
  if (value === null || !fx?.krwPerEur) return null
  return value * fx.krwPerEur
}

function parseMoneyInput(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = trimmed
    .replace(/[₩€KRWEUR\s]/gi, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function inputValue(value: number | null, currency: 'KRW' | 'EUR') {
  if (value === null || !Number.isFinite(value)) return ''
  return currency === 'KRW'
    ? String(Math.round(value))
    : value.toFixed(2).replace('.', ',')
}

function calculateShipmentCostKrw(
  summary: ShipmentCostSummary | undefined,
  fx: FxSnapshot | null | undefined,
) {
  const base = summary?.totals.preCustomsTotal
  if (base === null || base === undefined) return null
  const primary = String(summary?.totals.primaryCurrency || 'KRW').toUpperCase()
  let totalKrw: number | null = primary === 'KRW'
    ? base
    : primary === 'EUR'
      ? krwFromEur(base, fx)
      : null
  if (totalKrw === null) return null

  const customs = summary?.customs
  if (customs?.amount === null || customs?.amount === undefined) return totalKrw
  const customsCurrency = String(customs.currency || 'EUR').toUpperCase()
  if (customsCurrency === 'KRW') totalKrw += customs.amount
  else if (customsCurrency === 'EUR') {
    const converted = krwFromEur(customs.amount, fx)
    if (converted === null) return null
    totalKrw += converted
  } else return null
  return totalKrw
}

function metricPair(valueKrw: number | null, fx: FxSnapshot | null | undefined) {
  return (
    <>
      <strong>{formatEur(eurFromKrw(valueKrw, fx))}</strong>
      <span>{formatKrw(valueKrw)}</span>
    </>
  )
}

export function RevenueWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedShipment = String(searchParams.get('shipment') || '').trim()
  const [optionsPayload, setOptionsPayload] = useState<RevenuePayload | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/revenue')
      .then(async (response) => {
        const json = (await response.json()) as RevenuePayload
        if (!response.ok) throw new Error(json.error || 'Sendungen konnten nicht geladen werden.')
        return json
      })
      .then((json) => {
        if (!cancelled) setOptionsPayload(json)
      })
      .catch((error) => {
        if (!cancelled) {
          setOptionsPayload({ error: error instanceof Error ? error.message : String(error), shipments: [] })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const shipments = Array.isArray(optionsPayload?.shipments) ? optionsPayload.shipments : []
  const selected = shipments.some((shipment) => shipment.externalShipmentId === requestedShipment)
    ? requestedShipment
    : shipments[0]?.externalShipmentId || ''

  function selectShipment(externalShipmentId: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (externalShipmentId) next.set('shipment', externalShipmentId)
    else next.delete('shipment')
    const query = next.toString()
    router.replace(query ? `/revenue?${query}` : '/revenue', { scroll: false })
  }

  return (
    <div className="page-stack cc102-revenue-page">
      <header className="cc102-page-header">
        <div>
          <span className="eyebrow">Finanzen · Inventar</span>
          <h1>Umsatz</h1>
          <p>
            Bestellungen und Einzelkarten einer internationalen Sendung kompakt kalkulieren.
          </p>
        </div>

        <label className="cc102-shipment-picker">
          <span>Internationale Sendung</span>
          <select
            value={selected}
            onChange={(event) => selectShipment(event.target.value)}
            disabled={!shipments.length}
          >
            {!shipments.length ? <option value="">Keine Sendung verfügbar</option> : null}
            {shipments.map((shipment) => (
              <option key={shipment.shipmentId} value={shipment.externalShipmentId}>
                {shipment.externalShipmentId} · {shipment.cardCount} Karten
              </option>
            ))}
          </select>
        </label>
      </header>

      {optionsPayload?.error ? (
        <div className="alert alert-error">{optionsPayload.error}</div>
      ) : null}

      {!optionsPayload ? (
        <section className="panel cc102-loading">Umsatzdaten werden geladen …</section>
      ) : selected ? (
        <RevenueShipmentLoader key={selected} shipmentRef={selected} />
      ) : !optionsPayload.error ? (
        <section className="panel empty-state">
          <p>
            Noch keine Inventarkarten sind einer internationalen Sendung zugeordnet. Übernimm zuerst
            die Einzelkarten einer Sendung ins Inventar.
          </p>
        </section>
      ) : null}
    </div>
  )
}

function RevenueShipmentLoader({ shipmentRef }: { shipmentRef: string }) {
  const [payload, setPayload] = useState<RevenuePayload | null>(null)
  const [shipmentDetails, setShipmentDetails] = useState<ShipmentDetailsPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/revenue?shipmentRef=${encodeURIComponent(shipmentRef)}`).then(async (response) => {
        const json = (await response.json()) as RevenuePayload
        if (!response.ok) throw new Error(json.error || 'Umsatzdaten konnten nicht geladen werden.')
        return json
      }),
      fetch(`/api/shipments/olaeet-details?shipmentRef=${encodeURIComponent(shipmentRef)}`)
        .then(async (response) => {
          const json = (await response.json()) as ShipmentDetailsPayload
          return response.ok ? json : { error: json.error || 'Sendungskosten konnten nicht geladen werden.' }
        })
        .catch((error) => ({ error: error instanceof Error ? error.message : String(error) })),
    ])
      .then(([revenue, details]) => {
        if (!cancelled) {
          setPayload(revenue)
          setShipmentDetails(details)
        }
      })
      .catch((error) => {
        if (!cancelled) setPayload({ error: error instanceof Error ? error.message : String(error) })
      })

    return () => {
      cancelled = true
    }
  }, [shipmentRef])

  if (!payload) return <section className="panel cc102-loading">Sendung wird kalkuliert …</section>
  if (payload.error) return <div className="alert alert-error">{payload.error}</div>

  return (
    <RevenueShipmentView
      initialPayload={payload}
      costSummary={shipmentDetails?.costSummary}
      costError={shipmentDetails?.error || null}
    />
  )
}

function RevenueShipmentView({
  initialPayload,
  costSummary,
  costError,
}: {
  initialPayload: RevenuePayload
  costSummary?: ShipmentCostSummary
  costError: string | null
}) {
  const [payload, setPayload] = useState(initialPayload)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveWarning, setSaveWarning] = useState<string | null>(null)
  const groups = Array.isArray(payload.groups) ? payload.groups : []
  const fx = payload.fx ?? null

  const totals = useMemo(() => {
    const cards = groups.flatMap((group) => group.cards)
    return {
      minimumRevenueKrw: cards.reduce((sum, card) => sum + (card.minSalePriceKrw ?? 0), 0),
      actualRevenueKrw: cards.reduce((sum, card) => sum + (card.salePriceKrw ?? 0), 0),
      soldCardCount: cards.filter((card) => card.salePriceKrw !== null).length,
      cardCount: cards.length,
    }
  }, [groups])

  const shipmentCostKrw = calculateShipmentCostKrw(costSummary, fx)

  function updateCard(
    inventoryUnitId: string,
    next: { minSalePriceKrw: number | null; salePriceKrw: number | null },
  ) {
    setPayload((current) => ({
      ...current,
      groups: (current.groups ?? []).map((group) => ({
        ...group,
        cards: group.cards.map((card) =>
          card.inventoryUnitId === inventoryUnitId ? { ...card, ...next } : card,
        ),
      })),
    }))
  }

  async function saveValue(
    card: RevenueCard,
    field: 'minSalePriceKrw' | 'salePriceKrw',
    valueKrw: number | null,
  ) {
    setSaveError(null)
    setSaveWarning(null)
    const previous = {
      minSalePriceKrw: card.minSalePriceKrw,
      salePriceKrw: card.salePriceKrw,
    }
    const optimistic = { ...previous, [field]: valueKrw }
    updateCard(card.inventoryUnitId, optimistic)

    try {
      const response = await fetch('/api/revenue', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inventoryUnitId: card.inventoryUnitId, field, value: valueKrw }),
      })
      const json = (await response.json()) as {
        error?: string
        minSalePriceKrw?: number | null
        salePriceKrw?: number | null
        inventorySyncWarning?: string | null
      }
      if (!response.ok) throw new Error(json.error || 'Wert konnte nicht gespeichert werden.')
      updateCard(card.inventoryUnitId, {
        minSalePriceKrw: json.minSalePriceKrw ?? null,
        salePriceKrw: json.salePriceKrw ?? null,
      })
      if (json.inventorySyncWarning) setSaveWarning(json.inventorySyncWarning)
    } catch (error) {
      updateCard(card.inventoryUnitId, previous)
      setSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <section className="cc102-metrics" aria-label="Umsatzübersicht">
        <article className="cc102-metric-card">
          <span>Gesamtkosten der Sendung</span>
          {metricPair(shipmentCostKrw, fx)}
          <small>Bunjang + OLAEET + erfasster Zoll</small>
        </article>
        <article className="cc102-metric-card">
          <span>Mindestumsatz</span>
          {metricPair(totals.minimumRevenueKrw, fx)}
          <small>Summe „min. Verkaufswert“</small>
        </article>
        <article className="cc102-metric-card">
          <span>Aktueller Umsatz</span>
          {metricPair(totals.actualRevenueKrw, fx)}
          <small>{totals.soldCardCount} von {totals.cardCount} Karten mit Verkaufspreis</small>
        </article>
        <article className="cc102-metric-card cc102-fx-card">
          <span>Fixierter Wechselkurs</span>
          <strong>{fx ? `1 € = ${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(fx.krwPerEur)} ₩` : 'Nicht verfügbar'}</strong>
          <span>{fx ? `Kursdatum ${fx.rateDate}` : 'EUR-Werte bleiben leer'}</span>
          <small>{fx ? `${fx.source} · Sendung ${payload.shipment?.createdDate}` : 'Historischer Kurs konnte nicht geladen werden.'}</small>
        </article>
      </section>

      {costError ? <div className="alert alert-warning">Sendungskosten: {costError}</div> : null}
      {fx?.persistenceWarning ? (
        <div className="alert alert-warning">
          Wechselkurs wurde geladen, aber noch nicht dauerhaft gespeichert. Führe die v102-SQL-Datei aus.
        </div>
      ) : null}
      {(payload.warnings ?? []).map((warning) => (
        <div className="alert alert-warning" key={warning}>{warning}</div>
      ))}
      {saveWarning ? <div className="alert alert-warning">{saveWarning}</div> : null}
      {saveError ? <div className="alert alert-error">{saveError}</div> : null}

      <section className="panel cc102-sheet-panel">
        <div className="panel-heading cc102-sheet-heading">
          <div>
            <span className="eyebrow">{payload.shipment?.externalShipmentId}</span>
            <h2>Bestellungen &amp; Einzelkarten</h2>
            <p>Werte direkt in den Zellen ändern. Enter oder Klick außerhalb speichert.</p>
          </div>
          <span className="panel-note">{totals.cardCount} Karten</span>
        </div>

        <div className="cc102-sheet-scroll">
          <table className="cc102-sheet">
            <thead>
              <tr>
                <th rowSpan={2}>Bestellung / Einzelkarte</th>
                <th colSpan={2}>Kaufpreis</th>
                <th>min. Verkaufswert</th>
                <th>Verkaufspreis</th>
              </tr>
              <tr>
                <th>WON</th>
                <th>EUR</th>
                <th>EUR</th>
                <th>EUR</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <RevenueGroupRows
                  key={group.key}
                  group={group}
                  fx={fx}
                  onSave={saveValue}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function RevenueGroupRows({
  group,
  fx,
  onSave,
}: {
  group: RevenueGroup
  fx: FxSnapshot | null
  onSave: (
    card: RevenueCard,
    field: 'minSalePriceKrw' | 'salePriceKrw',
    valueKrw: number | null,
  ) => Promise<void>
}) {
  const minKrw = group.cards.reduce((sum, card) => sum + (card.minSalePriceKrw ?? 0), 0)
  const saleKrw = group.cards.reduce((sum, card) => sum + (card.salePriceKrw ?? 0), 0)

  return (
    <>
      <tr className="cc102-order-row">
        <td>
          <strong>{group.label}</strong>
          {group.subtitle ? <small title={group.subtitle}>{group.subtitle}</small> : null}
        </td>
        <td>{formatKrw(group.purchaseCostKrw)}</td>
        <td>{formatEur(eurFromKrw(group.purchaseCostKrw, fx))}</td>
        <td>{formatEur(eurFromKrw(minKrw, fx))}</td>
        <td>{formatEur(eurFromKrw(saleKrw, fx))}</td>
      </tr>
      {group.cards.map((card) => (
        <tr className="cc102-card-row" key={card.inventoryUnitId}>
          <td>
            <span className="cc102-card-name">{card.name}</span>
            {card.subtitle ? <small>{card.subtitle}</small> : null}
          </td>
          <td className="cc102-muted-cell">–</td>
          <td className="cc102-muted-cell">–</td>
          <EditableMoneyCell
            key={`min-eur-${card.inventoryUnitId}-${card.minSalePriceKrw ?? 'empty'}`}
            card={card}
            field="minSalePriceKrw"
            currency="EUR"
            fx={fx}
            onSave={onSave}
          />
          <EditableMoneyCell
            key={`sale-eur-${card.inventoryUnitId}-${card.salePriceKrw ?? 'empty'}`}
            card={card}
            field="salePriceKrw"
            currency="EUR"
            fx={fx}
            onSave={onSave}
          />
        </tr>
      ))}
    </>
  )
}

function EditableMoneyCell({
  card,
  field,
  currency,
  fx,
  onSave,
}: {
  card: RevenueCard
  field: 'minSalePriceKrw' | 'salePriceKrw'
  currency: 'KRW' | 'EUR'
  fx: FxSnapshot | null
  onSave: (
    card: RevenueCard,
    field: 'minSalePriceKrw' | 'salePriceKrw',
    valueKrw: number | null,
  ) => Promise<void>
}) {
  const canonical = field === 'minSalePriceKrw' ? card.minSalePriceKrw : card.salePriceKrw
  const shown = currency === 'KRW' ? canonical : eurFromKrw(canonical, fx)
  const disabled = currency === 'EUR' && !fx

  async function commit(target: HTMLInputElement) {
    if (disabled) return
    const parsed = parseMoneyInput(target.value)
    const canonicalKrw = currency === 'KRW'
      ? parsed
      : parsed === null
        ? null
        : krwFromEur(parsed, fx)
    if (canonicalKrw === null && target.value.trim()) {
      target.value = inputValue(shown, currency)
      return
    }
    const rounded = canonicalKrw === null ? null : Math.round(canonicalKrw)
    if (rounded === canonical) {
      target.value = inputValue(shown, currency)
      return
    }
    await onSave(card, field, rounded)
  }

  return (
    <td className="cc102-edit-cell">
      <input
        aria-label={`${field === 'minSalePriceKrw' ? 'Mindestverkaufswert' : 'Verkaufspreis'} ${currency}`}
        defaultValue={inputValue(shown, currency)}
        inputMode="decimal"
        disabled={disabled}
        placeholder="–"
        onBlur={(event) => void commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = inputValue(shown, currency)
            event.currentTarget.blur()
          }
        }}
      />
    </td>
  )
}
