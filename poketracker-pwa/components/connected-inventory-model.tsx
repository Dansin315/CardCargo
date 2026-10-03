import Link from 'next/link'

const stages = [
  {
    href: '/purchases',
    label: 'Einkauf',
    meta: 'Beschaffung',
    tone: 'mint',
  },
  {
    href: '/warehouse-packages',
    label: 'OLAEET-Paket',
    meta: 'Eingang & Lager',
    tone: 'blue',
  },
  {
    href: '/shipments',
    label: 'Sendung',
    meta: 'Internationaler Transport',
    tone: 'violet',
  },
  {
    href: '/inventory',
    label: 'Inventareinheit',
    meta: 'Physische Karte',
    tone: 'rose',
  },
] as const

export function ConnectedInventoryModel() {
  return (
    <section className="cc93-object-map" aria-label="Verbundenes CardCargo Inventarmodell">
      <div className="cc93-object-map__intro">
        <span className="cc93-object-map__eyebrow">Verbundenes Inventarmodell</span>
        <strong>Ein Datensatz pro realem Objekt und Bewegung.</strong>
        <p>
          Kartenstamm, physische Einheit, logistischer Ort und Warenbewegung bleiben
          miteinander verknüpft statt dieselben Informationen mehrfach zu pflegen.
        </p>
      </div>

      <div className="cc93-object-map__flow">
        {stages.map((stage, index) => (
          <Link
            className="cc93-object-step"
            data-tone={stage.tone}
            href={stage.href}
            key={stage.href}
          >
            <span className="cc93-object-step__index">{index + 1}</span>
            <span className="cc93-object-step__copy">
              <strong>{stage.label}</strong>
              <small>{stage.meta}</small>
            </span>
            {index < stages.length - 1 ? (
              <span className="cc93-object-step__arrow" aria-hidden="true">→</span>
            ) : null}
          </Link>
        ))}
      </div>

      <div className="cc93-object-map__mapping" aria-label="AnyDB Konzept auf CardCargo übertragen">
        <span><b>Item</b> → Kartenidentität</span>
        <span><b>Location</b> → Logistikstufe / Lagerort</span>
        <span><b>Inventory Item</b> → physische Einzelkarte</span>
        <span><b>Transaction</b> → Einkauf / Empfang / Versand</span>
      </div>
    </section>
  )
}
