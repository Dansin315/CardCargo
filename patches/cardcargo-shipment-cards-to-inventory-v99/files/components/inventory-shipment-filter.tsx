'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Source = {
  inventoryUnitId: string
  shipmentId: string
  externalShipmentId: string
  note: string
}

type ShipmentOption = {
  externalShipmentId: string
  shipmentId: string
  count: number
}

type Payload = {
  error?: string
  sources?: Source[]
  shipments?: ShipmentOption[]
}

function inventoryIdFromNode(node: Element) {
  const links = [...node.querySelectorAll<HTMLAnchorElement>('a[href]')]
  for (const link of links) {
    const match = link.getAttribute('href')?.match(/^\/inventory\/([0-9a-f-]{20,})(?:\/|$)/i)
    if (match) return match[1]
  }
  return null
}

function ensureBadge(node: HTMLElement, labels: string[]) {
  let holder = node.querySelector<HTMLElement>(':scope > .cc99-inventory-shipment-tags')
  if (!labels.length) {
    holder?.remove()
    return
  }

  const currentLabels = holder
    ? [...holder.querySelectorAll<HTMLElement>('.cc99-inventory-shipment-tag')].map((entry) =>
        String(entry.textContent || '').trim(),
      )
    : []

  if (holder && currentLabels.length === labels.length && currentLabels.every((entry, index) => entry === labels[index])) {
    return
  }

  if (!holder) {
    holder = document.createElement('div')
    holder.className = 'cc99-inventory-shipment-tags'
    node.appendChild(holder)
  }
  holder.replaceChildren(
    ...labels.map((label) => {
      const span = document.createElement('span')
      span.className = 'cc99-inventory-shipment-tag'
      span.textContent = label
      span.title = `Importiert aus ${label}`
      return span
    }),
  )
}

export function InventoryShipmentFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selected = String(searchParams.get('shipment') || '').trim()
  const [payload, setPayload] = useState<Payload | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/inventory/shipment-sources')
      .then(async (response) => {
        const json = (await response.json()) as Payload
        if (!response.ok) throw new Error(json.error || 'Sendungsfilter konnte nicht geladen werden.')
        return json
      })
      .then((json) => {
        if (!cancelled) setPayload(json)
      })
      .catch((error) => {
        if (!cancelled) setPayload({ error: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sourceMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const source of payload?.sources ?? []) {
      if (!source.inventoryUnitId || !source.externalShipmentId) continue
      const current = map.get(source.inventoryUnitId) ?? []
      if (!current.includes(source.externalShipmentId)) current.push(source.externalShipmentId)
      map.set(source.inventoryUnitId, current)
    }
    return map
  }, [payload])

  useEffect(() => {
    if (!payload || payload.error) return

    let scheduled = false
    const apply = () => {
      scheduled = false
      const root = document.querySelector<HTMLElement>('[data-cc-anydb="inventory"]')
      if (!root) return

      const nodes = [
        ...root.querySelectorAll<HTMLElement>('[data-cc-record-card="true"]'),
        ...root.querySelectorAll<HTMLElement>('table[data-cc-table="inventory"] tbody tr'),
      ]

      for (const node of nodes) {
        const inventoryId = inventoryIdFromNode(node)
        if (!inventoryId) continue
        const labels = sourceMap.get(inventoryId) ?? []
        const visible = !selected || labels.includes(selected)
        node.style.display = visible ? '' : 'none'
        const badgeTarget = node.tagName === 'TR'
          ? node.querySelector<HTMLElement>('td')
          : node
        if (badgeTarget) ensureBadge(badgeTarget, labels)
      }
    }

    const schedule = () => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(apply)
    }

    schedule()
    const observer = new MutationObserver(schedule)
    const root = document.querySelector('[data-cc-anydb="inventory"]')
    if (root) observer.observe(root, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [payload, selected, sourceMap])

  function changeShipment(value: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set('shipment', value)
    else next.delete('shipment')
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  if (!payload || payload.error || !(payload.shipments?.length)) return null

  return (
    <div className="cc99-shipment-filter">
      <label htmlFor="cc99-shipment-filter-select">Internationale Sendung</label>
      <select
        id="cc99-shipment-filter-select"
        value={selected}
        onChange={(event) => changeShipment(event.target.value)}
      >
        <option value="">Alle Sendungen</option>
        {payload.shipments.map((shipment) => (
          <option key={shipment.externalShipmentId} value={shipment.externalShipmentId}>
            {shipment.externalShipmentId} · {shipment.count} Karte{shipment.count === 1 ? '' : 'n'}
          </option>
        ))}
      </select>
      {selected ? (
        <button className="button button-ghost button-small" type="button" onClick={() => changeShipment('')}>
          Filter entfernen
        </button>
      ) : null}
    </div>
  )
}
