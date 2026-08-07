'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  allocationRowTotal,
  allocationTotals,
  calculateShipmentCostAllocations,
  purchaseAllocationBasis,
  shipmentCostAllocationMethodLabels,
  shipmentCostAllocationMethods,
  type AllocationMethods,
  type AllocationPackage,
  type AllocationPurchase,
  type AllocationShipment,
  type ShipmentCostAllocationMethod,
  type ShipmentPurchaseAllocation,
} from '@/lib/shipment-cost-allocation'

function money(value: number | null | undefined, currency: string) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function allocationsByPurchase(rows: ShipmentPurchaseAllocation[]) {
  return new Map(rows.map((row) => [row.purchase_id, row]))
}

export function ShipmentCostAllocationForm({
  shipment,
  packages,
  purchases,
  initialMethods,
  initialAllocations,
}: {
  shipment: AllocationShipment
  packages: AllocationPackage[]
  purchases: AllocationPurchase[]
  initialMethods: AllocationMethods
  initialAllocations: ShipmentPurchaseAllocation[]
}) {
  const router = useRouter()
  const [methods, setMethods] = useState<AllocationMethods>(initialMethods)
  const [allocations, setAllocations] = useState<ShipmentPurchaseAllocation[]>(
    initialAllocations.length
      ? initialAllocations
      : purchases.map((purchase) => ({
          purchase_id: purchase.id,
          warehouse_package_id: purchase.warehouse_package_id,
          international_shipping_amount: 0,
          forwarding_fee_amount: 0,
          import_tax_amount: 0,
        })),
  )
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const packageById = useMemo(
    () => new Map(packages.map((warehousePackage) => [warehousePackage.id, warehousePackage])),
    [packages],
  )
  const rowByPurchase = useMemo(() => allocationsByPurchase(allocations), [allocations])
  const totals = useMemo(() => allocationTotals(allocations), [allocations])

  function setMethod(component: keyof AllocationMethods, value: ShipmentCostAllocationMethod) {
    setMethods((current) => ({ ...current, [component]: value }))
    setNotice(null)
  }

  function calculateSuggestions() {
    setError(null)
    setNotice(null)
    try {
      const result = calculateShipmentCostAllocations({
        shipment,
        packages,
        purchases,
        methods,
        manualAllocations: allocations,
      })
      setAllocations(result.allocations)
      setNotice('Verteilungsvorschlag neu berechnet. Prüfe die Beträge vor dem Speichern.')
    } catch (calculationError) {
      setError(
        calculationError instanceof Error
          ? calculationError.message
          : 'Die Kosten konnten nicht verteilt werden.',
      )
    }
  }

  function updateAmount(
    purchaseId: string,
    field:
      | 'international_shipping_amount'
      | 'forwarding_fee_amount'
      | 'import_tax_amount',
    rawValue: string,
  ) {
    const parsed = Number(rawValue)
    const value = Number.isFinite(parsed) && parsed >= 0 ? roundMoney(parsed) : 0
    setAllocations((current) =>
      current.map((row) =>
        row.purchase_id === purchaseId ? { ...row, [field]: value } : row,
      ),
    )
    setMethods((current) => ({
      ...current,
      ...(field === 'international_shipping_amount' ? { shipping: 'manual' as const } : {}),
      ...(field === 'forwarding_fee_amount' ? { forwarding: 'manual' as const } : {}),
      ...(field === 'import_tax_amount' ? { importTax: 'manual' as const } : {}),
    }))
    setNotice('Manuelle Änderung erkannt; die betroffene Kostenart wurde auf „Manuell“ gestellt.')
  }

  async function save() {
    setError(null)
    setNotice(null)
    setSaving(true)
    try {
      const response = await fetch(`/api/shipments/${shipment.id}/allocation`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shippingMethod: methods.shipping,
          forwardingMethod: methods.forwarding,
          importMethod: methods.importTax,
          allocations: allocations.map((row) => ({
            purchaseId: row.purchase_id,
            warehousePackageId: row.warehouse_package_id,
            internationalShippingAmount: row.international_shipping_amount,
            forwardingFeeAmount: row.forwarding_fee_amount,
            importTaxAmount: row.import_tax_amount,
          })),
        }),
      })

      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Speichern fehlgeschlagen.')
      router.push(`/shipments/${shipment.id}?allocation=1`)
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  const packageLabels = new Map(
    packages.map((warehousePackage) => [
      warehousePackage.id,
      warehousePackage.external_package_id ||
        warehousePackage.domestic_tracking_number ||
        'OLAEET-Paket',
    ]),
  )

  const sourceTotals = {
    shipping: Number(shipment.international_shipping_amount || 0),
    forwarding: Number(shipment.forwarding_fee_amount || 0),
    importTax: Number(shipment.import_tax_amount || 0),
  }

  const packageSummaries = packages.map((warehousePackage) => {
    const packageRows = allocations.filter(
      (row) => row.warehouse_package_id === warehousePackage.id,
    )
    const packageTotals = allocationTotals(packageRows)
    return {
      warehousePackage,
      purchaseCount: packageRows.length,
      ...packageTotals,
      total: roundMoney(
        packageTotals.shipping + packageTotals.forwarding + packageTotals.importTax,
      ),
    }
  })

  return (
    <div className="page-stack">
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Verteilungsmethoden</h2>
            <p>Jeder Kostenblock kann unabhängig verteilt werden.</p>
          </div>
          <span className="panel-note">{shipment.currency}</span>
        </div>

        <div className="allocation-method-grid">
          <label>
            Internationaler Versand
            <select
              value={methods.shipping}
              onChange={(event) => setMethod('shipping', event.target.value as ShipmentCostAllocationMethod)}
            >
              {shipmentCostAllocationMethods.map((method) => (
                <option key={method} value={method}>
                  {shipmentCostAllocationMethodLabels[method]}
                </option>
              ))}
            </select>
            <small>Quelle: {money(sourceTotals.shipping, shipment.currency)}</small>
          </label>

          <label>
            OLAEET-Servicegebühren
            <select
              value={methods.forwarding}
              onChange={(event) => setMethod('forwarding', event.target.value as ShipmentCostAllocationMethod)}
            >
              {shipmentCostAllocationMethods.map((method) => (
                <option key={method} value={method}>
                  {shipmentCostAllocationMethodLabels[method]}
                </option>
              ))}
            </select>
            <small>Quelle: {money(sourceTotals.forwarding, shipment.currency)}</small>
          </label>

          <label>
            Zoll und Einfuhr
            <select
              value={methods.importTax}
              onChange={(event) => setMethod('importTax', event.target.value as ShipmentCostAllocationMethod)}
            >
              {shipmentCostAllocationMethods.map((method) => (
                <option key={method} value={method}>
                  {shipmentCostAllocationMethodLabels[method]}
                </option>
              ))}
            </select>
            <small>Quelle: {money(sourceTotals.importTax, shipment.currency)}</small>
          </label>
        </div>

        <div className="detail-actions allocation-actions">
          <button className="button button-secondary" type="button" onClick={calculateSuggestions}>
            Vorschlag neu berechnen
          </button>
          <button className="button button-primary" type="button" onClick={save} disabled={saving}>
            {saving ? 'Speichere…' : 'Allokation speichern'}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Zwischensumme je OLAEET-Paket</h2>
            <p>Diese Paketwerte werden aus den darunter gespeicherten Einkaufsallokationen summiert.</p>
          </div>
          <span className="panel-note">{packages.length} Pakete</span>
        </div>
        <div className="allocation-package-grid">
          {packageSummaries.map((summary) => (
            <article className="allocation-package-card" key={summary.warehousePackage.id}>
              <strong>
                {summary.warehousePackage.external_package_id ||
                  summary.warehousePackage.domestic_tracking_number ||
                  'OLAEET-Paket'}
              </strong>
              <small>
                {summary.warehousePackage.weight_grams
                  ? `${Number(summary.warehousePackage.weight_grams).toLocaleString('de-DE')} g`
                  : 'Gewicht fehlt'}
                {' · '}
                {summary.purchaseCount} Einkauf{summary.purchaseCount === 1 ? '' : 'e'}
              </small>
              <dl>
                <div><dt>Versand</dt><dd>{money(summary.shipping, shipment.currency)}</dd></div>
                <div><dt>Service</dt><dd>{money(summary.forwarding, shipment.currency)}</dd></div>
                <div><dt>Zoll / Einfuhr</dt><dd>{money(summary.importTax, shipment.currency)}</dd></div>
                <div><dt>Gesamt</dt><dd><strong>{money(summary.total, shipment.currency)}</strong></dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Allokation je Einkauf</h2>
            <p>Die automatisch berechneten Werte können vor dem Speichern manuell angepasst werden.</p>
          </div>
          <span className="panel-note">{purchases.length} Einkäufe</span>
        </div>

        <div className="allocation-table-wrap">
          <table className="allocation-table">
            <thead>
              <tr>
                <th>Einkauf</th>
                <th>OLAEET-Paket</th>
                <th>Basiswert</th>
                <th>Versand</th>
                <th>Service</th>
                <th>Zoll / Einfuhr</th>
                <th>Allokiert gesamt</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => {
                const row = rowByPurchase.get(purchase.id)
                const warehousePackage = packageById.get(purchase.warehouse_package_id)
                if (!row) return null
                return (
                  <tr key={purchase.id}>
                    <td>
                      <strong>{purchase.title}</strong>
                      <small>{purchase.price_currency}</small>
                    </td>
                    <td>
                      <strong>{packageLabels.get(purchase.warehouse_package_id)}</strong>
                      <small>
                        {warehousePackage?.weight_grams
                          ? `${Number(warehousePackage.weight_grams).toLocaleString('de-DE')} g`
                          : 'Gewicht fehlt'}
                      </small>
                    </td>
                    <td>
                      {money(purchaseAllocationBasis(purchase), purchase.price_currency)}
                      <small>Preis + Inland + Kaufgebühr</small>
                    </td>
                    <td>
                      <input
                        aria-label={`Versand für ${purchase.title}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.international_shipping_amount}
                        onChange={(event) =>
                          updateAmount(purchase.id, 'international_shipping_amount', event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Service für ${purchase.title}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.forwarding_fee_amount}
                        onChange={(event) =>
                          updateAmount(purchase.id, 'forwarding_fee_amount', event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Import für ${purchase.title}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.import_tax_amount}
                        onChange={(event) =>
                          updateAmount(purchase.id, 'import_tax_amount', event.target.value)
                        }
                      />
                    </td>
                    <td><strong>{money(allocationRowTotal(row), shipment.currency)}</strong></td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>Allokierte Summe</th>
                <th>{money(totals.shipping, shipment.currency)}</th>
                <th>{money(totals.forwarding, shipment.currency)}</th>
                <th>{money(totals.importTax, shipment.currency)}</th>
                <th>
                  {money(totals.shipping + totals.forwarding + totals.importTax, shipment.currency)}
                </th>
              </tr>
              <tr>
                <th colSpan={3}>Soll laut Sendung</th>
                <th>{money(sourceTotals.shipping, shipment.currency)}</th>
                <th>{money(sourceTotals.forwarding, shipment.currency)}</th>
                <th>{money(sourceTotals.importTax, shipment.currency)}</th>
                <th>
                  {money(sourceTotals.shipping + sourceTotals.forwarding + sourceTotals.importTax, shipment.currency)}
                </th>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="allocation-footnote">
          Hinweis: Die Kostenallokation übernimmt keine Wechselkursumrechnung. Der Einkaufs-Basiswert wird nur als relative Verteilungsbasis verwendet. Die zugeteilten Sendungskosten bleiben in {shipment.currency}.
        </p>
      </section>
    </div>
  )
}
