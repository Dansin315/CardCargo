'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

type Payload = {
  found?: boolean
  error?: string
  extraction?: Record<string, unknown> | null
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
  return `${new Intl.NumberFormat('de-DE').format(amount)} ${text(currency) === '-' ? 'KRW' : text(currency)}`
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

  return (
    <div className="cc96-header-summary" aria-label="OLAEET Sendungszusammenfassung">
      <div className="cc96-summary-stat">
        <span>Internationale Sendungsnummer</span>
        <strong>{text(extraction?.external_shipment_id)}</strong>
      </div>
      <div className="cc96-summary-stat cc96-summary-stat-accent">
        <span>Sendungskosten</span>
        <strong>{money(extraction?.total_payment, extraction?.currency)}</strong>
      </div>
    </div>
  )
}
