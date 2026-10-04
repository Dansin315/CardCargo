import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { catalogMatchLabels, catalogProviderLabels, type PurchaseItemRow } from '@/lib/purchase-items'

export async function PurchaseItemsSummary({ purchaseId }: { purchaseId: string }) {
  const { supabase } = await requireUser()
  const [{ data: purchase }, { data: itemData }] = await Promise.all([
    supabase.from('purchases').select('id, price_currency').eq('id', purchaseId).single(),
    supabase
      .from('purchase_items')
      .select(
        'id, purchase_id, item_name, franchise, set_name, set_code, pokemon_name_en, card_number, language, rarity, variant, quantity, grading_company, grade, seller_condition, allocated_unit_cost, notes, catalog_provider, catalog_card_id, catalog_language, catalog_match_type, catalog_image_url, catalog_snapshot, created_at, updated_at',
      )
      .eq('purchase_id', purchaseId)
      .order('created_at', { ascending: true }),
  ])

  const items = (itemData ?? []) as unknown as PurchaseItemRow[]
  const itemIds = items.map((item) => item.id)
  const { data: units } = itemIds.length
    ? await supabase.from('inventory_units').select('purchase_item_id, quantity').in('purchase_item_id', itemIds)
    : { data: [] as Array<{ purchase_item_id: string | null; quantity: number }> }
  const counts = new Map<string, number>()
  for (const unit of units ?? []) {
    if (!unit.purchase_item_id) continue
    counts.set(unit.purchase_item_id, (counts.get(unit.purchase_item_id) ?? 0) + Number(unit.quantity || 1))
  }

  return (
    <section className="panel" id="purchase-items">
      <div className="panel-heading">
        <div>
          <h2>Einzelkarten / Purchase Items</h2>
          <p>
            Optional: Ein Einkauf kann zunächst ohne Einzelkarten gespeichert werden. Die Positionen können jederzeit später ergänzt werden.
          </p>
        </div>
        <Link className="button button-secondary" href={`/purchases/${purchaseId}/edit#purchase-items`}>
          Einzelkarten bearbeiten
        </Link>
      </div>

      {items.length ? (
        <div className="purchase-item-summary-list">
          {items.map((item) => {
            const created = counts.get(item.id) ?? 0
            return (
              <article className="purchase-item-summary-row" key={item.id}>
                <div className="catalog-reference-thumb">
                  {item.catalog_image_url ? (
                    <img src={item.catalog_image_url} alt={`Katalogreferenz ${item.item_name}`} referrerPolicy="no-referrer" />
                  ) : (
                    <span>Keine Referenz</span>
                  )}
                </div>
                <div className="purchase-item-summary-main">
                  <strong>{item.item_name}</strong>
                  <span>
                    {[item.set_name, item.set_code, item.card_number, item.language].filter(Boolean).join(' · ') || 'Kartendaten noch unvollständig'}
                  </span>
                  {item.pokemon_name_en && item.pokemon_name_en !== item.item_name ? (
                    <small>Pokémon: {item.pokemon_name_en}</small>
                  ) : null}
                  {item.catalog_provider && item.catalog_match_type ? (
                    <small>
                      {catalogProviderLabels[item.catalog_provider]} · {catalogMatchLabels[item.catalog_match_type]}
                    </small>
                  ) : (
                    <small>Manuell erfasst · kein Katalogtreffer verknüpft</small>
                  )}
                </div>
                <div className="purchase-item-summary-metrics">
                  <strong>{item.quantity}×</strong>
                  <span>{created}/{item.quantity} im Inventar</span>
                </div>
                <div className="purchase-item-summary-cost">
                  <strong>{formatMoney(item.allocated_unit_cost, purchase?.price_currency || 'KRW')}</strong>
                  <span>je Exemplar</span>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <p>Noch keine Einzelkarten erfasst. Das ist für den Einkauf vollständig zulässig.</p>
          <Link className="button button-primary" href={`/purchases/${purchaseId}/edit#purchase-items`}>
            Erste Einzelkarte hinzufügen
          </Link>
        </div>
      )}
    </section>
  )
}
