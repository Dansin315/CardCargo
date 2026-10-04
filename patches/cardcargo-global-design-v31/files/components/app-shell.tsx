import Link from 'next/link'
import type { ReactNode } from 'react'
import { logout } from '@/app/login/actions'
import { AppNavigation } from '@/components/app-navigation'

function LeafMark() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.75c-5.1 0-8.25 4.35-8.25 9.08 0 3.03 1.5 5.7 3.92 7.23L12 21.25l4.33-2.19c2.42-1.53 3.92-4.2 3.92-7.23 0-4.73-3.15-9.08-8.25-9.08Z"
        fill="currentColor"
        fillOpacity=".17"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="M12 3v18M7.5 8.1c1.6 1.05 3.1 2.1 4.5 4.1"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AppShell({ children, email }: { children: ReactNode; email: string }) {
  return (
    <div className="app-shell app-shell-v31">
      <header className="app-topbar">
        <div className="app-topbar-main">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              <LeafMark />
            </span>
            <span className="brand-copy">
              <small>Sammlung & Logistik</small>
              <strong>CardCargo</strong>
            </span>
          </Link>

          <AppNavigation />
        </div>

        <div className="app-topbar-user">
          <div className="app-user-copy">
            <span className="eyebrow">Angemeldet als</span>
            <span className="user-email">{email}</span>
          </div>
          <form action={logout}>
            <button className="button button-secondary button-small" type="submit">
              Abmelden
            </button>
          </form>
        </div>
      </header>

      <main className="main-content">
        <div className="app-content-frame">{children}</div>
      </main>
    </div>
  )
}
