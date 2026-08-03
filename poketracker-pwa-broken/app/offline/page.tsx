export const metadata = { title: 'Offline' }

export default function OfflinePage() {
  return (
    <main className="centered-page">
      <section className="auth-card">
        <span className="brand-mark large" aria-hidden="true">
          CC
        </span>
        <h1>Keine Verbindung</h1>
        <p>Die App ist gerade offline. Bereits geöffnete Daten werden aus Sicherheitsgründen nicht dauerhaft zwischengespeichert.</p>
        <a className="button button-primary" href="/">
          Erneut versuchen
        </a>
      </section>
    </main>
  )
}
