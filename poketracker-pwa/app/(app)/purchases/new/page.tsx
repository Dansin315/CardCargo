import type { Metadata } from 'next'
import { PurchaseImportForm } from '@/components/purchase-import-form'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Einkauf importieren' }

export default async function NewPurchasePage() {
  const { user } = await requireUser()

  return (
    <div className="page-stack">
      <header className="page-header compact">
        <div>
          <span className="eyebrow">Version 1 · Kernfunktion</span>
          <h1>Bunjang-Einkauf importieren</h1>
          <p>URL einfügen, Daten prüfen und Angebotsbilder dauerhaft privat archivieren.</p>
        </div>
      </header>
      <PurchaseImportForm userId={user.id} />
    </div>
  )
}
