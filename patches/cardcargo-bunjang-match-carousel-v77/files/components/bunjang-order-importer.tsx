'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import {
  parseBunjangOrderImport,
  type BunjangOrderRecord,
} from '@/lib/bunjang-order-import'
import { BUNJANG_ORDER_CACHE_KEY } from '@/lib/bunjang-order-match'

type ViewMode = 'all' | 'matches'

type PurchaseSuggestion = {
  id: string
  title: string
  sellerName: string | null
  priceAmount: number | null
  priceCurrency: string
  domesticShippingAmount: number | null
  purchasedAt: string | null
  domesticCarrier: string | null
  domesticTrackingNumber: string | null
  status: string
  sourceListingId: string | null
  listingUrl: string
  bunjangOrderId: string | null
  images: Array<{
    id: string
    url: string
    category: string | null
    kind: string
  }>
}

type MatchSuggestion = {
  purchase: PurchaseSuggestion
  score: number
  confidence: 'exact' | 'strong' | 'likely' | 'possible'
  reasons: string[]
}

type SuggestionsResponse = {
  error?: string
  existingOrderIds?: string[]
  suggestions?: Array<{
    orderId: string
    matches: MatchSuggestion[]
  }>
}

type SyncOrderResult = {
  orderId: string
  title: string | null
  action: string
  purchaseId: string | null
  matchMethod: string | null
  trackingNumber: string | null
  olaeetExternalId: string | null
  message: string
}

type SyncResult = {
  error?: string
  summary?: {
    total: number
    updated: number
    created: number
    skipped: number
    conflicts: number
    olaeetMatches: number
  }
  orders?: SyncOrderResult[]
}

function money(
  value: number | null,
  currency = 'KRW',
) {
  if (value === null) return '–'

  return `${new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 0,
  }).format(value)} ${currency}`
}

function confidenceLabel(
  confidence: MatchSuggestion['confidence'],
) {
  switch (confidence) {
    case 'exact':
      return 'Sehr starker Match'
    case 'strong':
      return 'Starker Match'
    case 'likely':
      return 'Wahrscheinlicher Match'
    default:
      return 'Möglicher Match'
  }
}

const imageBoxStyle = {
  height: 280,
  borderRadius: 16,
  border: '1px solid var(--border, #e1e5ea)',
  overflow: 'hidden',
  background: 'var(--surface-muted, #f7f8fa)',
  display: 'grid',
  placeItems: 'center',
} as const

