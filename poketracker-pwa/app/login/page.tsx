import type { Metadata } from 'next'
import { login } from '@/app/login/actions'

export const metadata: Metadata = { title: 'Anmelden' }

const errorMessages: Record<string, string> = {
  missing_fields: 'Bitte E-Mail-Adresse und Passwort eingeben.',
  invalid_credentials: 'E-Mail-Adresse oder Passwort ist falsch.',
  not_allowed: 'Dieses Konto ist für die Single-User-App nicht freigeschaltet.',
  not_owner: 'Das Konto existiert, ist aber noch nicht in app_owners eingetragen. Führe supabase/seed.sql aus.',
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
      <section className="auth-card">
        <span className="brand-mark large" aria-hidden="true">
          CC
        </span>
        <span className="eyebrow">Single-User-PWA</span>
        <h1>CardCargo</h1>
        <p>Einkäufe und Angebotsbilder sicher protokollieren.</p>

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
          <button className="button button-primary button-wide" type="submit">
            Anmelden
          </button>
        </form>

        <small className="muted">Registrierungen sind absichtlich deaktiviert. Das Konto wird einmalig in Supabase angelegt.</small>
      </section>
    </main>
  )
}
