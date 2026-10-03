import Link from 'next/link'
import type { Metadata } from 'next'
import { BunjangOrderImporter } from '@/components/bunjang-order-importer'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Bunjang Bestellungen synchronisieren' }
export const dynamic = 'force-dynamic'

export default async function BunjangOrderImportPage() {
  await requireUser()

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href="/purchases">← Einkäufe</Link>
        <span>Bunjang Bestell-Sync</span>
      </div>

      <header className="page-header compact">
        <div>
          <span className="eyebrow">Order-basierter Extractor</span>
          <h1>Bunjang-Bestellungen synchronisieren</h1>
          <p>
            Kaufübersicht scannen, Bestelldetails automatisch laden und Trackingnummern
            anschließend mit OLAEET abgleichen.
          </p>
        </div>
      </header>

      <BunjangOrderImporter />
    </div>
  )
}