function ImageGallery({
  urls,
  title,
}: {
  urls: string[]
  title: string
}) {
  if (!urls.length) {
    return (
      <div style={imageBoxStyle}>
        <span style={{ opacity: 0.6 }}>
          Keine Bilder vorhanden
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        ...imageBoxStyle,
        gridTemplateColumns:
          urls.length > 1 ? '2fr 1fr' : '1fr',
      }}
    >
      <img
        src={urls[0]}
        alt={title}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 0,
          objectFit: 'contain',
        }}
      />

      {urls.length > 1 ? (
        <div
          style={{
            height: '100%',
            display: 'grid',
            gridTemplateRows: '1fr 1fr',
            minHeight: 0,
          }}
        >
          {urls.slice(1, 3).map((url, index) => (
            <img
              key={`${url}-${index}`}
              src={url}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                minHeight: 0,
                objectFit: 'cover',
                borderLeft:
                  '1px solid var(--border, #e1e5ea)',
                borderTop:
                  index === 1
                    ? '1px solid var(--border, #e1e5ea)'
                    : undefined,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function DataRows({
  rows,
}: {
  rows: Array<[string, string | null]>
}) {
  return (
    <div
      style={{
        display: 'grid',
        borderTop: '1px solid var(--border, #e1e5ea)',
      }}
    >
      {rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            display: 'grid',
            gridTemplateColumns: '140px minmax(0, 1fr)',
            gap: 12,
            padding: '10px 0',
            borderBottom:
              '1px solid var(--border, #e1e5ea)',
          }}
        >
          <span style={{ opacity: 0.66 }}>
            {label}
          </span>
          <strong
            style={{
              textAlign: 'right',
              overflowWrap: 'anywhere',
            }}
          >
            {value || '–'}
          </strong>
        </div>
      ))}
    </div>
  )
}

function ExtractedComparisonCard({
  record,
}: {
  record: BunjangOrderRecord
}) {
  const title =
    record.title || `Bunjang Bestellung #${record.orderId}`

  return (
    <article
      style={{
        border: '1px solid var(--border, #dfe4ea)',
        borderRadius: 18,
        overflow: 'hidden',
        background: 'var(--surface, white)',
        boxShadow: '0 8px 24px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ padding: 16 }}>
        <ImageGallery
          urls={record.imageUrls.slice(0, 3)}
          title={title}
        />
      </div>

      <div style={{ padding: '0 18px 18px' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            opacity: 0.65,
            marginBottom: 6,
          }}
        >
          Extraktion · Order #{record.orderId}
        </div>
        <h3 style={{ margin: '0 0 16px' }}>{title}</h3>

        <DataRows
          rows={[
            ['Verkäufer', record.sellerName],
            ['Warenwert', money(record.productAmount)],
            [
              'Versand',
              money(record.domesticShippingAmount),
            ],
            ['Gesamt', money(record.totalAmount)],
            ['Kaufdatum', record.purchasedAt],
            ['Carrier', record.domesticCarrier],
            [
              'Tracking',
              record.domesticTrackingNumber,
            ],
            ['Bunjang-Status', record.bunjangStatus],
          ]}
        />
      </div>
    </article>
  )
}

function SavedPurchaseComparisonCard({
  match,
}: {
  match: MatchSuggestion
}) {
  const purchase = match.purchase

  return (
    <article
      style={{
        border: '1px solid var(--border, #dfe4ea)',
        borderRadius: 18,
        overflow: 'hidden',
        background: 'var(--surface, white)',
        boxShadow: '0 8px 24px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ padding: 16 }}>
        <ImageGallery
          urls={purchase.images.map((image) => image.url).slice(0, 3)}
          title={purchase.title}
        />
      </div>

      <div style={{ padding: '0 18px 18px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              opacity: 0.65,
            }}
          >
            Gespeicherter Einkauf
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 8px',
              borderRadius: 999,
              background: 'var(--surface-muted, #f2f5f8)',
            }}
          >
            {confidenceLabel(match.confidence)} · {match.score}
          </span>
        </div>

        <h3 style={{ margin: '0 0 8px' }}>
          {purchase.title}
        </h3>

        <div
          style={{
            fontSize: 13,
            opacity: 0.7,
            marginBottom: 14,
          }}
        >
          {match.reasons.join(' · ')}
        </div>

        <DataRows
          rows={[
            ['Verkäufer', purchase.sellerName],
            [
              'Preis',
              money(
                purchase.priceAmount,
                purchase.priceCurrency,
              ),
            ],
            [
              'Versand',
              money(
                purchase.domesticShippingAmount,
                purchase.priceCurrency,
              ),
            ],
            ['Kaufdatum', purchase.purchasedAt],
            ['Status', purchase.status],
            ['Carrier', purchase.domesticCarrier],
            [
              'Tracking',
              purchase.domesticTrackingNumber,
            ],
            [
              'Listing-ID',
              purchase.sourceListingId,
            ],
          ]}
        />

        <div style={{ marginTop: 14 }}>
          <Link
            className="button button-ghost"
            href={`/purchases/${purchase.id}`}
            target="_blank"
          >
            Einkauf im Detail öffnen ↗
          </Link>
        </div>
      </div>
    </article>
  )
}

function CompactOrderCard({
  record,
  matchCount,
  onOpenMatches,
}: {
  record: BunjangOrderRecord
  matchCount: number
  onOpenMatches: () => void
}) {
  return (
    <article
      style={{
        display: 'grid',
        gridTemplateColumns: '112px minmax(0, 1fr) auto',
        gap: 16,
        alignItems: 'center',
        border: '1px solid var(--border, #ddd)',
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--surface-muted, #f5f5f5)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {record.imageUrls[0] ? (
          <img
            src={record.imageUrls[0]}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <span style={{ opacity: 0.55 }}>Kein Bild</span>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <strong>
          {record.title ||
            `Bunjang Bestellung #${record.orderId}`}
        </strong>
        <div style={{ marginTop: 6, opacity: 0.75 }}>
          #{record.orderId} · {record.purchasedAt || 'Datum –'} ·{' '}
          {money(record.productAmount)}
        </div>
        <div style={{ marginTop: 4, opacity: 0.75 }}>
          {record.sellerName || 'Verkäufer –'} · Tracking{' '}
          {record.domesticTrackingNumber || '–'}
        </div>
      </div>

      {matchCount ? (
        <button
          type="button"
          className="button button-secondary"
          onClick={onOpenMatches}
        >
          Matches ansehen ({matchCount})
        </button>
      ) : (
        <span style={{ opacity: 0.55 }}>
          Kein Match
        </span>
      )}
    </article>
  )
}

export function BunjangOrderImporter() {
  const [rawText, setRawText] = useState('')
  const [createMissing, setCreateMissing] = useState(false)
  const [autoAssignOlaeet, setAutoAssignOlaeet] =
    useState(true)
  const [manualOnly, setManualOnly] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadingReview, setLoadingReview] = useState(false)
  const [reviewLoaded, setReviewLoaded] = useState(true)
  const [savingMatch, setSavingMatch] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [suggestions, setSuggestions] = useState<
    Record<string, MatchSuggestion[]>
  >({})
  const [alreadyStoredOrderIds, setAlreadyStoredOrderIds] =
    useState<Set<string>>(() => new Set())
  const [resolvedOrderIds, setResolvedOrderIds] = useState<
    Set<string>
  >(() => new Set())
  const [matchOrderIndex, setMatchOrderIndex] = useState(0)
  const [candidateIndices, setCandidateIndices] = useState<
    Record<string, number>
  >({})
  const reviewTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const reviewSequence = useRef(0)

  const parsed = useMemo(
    () => parseBunjangOrderImport(rawText),
    [rawText],
  )

  const activeRecords = useMemo(
    () =>
      parsed.records.filter(
        (record) =>
          !alreadyStoredOrderIds.has(record.orderId) &&
          !resolvedOrderIds.has(record.orderId),
      ),
    [
      parsed.records,
      alreadyStoredOrderIds,
      resolvedOrderIds,
    ],
  )

  const matchRecords = useMemo(
    () =>
      activeRecords.filter(
        (record) =>
          (suggestions[record.orderId]?.length ?? 0) > 0,
      ),
    [activeRecords, suggestions],
  )

  const currentMatchRecord =
    matchRecords.length > 0
      ? matchRecords[
          Math.min(matchOrderIndex, matchRecords.length - 1)
        ]
      : null

  const currentMatches = currentMatchRecord
    ? suggestions[currentMatchRecord.orderId] ?? []
    : []

  const currentCandidateIndex = currentMatchRecord
    ? Math.min(
        candidateIndices[currentMatchRecord.orderId] ?? 0,
        Math.max(0, currentMatches.length - 1),
      )
    : 0

  const currentMatch = currentMatches[currentCandidateIndex] ?? null

  function rememberExtraction(text: string) {
    const parsedText = parseBunjangOrderImport(text)

    if (parsedText.records.length) {
      localStorage.setItem(BUNJANG_ORDER_CACHE_KEY, text)
    }
  }

  async function loadReview(
    records: BunjangOrderRecord[],
    sequence: number,
  ) {
    if (!records.length) {
      setSuggestions({})
      setAlreadyStoredOrderIds(new Set())
      setReviewLoaded(true)
      return
    }

    setLoadingReview(true)
    setMessage(null)

    try {
      const response = await fetch(
        '/api/purchases/bunjang-order-match-suggestions',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ records }),
        },
      )

      const data =
        (await response.json()) as SuggestionsResponse

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Abgleich mit gespeicherten Einkäufen fehlgeschlagen.',
        )
      }

      if (sequence !== reviewSequence.current) return

      const next: Record<string, MatchSuggestion[]> = {}

      for (const entry of data.suggestions ?? []) {
        next[entry.orderId] = entry.matches
      }

      setSuggestions(next)
      setAlreadyStoredOrderIds(
        new Set(data.existingOrderIds ?? []),
      )
      setMatchOrderIndex(0)
      setCandidateIndices({})
      setReviewLoaded(true)
    } catch (error) {
      if (sequence !== reviewSequence.current) return

      setReviewLoaded(false)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Abgleich mit gespeicherten Einkäufen fehlgeschlagen.',
      )
    } finally {
      if (sequence === reviewSequence.current) {
        setLoadingReview(false)
      }
    }
  }

  function scheduleReview(text: string) {
    if (reviewTimer.current) {
      clearTimeout(reviewTimer.current)
    }

    const parsedText = parseBunjangOrderImport(text)
    const sequence = reviewSequence.current + 1
    reviewSequence.current = sequence

    if (!parsedText.records.length) {
      setSuggestions({})
      setAlreadyStoredOrderIds(new Set())
      setResolvedOrderIds(new Set())
      setReviewLoaded(true)
      return
    }

    setReviewLoaded(false)

    reviewTimer.current = setTimeout(() => {
      void loadReview(parsedText.records, sequence)
    }, 350)
  }

  function changeRawText(text: string) {
    setRawText(text)
    setResult(null)
    setResolvedOrderIds(new Set())
    setViewMode('all')
    rememberExtraction(text)
    scheduleReview(text)
  }

  async function clipboard() {
    setMessage(null)

    try {
      const text = await navigator.clipboard.readText()
      changeRawText(text)

      if (!text.trim()) {
        setMessage('Zwischenablage ist leer.')
      }
    } catch {
      setMessage(
        'Zwischenablage konnte nicht gelesen werden. JSON mit Strg+V einfügen.',
      )
    }
  }

  async function refreshReview(openMatches = false) {
    const sequence = reviewSequence.current + 1
    reviewSequence.current = sequence
    setReviewLoaded(false)
    await loadReview(parsed.records, sequence)

    if (openMatches) {
      setViewMode('matches')
    }
  }

  function openMatchesFor(orderId?: string) {
    if (orderId) {
      const index = matchRecords.findIndex(
        (record) => record.orderId === orderId,
      )
      setMatchOrderIndex(index >= 0 ? index : 0)
    } else {
      setMatchOrderIndex((current) =>
        Math.min(current, Math.max(0, matchRecords.length - 1)),
      )
    }

    setViewMode('matches')
  }

  function moveMatchOrder(direction: -1 | 1) {
    if (matchRecords.length <= 1) return

    setMatchOrderIndex((current) => {
      const safe = Math.min(current, matchRecords.length - 1)
      return (
        (safe + direction + matchRecords.length) %
        matchRecords.length
      )
    })
  }

  function moveCandidate(direction: -1 | 1) {
    if (!currentMatchRecord || currentMatches.length <= 1) return

    setCandidateIndices((current) => {
      const currentIndex = Math.min(
        current[currentMatchRecord.orderId] ?? 0,
        currentMatches.length - 1,
      )

      return {
        ...current,
        [currentMatchRecord.orderId]:
          (currentIndex + direction + currentMatches.length) %
          currentMatches.length,
      }
    })
  }

  async function enrichMatch(
    record: BunjangOrderRecord,
    purchaseId: string,
  ) {
    const response = await fetch(
      `/api/purchases/${purchaseId}/bunjang-order-enrichment`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          record,
          autoAssignOlaeet,
        }),
      },
    )

    const data = (await response.json()) as {
      error?: string
      purchase?: {
        id: string
        title: string
        domestic_tracking_number: string | null
      }
      olaeetMatch?: {
        externalPackageId: string | null
      } | null
    }

    if (!response.ok || !data.purchase) {
      throw new Error(
        data.error ||
          'Der ausgewählte Einkauf konnte nicht ergänzt werden.',
      )
    }

    return data
  }

  async function saveCurrentMatch() {
    if (!currentMatchRecord || !currentMatch) return

    setSavingMatch(true)
    setMessage(null)

    try {
      const currentIndex = matchRecords.findIndex(
        (record) => record.orderId === currentMatchRecord.orderId,
      )

      await enrichMatch(
        currentMatchRecord,
        currentMatch.purchase.id,
      )

      setResolvedOrderIds((current) => {
        const next = new Set(current)
        next.add(currentMatchRecord.orderId)
        return next
      })

      setSuggestions((current) => {
        const next = { ...current }
        delete next[currentMatchRecord.orderId]
        return next
      })

      setCandidateIndices((current) => {
        const next = { ...current }
        delete next[currentMatchRecord.orderId]
        return next
      })

      const remaining = Math.max(0, matchRecords.length - 1)
      setMatchOrderIndex(
        remaining
          ? Math.min(Math.max(0, currentIndex), remaining - 1)
          : 0,
      )

      setMessage(
        `Match für Order #${currentMatchRecord.orderId} gespeichert. Die Bestellung wurde aus der Synchronisation entfernt.`,
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Match konnte nicht gespeichert werden.',
      )
    } finally {
      setSavingMatch(false)
    }
  }

  async function sync() {
    if (!activeRecords.length) return

    rememberExtraction(rawText)
    setSubmitting(true)
    setMessage(null)
    setResult(null)

    try {
      // Important: exact Bunjang order IDs that already exist in CardCargo and
      // matches confirmed in the carousel are excluded before this request.
      const response = await fetch(
        '/api/purchases/bunjang-order-sync',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            records: activeRecords,
            createMissing,
            autoAssignOlaeet,
            manualOnly,
          }),
        },
      )

      const data = (await response.json()) as SyncResult

      if (!response.ok) {
        throw new Error(
          data.error || 'Synchronisierung fehlgeschlagen.',
        )
      }

      setResult(data)

      const handled = new Set(
        (data.orders ?? [])
          .filter(
            (order) =>
              order.action === 'updated' ||
              order.action === 'created',
          )
          .map((order) => order.orderId),
      )

      if (handled.size) {
        setResolvedOrderIds((current) => {
          const next = new Set(current)
          for (const orderId of handled) next.add(orderId)
          return next
        })
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Synchronisierung fehlgeschlagen.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>1. Extraction einlesen</h2>
            <p>
              CardCargo prüft die Bunjang Purchase-/Order-ID direkt gegen
              bereits gespeicherte Einkäufe. Exakte IDs werden nicht erneut
              gelistet oder synchronisiert.
            </p>
          </div>
        </div>

        <button
          className="button button-secondary"
          type="button"
          onClick={clipboard}
        >
          Aus Zwischenablage einlesen
        </button>

        <label style={{ marginTop: 14, display: 'block' }}>
          Extractor-JSON
          <textarea
            rows={8}
            value={rawText}
            onChange={(event) => changeRawText(event.target.value)}
            placeholder="Bunjang-Order-Extractor-Daten hier einfügen …"
          />
        </label>

        {loadingReview ? (
          <div className="alert alert-info">
            Gleiche Purchase-/Order-IDs und mögliche Matches werden geprüft …
          </div>
        ) : null}

        {message ? (
          <div className="alert alert-info">{message}</div>
        ) : null}

        {parsed.warnings.length ? (
          <div className="alert alert-warning">
            {parsed.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div
          className="panel-heading"
          style={{ alignItems: 'center', gap: 16 }}
        >
          <div>
            <h2>2. Bunjang Synchronisierung</h2>
            <p>
              {activeRecords.length} offen · {matchRecords.length}{' '}
              mit möglichen Matches · {alreadyStoredOrderIds.size}{' '}
              bereits über Bunjang-ID gespeichert · {resolvedOrderIds.size}{' '}
              in diesem Lauf erledigt
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              className={
                viewMode === 'all'
                  ? 'button button-primary'
                  : 'button button-secondary'
              }
              onClick={() => setViewMode('all')}
            >
              Gesamtansicht
            </button>

            <button
              type="button"
              className={
                viewMode === 'matches'
                  ? 'button button-primary'
                  : 'button button-secondary'
              }
              disabled={loadingReview || !parsed.records.length}
              onClick={() => {
                if (!reviewLoaded) {
                  void refreshReview(true)
                } else {
                  openMatchesFor()
                }
              }}
            >
              {loadingReview
                ? 'Suche Matches …'
                : `Matchansicht (${matchRecords.length})`}
            </button>

            <button
              type="button"
              className="button button-ghost"
              disabled={loadingReview || !parsed.records.length}
              onClick={() => void refreshReview(viewMode === 'matches')}
            >
              Abgleich aktualisieren
            </button>
          </div>
        </div>

        {!parsed.records.length ? (
          <div className="alert alert-info">
            Zuerst Extractor-Daten einlesen.
          </div>
        ) : !reviewLoaded ? (
          <div className="alert alert-info">
            Die Ansicht wird erst nach dem Abgleich mit den gespeicherten
            Einkäufen freigegeben, damit bereits vorhandene Bunjang-IDs nicht
            versehentlich erneut angezeigt werden.
          </div>
        ) : viewMode === 'all' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {activeRecords.length ? (
              activeRecords.map((record) => (
                <CompactOrderCard
                  key={record.orderId}
                  record={record}
                  matchCount={
                    suggestions[record.orderId]?.length ?? 0
                  }
                  onOpenMatches={() =>
                    openMatchesFor(record.orderId)
                  }
                />
              ))
            ) : (
              <div className="alert alert-success">
                Keine offenen Bunjang-Bestellungen mehr in diesem Batch.
              </div>
            )}
          </div>
        ) : (
          <div>
            {currentMatchRecord && currentMatch ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <strong>
                    Match {matchOrderIndex + 1} von {matchRecords.length}
                  </strong>
                  <div style={{ opacity: 0.7, marginTop: 3 }}>
                    Links: Extraktion · Rechts: bestehender CardCargo-Einkauf
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '48px minmax(0, 1fr) 54px minmax(0, 1fr) 48px',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={matchRecords.length <= 1}
                    onClick={() => moveMatchOrder(-1)}
                    aria-label="Vorheriges erkanntes Match"
                    style={{
                      width: 44,
                      height: 44,
                      padding: 0,
                      borderRadius: 999,
                      fontSize: 24,
                    }}
                  >
                    ‹
                  </button>

                  <ExtractedComparisonCard record={currentMatchRecord} />

                  <div
                    aria-hidden="true"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 999,
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px solid var(--border, #dfe4ea)',
                      fontSize: 24,
                      background: 'var(--surface, white)',
                    }}
                  >
                    →
                  </div>

                  <SavedPurchaseComparisonCard match={currentMatch} />

                  <button
                    type="button"
                    className="button button-primary"
                    disabled={matchRecords.length <= 1}
                    onClick={() => moveMatchOrder(1)}
                    aria-label="Nächstes erkanntes Match"
                    title="Nächstes erkanntes Match"
                    style={{
                      width: 44,
                      height: 44,
                      padding: 0,
                      borderRadius: 999,
                      fontSize: 24,
                    }}
                  >
                    ›
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    display: 'grid',
                    gridTemplateColumns:
                      '48px minmax(0, 1fr) 54px minmax(0, 1fr) 48px',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <div />
                  <div />
                  <div />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      border: '1px solid var(--border, #dfe4ea)',
                      borderRadius: 14,
                      padding: 10,
                    }}
                  >
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={currentMatches.length <= 1}
                      onClick={() => moveCandidate(-1)}
                      aria-label="Vorheriger möglicher Match"
                    >
                      ←
                    </button>

                    <span style={{ textAlign: 'center' }}>
                      Kandidat {currentCandidateIndex + 1} von{' '}
                      {currentMatches.length}
                    </span>

                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={currentMatches.length <= 1}
                      onClick={() => moveCandidate(1)}
                      aria-label="Nächster möglicher Match"
                    >
                      →
                    </button>
                  </div>
                  <div />
                </div>

                <div
                  style={{
                    marginTop: 16,
                    border: '1px solid var(--border, #dfe4ea)',
                    borderRadius: 16,
                    padding: 14,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong>
                      Order #{currentMatchRecord.orderId} mit diesem Einkauf
                      verknüpfen?
                    </strong>
                    <div style={{ opacity: 0.7, marginTop: 3 }}>
                      Beim Speichern werden die Order-Transaktionsdaten in den
                      bestehenden Einkauf übernommen. Danach verschwindet diese
                      Order aus diesem Sync-Batch.
                    </div>
                  </div>

                  <button
                    type="button"
                    className="button button-primary"
                    disabled={savingMatch}
                    onClick={saveCurrentMatch}
                  >
                    {savingMatch ? 'Speichere …' : 'Match speichern'}
                  </button>
                </div>
              </>
            ) : (
              <div className="alert alert-info">
                Für die noch offenen Bestellungen gibt es aktuell keine
                Match-Vorschläge. Du kannst zur Gesamtansicht zurückkehren oder
                den Abgleich aktualisieren.
              </div>
            )}
          </div>
        )}
      </section>

      {viewMode === 'all' && reviewLoaded ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>3. Übrige Bestellungen synchronisieren</h2>
              <p>
                Diese Aktion verarbeitet nur die aktuell noch sichtbaren,
                offenen Orders. Bereits gespeicherte Bunjang-IDs und bestätigte
                Match-Paare werden nicht erneut gesendet.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <label
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <input
                type="checkbox"
                checked={manualOnly}
                onChange={(event) =>
                  setManualOnly(event.target.checked)
                }
              />
              <span>
                <strong>
                  Nicht bestätigte Matches nicht automatisch zuordnen
                </strong>
                <br />
                <small>
                  Empfohlen. Match-Vorschläge dienen der manuellen Ergänzung
                  bestehender Einkäufe.
                </small>
              </span>
            </label>

            <label
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(event) =>
                  setCreateMissing(event.target.checked)
                }
              />
              Fehlende Einkäufe automatisch anlegen
            </label>

            <label
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <input
                type="checkbox"
                checked={autoAssignOlaeet}
                onChange={(event) =>
                  setAutoAssignOlaeet(event.target.checked)
                }
              />
              Exakte Tracking-Treffer automatisch OLAEET zuordnen
            </label>
          </div>

          <button
            className="button button-primary"
            type="button"
            disabled={submitting || !activeRecords.length}
            onClick={sync}
          >
            {submitting
              ? 'Synchronisiere …'
              : `Offene Bestellungen synchronisieren (${activeRecords.length})`}
          </button>
        </section>
      ) : null}

      {result?.summary ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Ergebnis</h2>
              <p>
                {result.summary.updated} aktualisiert ·{' '}
                {result.summary.created} neu ·{' '}
                {result.summary.skipped} übersprungen ·{' '}
                {result.summary.conflicts} Konflikte ·{' '}
                {result.summary.olaeetMatches} OLAEET-Matches
              </p>
            </div>

            <Link
              href="/purchases"
              className="button button-secondary"
            >
              Einkäufe öffnen
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}
