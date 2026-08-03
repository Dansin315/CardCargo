//export const metadata = { title: 'Offline' }
import Link from 'next/link'

export default function OfflinePage() {
  return (
    <main>
      <h1>Du bist offline</h1>
      <p>Diese Seite ist momentan nicht verfügbar.</p>
      <Link href="/">Zur Startseite</Link>
    </main>
  )
}