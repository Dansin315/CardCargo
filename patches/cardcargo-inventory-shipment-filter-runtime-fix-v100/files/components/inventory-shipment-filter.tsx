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

  if (
    holder &&
    currentLabels.length === labels.length &&
    currentLabels.every((entry, index) => entry === labels[index])
  ) {
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

function isSource(value: unknown): value is Source {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Partial<Source>
  return typeof row.inventoryUnitId === 'string' && typeof row.externalShipmentId === 'string'
}

function isShipmentOption(value: unknown): value is ShipmentOption {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Partial<ShipmentOption>
  return (
    typeof row.externalShipmentId === 'string' &&
    row.externalShipmentId.trim().length > 0 &&
    typeof row.count === 'number' &&
    Number.isFinite(row.count)
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
        if (!response.ok) {
          throw new Error(json.error || 'Sendungsfilter konnte nicht geladen werden.')
        }
        return json
      })
      .then((json) => {
        if (!cancelled) setPayload(json)
      })
      .catch((error) => {
        if (!cancelled) {
          setPayload({
            error: error instanceof Error ? error.message : String(error),
            sources: [],
            shipments: [],
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const sources = useMemo(() => {
    const values: unknown = payload?.sources
    return Array.isArray(values) ? values.filter(isSource) : []
  }, [payload])

  const shipments = useMemo(() => {
    const values: unknown = payload?.shipments
    return Array.isArray(values) ? values.filter(isShipmentOption) : []
  }, [payload])

  const selectedShipment = useMemo(
    () => shipments.find((shipment) => shipment.externalShipmentId === selected) ?? null,
    [selected, shipments],
  )

  const sourceMap = useMemo(() => {
    const map = new Map<string, string[]>()

    for (const source of sources) {
      if (!source.inventoryUnitId || !source.externalShipmentId) continue
      const current = map.get(source.inventoryUnitId) ?? []
      if (!current.includes(source.externalShipmentId)) current.push(source.externalShipmentId)
      map.set(source.inventoryUnitId, current)
    }

    return map
  }, [sources])

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

        const badgeTarget = node.tagName === 'TR' ? node.querySelector<HTMLElement>('td') : node
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

  function changeShipment(value: string, details?: HTMLDetailsElement | null) {
    details?.removeAttribute('open')

    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set('shipment', value)
    else next.delete('shipment')

    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  if (!payload || payload.error || shipments.length === 0) return null

  const summaryText = selectedShipment
    ? `${selectedShipment.externalShipmentId} · ${selectedShipment.count} Karte${selectedShipment.count === 1 ? '' : 'n'}`
    : 'Alle Sendungen'

  return (
    <div className="cc99-shipment-filter">
      <label id="cc100-shipment-filter-label">Internationale Sendung</label>

      <details
        className="cc100-shipment-filter-menu"
        style={{ position: 'relative', minWidth: 280 }}
      >
        <summary
          aria-labelledby="cc100-shipment-filter-label"
          style={{
            minHeight: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '7px 10px',
            border: '1px solid var(--border, #dfe3e0)',
            borderRadius: 8,
            background: 'var(--surface, #fff)',
            cursor: 'pointer',
            listStyle: 'none',
            fontSize: 14,
          }}
        >
          <span>{summaryText}</span>
          <span aria-hidden="true" style={{ color: 'var(--muted, #636b66)' }}>▾</span>
        </summary>

        <div
          role="listbox"
          aria-label="Internationale Sendung"
          style={{
            position: 'absolute',
            zIndex: 30,
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            display: 'grid',
            gap: 2,
            maxHeight: 300,
            overflowY: 'auto',
            padding: 6,
            border: '1px solid var(--border, #dfe3e0)',
            borderRadius: 10,
            background: 'var(--surface, #fff)',
            boxShadow: '0 12px 30px rgba(20, 30, 24, 0.12)',
          }}
        >
          <button
            type="button"
            role="option"
            aria-selected={!selected}
            onClick={(event) => changeShipment('', event.currentTarget.closest('details'))}
            style={{
              width: '100%',
              minHeight: 34,
              padding: '6px 8px',
              border: 0,
              borderRadius: 7,
              background: !selected ? 'var(--surface-subtle, #f3f6f4)' : 'transparent',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            Alle Sendungen
          </button>

          {shipments.map((shipment) => {
            const active = shipment.externalShipmentId === selected
            return (
              <button
                key={shipment.externalShipmentId}
                type="button"
                role="option"
                aria-selected={active}
                onClick={(event) =>
                  changeShipment(shipment.externalShipmentId, event.currentTarget.closest('details'))
                }
                style={{
                  width: '100%',
                  minHeight: 34,
                  padding: '6px 8px',
                  border: 0,
                  borderRadius: 7,
                  background: active ? 'var(--surface-subtle, #f3f6f4)' : 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <strong>{shipment.externalShipmentId}</strong>
                <span style={{ marginLeft: 6, color: 'var(--muted, #636b66)' }}>
                  · {shipment.count} Karte{shipment.count === 1 ? '' : 'n'}
                </span>
              </button>
            )
          })}
        </div>
      </details>

      {selected ? (
        <button
          className="button button-ghost button-small"
          type="button"
          onClick={() => changeShipment('')}
        >
          Filter entfernen
        </button>
      ) : null}
    </div>
  )
}
