import Link from 'next/link'
import type { Metadata } from 'next'
import { BunjangImporter } from '@/components/bunjang-importer'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Bunjang synchronisieren' }
export const dynamic = 'force-dynamic'

export default async function BunjangImportPage() {
  await requireUser()
  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href="/purchases">← Einkäufe</Link>
        <span>Bunjang Sync</span>
      </div>
      <header className="page-header compact">
        <div>
          <span className="eyebrow">Beschaffung automatisieren</span>
          <h1>Bunjang synchronisieren</h1>
          <p>Koreanische Versanddaten aus deiner eingeloggten Bunjang-Seite übernehmen und über die Trackingnummer automatisch mit OLAEET verbinden.</p>
        </div>
      </header>
      <BunjangImporter />
    </div>
  )
}
