import Link from 'next/link'
import { formatDate, formatMoney } from '@/lib/format'
import type { PurchaseWithThumbnail } from '@/lib/purchases'
import { StatusBadge } from '@/components/status-badge'

export function PurchaseList({ purchases }: { purchases: PurchaseWithThumbnail[] }) {
  if (!purchases.length) {
    return (
      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">
          +
        </span>
        <h3>Noch keine Einkäufe</h3>
        <p>Importiere dein erstes Bunjang-Angebot inklusive Angebotsbildern.</p>
        <Link className="button button-primary" href="/purchases/new">
          Einkauf importieren
        </Link>
      </div>
    )
  }

  return (
    <div className="purchase-list">
      {purchases.map((purchase) => (
        <Link className="purchase-row" href={`/purchases/${purchase.id}`} key={purchase.id}>
          <div className="purchase-thumb">
            {purchase.thumbnailUrl ? (
              <img src={purchase.thumbnailUrl} alt="" />
            ) : (
              <span aria-hidden="true">CC</span>
            )}
          </div>
          <div className="purchase-main">
            <strong>{purchase.title}</strong>
            <span>
              {purchase.seller_name || 'Verkäufer nicht erfasst'} · {formatDate(purchase.purchased_at || purchase.created_at)}
            </span>
          </div>
          <StatusBadge status={purchase.status} />
          <strong className="purchase-price">{formatMoney(purchase.price_amount, purchase.price_currency)}</strong>
          <span className="row-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      ))}
    </div>
  )
}
