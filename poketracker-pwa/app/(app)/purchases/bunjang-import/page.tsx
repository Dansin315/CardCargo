import Link from 'next/link'
import type { Metadata } from 'next'
import { BunjangOrderImporter } from '@/components/bunjang-order-importer'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Bunjang Einkäufe importieren' }
export const dynamic = 'force-dynamic'

export default async function BunjangOrderImportPage() {
  await requireUser()

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href="/purchases">← Einkäufe</Link>
        <span>Bunjang Einkäufe importieren</span>
      </div>

      <header className="page-header compact">
        <div>
          <span className="eyebrow">Bunjang Import</span>
          <h1>Bunjang Einkäufe importieren</h1>
          <p>
            Order-Daten und Bunjang-Listings in einem Ablauf übernehmen, bestehende
            Einkäufe abgleichen und exakte Tracking-Treffer mit OLAEET zuordnen.
          </p>
        </div>
      </header>

      <BunjangOrderImporter />
    </div>
  )
}
