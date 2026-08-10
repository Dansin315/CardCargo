import type { Metadata } from 'next'
import { login } from '@/app/login/actions'

export const metadata: Metadata = { title: 'Anmelden' }

const errorMessages: Record<string, string> = {
  missing_fields: 'Bitte E-Mail-Adresse und Passwort eingeben.',
  invalid_credentials: 'E-Mail-Adresse oder Passwort ist falsch.',
  not_allowed: 'Dieses Konto ist für die Single-User-App nicht freigeschaltet.',
  not_owner:
    'Das Konto existiert, ist aber noch nicht in app_owners eingetragen. Führe supabase/seed.sql aus.',
}

function LeafMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const params = await searchParams
  const message = params.error ? errorMessages[params.error] : null

  return (
    <main className="centered-page login-background">
      <section className="auth-card auth-card-v31">
        <div className="auth-brand-row">
          <span className="brand-mark large" aria-hidden="true">
            <LeafMark />
          </span>
          <div>
            <span className="eyebrow">Private Single-User-PWA</span>
            <h1>CardCargo</h1>
          </div>
        </div>

        <p className="auth-lead">
          Bunjang-Einkäufe, OLAEET-Pakete, internationale Sendungen und dein physisches
          Pokémon-Karten-Inventar an einem Ort.
        </p>

        {message ? <div className="alert alert-error">{message}</div> : null}

        <form action={login} className="stack-form">
          <input type="hidden" name="next" value={params.next || '/'} />
          <label>
            E-Mail-Adresse
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Passwort
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="button button-primary button-wide button-large" type="submit">
            Anmelden
          </button>
        </form>

        <small className="muted auth-footnote">
          Registrierungen sind absichtlich deaktiviert. Nur dein freigeschaltetes Konto kann
          auf CardCargo zugreifen.
        </small>
      </section>
    </main>
  )
}
