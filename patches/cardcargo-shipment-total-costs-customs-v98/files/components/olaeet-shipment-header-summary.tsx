'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

type CustomsCost = {
  amount: number | null
  currency: string
}

type CostSummary = {
  bunjang: { total: number }
  olaeet: { totalPayment: number; currency: string }
  customs: CustomsCost
  totals: {
    primaryCurrency: string
    preCustomsTotal: number | null
    totalWithCustoms: number | null
    customsPending: boolean
    customsSameCurrency: boolean
  }
}

type Payload = {
  found?: boolean
  error?: string
  extraction?: Record<string, unknown> | null
  costSummary?: CostSummary
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

function money(value: unknown, currency: unknown) {
  const amount = numberValue(value)
  if (amount === null) return '-'
  const code = text(currency) === '-' ? 'KRW' : text(currency)
  return `${new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: code === 'KRW' ? 0 : 2,
    maximumFractionDigits: code === 'KRW' ? 0 : 2,
  }).format(amount)} ${code}`
}

function finalLabel(costs: CostSummary) {
  const pre = costs.totals.preCustomsTotal
  if (pre === null) return 'Mehrere Währungen'
  if (costs.customs.amount === null) return `${money(pre, costs.totals.primaryCurrency)} + Zoll`
  if (costs.customs.currency === costs.totals.primaryCurrency) {
    return money(pre + costs.customs.amount, costs.totals.primaryCurrency)
  }
  return `${money(pre, costs.totals.primaryCurrency)} + ${money(costs.customs.amount, costs.customs.currency)}`
}

export function OlaeetShipmentHeaderSummary() {
  const pathname = usePathname()
  const shipmentRef = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean)
    const index = parts.lastIndexOf('shipments')
    if (index < 0 || !parts[index + 1]) return null
    return decodeURIComponent(parts[index + 1])
  }, [pathname])

  if (!shipmentRef || shipmentRef === 'new' || shipmentRef === 'olaeet') {
    return null
  }

  return <OlaeetShipmentHeaderSummaryLoader key={shipmentRef} shipmentRef={shipmentRef} />
}

function OlaeetShipmentHeaderSummaryLoader({ shipmentRef }: { shipmentRef: string }) {
  const [data, setData] = useState<Payload | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/shipments/olaeet-details?shipmentRef=${encodeURIComponent(shipmentRef)}`)
      .then(async (response) => {
        const json = (await response.json()) as Payload
        if (!response.ok) throw new Error(json.error || 'OLAEET-Daten konnten nicht geladen werden.')
        return json
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })

    return () => {
      cancelled = true
    }
  }, [shipmentRef])

  const extraction = data?.found && data.extraction ? data.extraction : null
  const costs = data?.costSummary ?? null

  return (
    <div className="cc96-header-summary cc98-header-summary" aria-label="OLAEET Sendungszusammenfassung">
      <div className="cc96-summary-stat">
        <span>Internationale Sendungsnummer</span>
        <strong>{text(extraction?.external_shipment_id)}</strong>
      </div>
      <div className="cc96-summary-stat">
        <span>Bunjang + OLAEET vor Zoll</span>
        <strong>
          {costs?.totals.preCustomsTotal === null || costs?.totals.preCustomsTotal === undefined
            ? '-'
            : money(costs.totals.preCustomsTotal, costs.totals.primaryCurrency)}
        </strong>
      </div>
      <div className="cc96-summary-stat">
        <span>Zoll / Einfuhr</span>
        <strong>
          {costs?.customs.amount === null || costs?.customs.amount === undefined
            ? 'Noch offen'
            : money(costs.customs.amount, costs.customs.currency)}
        </strong>
      </div>
      <div className="cc96-summary-stat cc96-summary-stat-accent">
        <span>Gesamtkosten</span>
        <strong>{costs ? finalLabel(costs) : money(extraction?.total_payment, extraction?.currency)}</strong>
      </div>
    </div>
  )
}
