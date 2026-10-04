import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { formatDate, formatMoney } from '@/lib/format'

export const metadata: Metadata = { title: 'Inventar' }
export const dynamic = 'force-dynamic'

const inventoryStatusLabels: Record<string, string> = {
  expected: 'Erwartet',
  in_warehouse: 'Bei OLAEET',
  in_transit: 'Unterwegs',
  in_collection: 'Im Inventar',
  listed_for_sale: 'Zum Verkauf',
  sold: 'Verkauft',
  lost: 'Verloren',
  returned: 'Zurückgegeben',
}

export default async function InventoryPage() {
  const { supabase } = await requireUser()
  const [{ data: unitData, error: unitError }, { data: itemData, error: itemError }] = await Promise.all([
    supabase
      .from('inventory_units')
      .select('id, purchase_item_id, item_name, quantity, condition, grading_company, grade, storage_location, allocated_total_cost, cost_currency, status, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('purchase_items')
      .select('id, purchase_id, item_name, set_name, card_number, language, quantity, catalog_image_url, purchases(id, title, status)')
      .order('created_at', { ascending: false }),
  ])

  const units = unitData ?? []
  const items = itemData ?? []
  const createdCounts = new Map<string, number>()
  for (const unit of units) {
    if (!unit.purchase_item_id) continue
    createdCounts.set(unit.purchase_item_id, (createdCounts.get(unit.purchase_item_id) ?? 0) + Number(unit.quantity || 1))
  }
  const pending = items
    .map((item) => ({ ...item, remaining: Math.max(0, Number(item.quantity) - (createdCounts.get(item.id) ?? 0)) }))
    .filter((item) => item.remaining > 0)

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Inventory v1</span>
          <h1>Inventar</h1>
          <p>Physische Exemplare aus optional erfassten Purchase Items. Die Übernahme ins Inventar erfolgt bewusst manuell.</p>
        </div>
      </header>

      {unitError || itemError ? (
        <div className="alert alert-error">Inventardaten konnten nicht vollständig geladen werden. Wurde Migration 0011 ausgeführt?</div>
      ) : null}

      <div className="inventory-kpi-grid">
        <div className="panel"><span>Physische Inventareinträge</span><strong>{units.length}</strong></div>
        <div className="panel"><span>Noch nicht übernommene Exemplare</span><strong>{pending.reduce((sum, item) => sum + item.remaining, 0)}</strong></div>
        <div className="panel"><span>Purchase Items</span><strong>{items.length}</strong></div>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Im Inventar</h2>
            <p>Jeder erzeugte Eintrag entspricht einem physischen Exemplar.</p>
          </div>
        </div>
        {units.length ? (
          <div className="inventory-unit-list">
            {units.map((unit) => (
              <article className="inventory-unit-row" key={unit.id}>
                <div>
                  <strong>{unit.item_name}</strong>
                  <span>{unit.grading_company && unit.grade ? `${unit.grading_company} ${unit.grade}` : unit.condition || 'Zustand noch nicht erfasst'}</span>
                </div>
                <div><strong>{inventoryStatusLabels[unit.status] ?? unit.status}</strong><span>{unit.storage_location || 'Lagerort noch offen'}</span></div>
                <div><strong>{formatMoney(unit.allocated_total_cost, unit.cost_currency)}</strong><span>aktuell gespeicherte Stückkosten</span></div>
                <div><strong>{formatDate(unit.created_at)}</strong><span>übernommen</span></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty"><p>Noch keine physischen Exemplare ins Inventar übernommen.</p></div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Noch nicht ins Inventar übernommen</h2>
            <p>Diese Karten sind als Purchase Items erfasst, aber noch nicht als physische Inventareinträge angelegt.</p>
          </div>
        </div>
        {pending.length ? (
          <div className="inventory-pending-list">
            {pending.map((item) => {
              const purchase = Array.isArray(item.purchases) ? item.purchases[0] : item.purchases
              return (
                <article className="inventory-pending-row" key={item.id}>
                  <div className="catalog-reference-thumb">
                    {item.catalog_image_url ? <img src={item.catalog_image_url} alt={`Referenz ${item.item_name}`} referrerPolicy="no-referrer" /> : <span>Manuell</span>}
                  </div>
                  <div>
                    <strong>{item.item_name}</strong>
                    <span>{[item.set_name, item.card_number, item.language].filter(Boolean).join(' · ')}</span>
                    <small>{purchase?.title || 'Bunjang-Einkauf'}</small>
                  </div>
                  <div><strong>{item.remaining}×</strong><span>noch offen</span></div>
                  <Link className="button button-secondary button-small" href={`/purchases/${item.purchase_id}/edit#purchase-items`}>Einkauf bearbeiten</Link>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty-state compact-empty"><p>Alle erfassten Purchase Items wurden vollständig übernommen.</p></div>
        )}
      </section>
    </div>
  )
}
