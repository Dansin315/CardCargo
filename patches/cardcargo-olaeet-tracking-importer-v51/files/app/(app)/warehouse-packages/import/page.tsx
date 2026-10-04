import Link from 'next/link'
import type { Metadata } from 'next'
import { OlaeetImporter } from '@/components/olaeet-importer'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'OLAEET importieren' }
export const dynamic = 'force-dynamic'

export default async function OlaeetImportPage() {
  await requireUser()

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href="/warehouse-packages">← OLAEET-Pakete</Link>
        <span>Browser-Import</span>
      </div>

      <header className="page-header compact">
        <div>
          <span className="eyebrow">Automatischer Wareneingang</span>
          <h1>OLAEET importieren & Tracking abgleichen</h1>
          <p>
            Paketdaten aus der eingeloggten OLAEET-Seite übernehmen und über die koreanische
            Trackingnummer automatisch mit Bunjang-Einkäufen verbinden.
          </p>
        </div>
      </header>

      <OlaeetImporter />
    </div>
  )
}
