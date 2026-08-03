import Link from 'next/link'
import type { ReactNode } from 'react'
import { logout } from '@/app/login/actions'

export function AppShell({ children, email }: { children: ReactNode; email: string }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            CC
          </span>
          <span>
            <strong>CardCargo</strong>
            <small>Sammlung & Logistik</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Hauptnavigation">
          <Link href="/">Übersicht</Link>
          <Link href="/purchases">Einkäufe</Link>
          <Link href="/purchases/new">URL importieren</Link>
          <span className="nav-disabled" title="Folgt in einem nächsten Ausbauschritt">
            OLAEET-Pakete
          </span>
          <span className="nav-disabled" title="Folgt in einem nächsten Ausbauschritt">
            Inventar
          </span>
          <span className="nav-disabled" title="Folgt in einem nächsten Ausbauschritt">
            Suchaufträge
          </span>
        </nav>

        <div className="sidebar-footer">
          <span className="eyebrow">Angemeldet als</span>
          <span className="user-email">{email}</span>
          <form action={logout}>
            <button className="button button-ghost button-small" type="submit">
              Abmelden
            </button>
          </form>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  )
}
