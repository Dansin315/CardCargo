import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import {
  catalogMatchLabels,
  catalogProviderLabels,
  type PurchaseItemRow,
} from '@/lib/purchase-items'

const itemSelect = 'id, purchase_id, warehouse_package_id, item_name, franchise, set_name, set_code, pokemon_name_en, card_number, language, rarity, variant, quantity, grading_company, grade, seller_condition, allocated_unit_cost, notes, catalog_provider, catalog_card_id, catalog_language, catalog_match_type, catalog_image_url, catalog_snapshot, created_at, updated_at'

export async function PurchaseItemsSummary({ purchaseId }: { purchaseId: string }) {
  const { supabase } = await requireUser()

  const [{ data: purchase }, { data: link }] = await Promise.all([
    supabase
      .from('purchases')
      .select('id, title, price_currency')
      .eq('id', purchaseId)
      .single(),
    supabase
      .from('warehouse_package_purchases')
      .select('warehouse_package_id')
      .eq('purchase_id', purchaseId)
      .maybeSingle(),
  ])

  const ownItemsResult = await supabase
    .from('purchase_items')
    .select(itemSelect)
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: true })

  if (ownItemsResult.error) throw new Error(ownItemsResult.error.message)

  const ownItems = ((ownItemsResult.data ?? []) as unknown as PurchaseItemRow[]).map(
    (item) => ({
      ...item,
      source_scope: 'purchase' as const,
      source_purchase_id: purchaseId,
      source_purchase_title: purchase?.title ?? 'Bunjang-Einkauf',
      source_package_id: link?.warehouse_package_id ?? null,
      source_package_label: null,
    }),
  )

  let packageItems: PurchaseItemRow[] = []
  let packageLabel: string | null = null

  if (link?.warehouse_package_id) {
    const [packageResult, packageItemsResult] = await Promise.all([
      supabase
        .from('warehouse_packages')
        .select('id, external_package_id, domestic_tracking_number')
        .eq('id', link.warehouse_package_id)
        .maybeSingle(),
      supabase
        .from('purchase_items')
        .select(itemSelect)
        .eq('warehouse_package_id', link.warehouse_package_id)
        .order('created_at', { ascending: true }),
    ])

    if (packageResult.error) throw new Error(packageResult.error.message)
    if (packageItemsResult.error) throw new Error(packageItemsResult.error.message)

    packageLabel =
      packageResult.data?.external_package_id ||
      packageResult.data?.domestic_tracking_number ||
      'OLAEET-Paket'

    packageItems = ((packageItemsResult.data ?? []) as unknown as PurchaseItemRow[]).map(
      (item) => ({
        ...item,
        source_scope: 'warehouse_package' as const,
        source_purchase_id: null,
        source_purchase_title: null,
        source_package_id: link.warehouse_package_id,
        source_package_label: packageLabel,
      }),
    )
  }

  const items = [...ownItems, ...packageItems].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  )

  const itemIds = items.map((item) => item.id)
  const { data: units } = itemIds.length
    ? await supabase
        .from('inventory_units')
        .select('purchase_item_id, quantity')
        .in('purchase_item_id', itemIds)
    : { data: [] as Array<{ purchase_item_id: string | null; quantity: number }> }

  const counts = new Map<string, number>()
  for (const unit of units ?? []) {
    if (!unit.purchase_item_id) continue
    counts.set(
      unit.purchase_item_id,
      (counts.get(unit.purchase_item_id) ?? 0) + Number(unit.quantity || 1),
    )
  }

  return (
    <section className="panel" id="purchase-items">
      <div className="panel-heading">
        <div>
          <h2>Einzelkarten / Purchase Items</h2>
          <p>
            Karten dieses Einkaufs und paketweite Bonuskarten des verknüpften OLAEET-Pakets werden gemeinsam angezeigt.
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
                    <img
                      src={item.catalog_image_url}
                      alt={`Katalogreferenz ${item.item_name}`}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>Keine Referenz</span>
                  )}
                </div>
                <div className="purchase-item-summary-main">
                  <strong>{item.item_name}</strong>
                  <span>
                    {[item.set_name, item.set_code, item.card_number, item.language]
                      .filter(Boolean)
                      .join(' · ') || 'Kartendaten noch unvollständig'}
                  </span>
                  <small>
                    {item.source_scope === 'warehouse_package'
                      ? `OLAEET-Bonus · ${item.source_package_label || 'Paket'}`
                      : 'Bunjang-Einkauf'}
                  </small>
                  {item.pokemon_name_en && item.pokemon_name_en !== item.item_name ? (
                    <small>Pokémon: {item.pokemon_name_en}</small>
                  ) : null}
                  {item.catalog_provider && item.catalog_match_type ? (
                    <small>
                      {catalogProviderLabels[item.catalog_provider]} ·{' '}
                      {catalogMatchLabels[item.catalog_match_type]}
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
          <p>Noch keine Einzelkarten oder Bonuskarten erfasst.</p>
          <Link className="button button-primary" href={`/purchases/${purchaseId}/edit#purchase-items`}>
            Erste Einzelkarte hinzufügen
          </Link>
        </div>
      )}
    </section>
  )
}
