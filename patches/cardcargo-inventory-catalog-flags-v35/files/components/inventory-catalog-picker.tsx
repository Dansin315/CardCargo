'use client'

import { useState, type FormEvent } from 'react'
import type { CardCatalogCandidate } from '@/lib/card-catalog-types'
import { catalogItemLanguage } from '@/lib/inventory-language-flags'

type CatalogResponse = {
  candidates?: CardCatalogCandidate[]
  warnings?: string[]
  error?: string
}

type Props = {
  initialName: string
  initialCardNumber: string
  initialSetCode: string
  language: string
  onSelect: (candidate: CardCatalogCandidate) => void
}

export function InventoryCatalogPicker({
  initialName,
  initialCardNumber,
  initialSetCode,
  language,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initialName)
  const [cardNumber, setCardNumber] = useState(initialCardNumber)
  const [setCode, setSetCode] = useState(initialSetCode)
  const [results, setResults] = useState<CardCatalogCandidate[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setWarnings([])
    try {
      const params = new URLSearchParams()
      if (name.trim()) params.set('name', name.trim())
      if (cardNumber.trim()) params.set('cardNumber', cardNumber.trim())
      if (setCode.trim()) params.set('setCode', setCode.trim())
      params.set('itemLanguage', catalogItemLanguage(language))
      const response = await fetch(`/api/inventory/catalog-search?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      const payload = (await response.json()) as CatalogResponse
      if (!response.ok) throw new Error(payload.error || 'Kartenkatalog konnte nicht durchsucht werden.')
      setResults(payload.candidates ?? [])
      setWarnings(payload.warnings ?? [])
    } catch (caught) {
      setResults([])
      setError(caught instanceof Error ? caught.message : 'Kartenkatalog konnte nicht durchsucht werden.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      style={{
        border: '1px solid rgba(87, 66, 43, .18)',
        borderRadius: 16,
        padding: 14,
        background: 'rgba(255, 250, 241, .7)',
      }}
    >
      <button
        type="button"
        className="inv-button inv-button-muted"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {open ? 'Kartenkatalog schließen' : 'Kartenkatalog verwenden'}
      </button>

      {open ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: '0 0 12px', opacity: 0.72 }}>
            Suche nach Kartenname, Nummer und/oder Setcode. Die physische Sprache bleibt beim Übernehmen unverändert.
          </p>
          <form onSubmit={search}>
            <div className="inv-editor-grid">
              <label>
                <span>Kartenname</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="z. B. Mew ex" />
              </label>
              <label>
                <span>Kartennummer</span>
                <input value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} placeholder="z. B. 151/165" />
              </label>
              <label>
                <span>Setcode</span>
                <input value={setCode} onChange={(event) => setSetCode(event.target.value)} placeholder="z. B. SV2a" />
              </label>
              <label>
                <span>Katalogsprache</span>
                <input value={catalogItemLanguage(language)} readOnly />
              </label>
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="inv-button inv-button-primary" type="submit" disabled={loading}>
                {loading ? 'Katalog wird durchsucht …' : 'Katalog durchsuchen'}
              </button>
            </div>
          </form>

          {error ? <div className="inv-alert inv-editor-error" style={{ marginTop: 12 }}>{error}</div> : null}
          {warnings.length ? <div className="inv-alert" style={{ marginTop: 12 }}>{warnings.join(' · ')}</div> : null}

          {results.length ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 12,
                marginTop: 14,
              }}
            >
              {results.map((candidate) => (
                <article
                  key={`${candidate.provider}:${candidate.catalogLanguage}:${candidate.providerCardId}`}
                  style={{
                    border: '1px solid rgba(87, 66, 43, .16)',
                    borderRadius: 14,
                    padding: 12,
                    background: '#fffdf8',
                  }}
                >
                  {candidate.imageUrl ? (
                    <div
                      role="img"
                      aria-label={candidate.name}
                      style={{
                        height: 210,
                        borderRadius: 10,
                        backgroundImage: `url(${candidate.imageUrl})`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        backgroundSize: 'contain',
                        marginBottom: 10,
                      }}
                    />
                  ) : null}
                  <strong style={{ display: 'block' }}>{candidate.name}</strong>
                  <small style={{ display: 'block', marginTop: 3 }}>
                    {[candidate.setName, candidate.setCode, candidate.numberDisplay || candidate.number]
                      .filter(Boolean)
                      .join(' · ') || 'Set nicht angegeben'}
                  </small>
                  {candidate.englishName ? (
                    <small style={{ display: 'block', marginTop: 3 }}>English: {candidate.englishName}</small>
                  ) : null}
                  {candidate.pokemonNameEn ? (
                    <small style={{ display: 'block', marginTop: 3 }}>Pokémon: {candidate.pokemonNameEn}</small>
                  ) : null}
                  <small style={{ display: 'block', marginTop: 3 }}>
                    {candidate.provider.toUpperCase()} · {candidate.catalogLanguage.toUpperCase()}
                    {candidate.rarity ? ` · ${candidate.rarity}` : ''}
                  </small>
                  <button
                    className="inv-button inv-button-muted"
                    type="button"
                    style={{ marginTop: 10, width: '100%' }}
                    onClick={() => onSelect(candidate)}
                  >
                    Treffer übernehmen
                  </button>
                </article>
              ))}
            </div>
          ) : !loading && !error ? (
            <p style={{ margin: '12px 0 0', opacity: 0.65 }}>Noch keine Katalogtreffer geladen.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
