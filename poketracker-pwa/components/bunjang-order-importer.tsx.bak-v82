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
  groupedPurchase: boolean
  linkedBunjangOrderIds: string[]
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


type AutoListingResult = {
  status:
    | 'enriched'
    | 'already-complete'
    | 'no-purchase'
    | 'conflict'
  orderId: string
  purchaseId?: string | null
  groupedPurchase?: boolean
  externalId?: string | null
  archivedImageCount?: number
  requestedImageCount?: number
  descriptionImported?: boolean
  warnings?: string[]
  message?: string
  error?: string
}

type ListingSyncSummary = {
  attempted: number
  enriched: number
  alreadyComplete: number
  noUrl: number
  noPurchase: number
  conflicts: number
  failed: number
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
  height: 168,
  borderRadius: 14,
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
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8,
      }}
    >
      {rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            minWidth: 0,
            padding: '8px 10px',
            border:
              '1px solid var(--border, #e1e5ea)',
            borderRadius: 10,
            background:
              'var(--surface-muted, #f7f8fa)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.2,
              opacity: 0.62,
              marginBottom: 3,
            }}
          >
            {label}
          </div>

          <strong
            title={value || '–'}
            style={{
              display: 'block',
              fontSize: 13,
              lineHeight: 1.25,
              minHeight: 16,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {value || '–'}
          </strong>
        </div>
      ))}
    </div>
  )
}

function comparisonCardStyle() {
  return {
    height: '100%',
    minWidth: 0,
    border: '1px solid var(--border, #dfe4ea)',
    borderRadius: 16,
    overflow: 'hidden',
    background: 'var(--surface, white)',
    boxShadow: '0 6px 18px rgba(0,0,0,.035)',
    display: 'grid',
    gridTemplateRows: 'auto auto 1fr',
  } as const
}

function cardTitleStyle() {
  return {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.3,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    minHeight: 42,
  } as const
}

function ExtractedComparisonCard({
  record,
}: {
  record: BunjangOrderRecord
}) {
  const title =
    record.title || `Bunjang Bestellung #${record.orderId}`

  return (
    <article style={comparisonCardStyle()}>
      <div style={{ padding: '10px 12px 8px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 750,
              textTransform: 'uppercase',
              opacity: 0.62,
            }}
          >
            Extraktion
          </span>

          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 7px',
              borderRadius: 999,
              background:
                'var(--surface-muted, #f2f5f8)',
            }}
          >
            #{record.orderId}
          </span>
        </div>

        <ImageGallery
          urls={record.imageUrls.slice(0, 3)}
          title={title}
        />
      </div>

      <div style={{ padding: '0 12px 8px' }}>
        <h3 style={cardTitleStyle()} title={title}>
          {title}
        </h3>
      </div>

      <div
        style={{
          padding: '0 12px 12px',
          alignSelf: 'end',
        }}
      >
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
            ['Status', record.bunjangStatus],
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
    <article style={comparisonCardStyle()}>
      <div style={{ padding: '10px 12px 8px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 750,
              textTransform: 'uppercase',
              opacity: 0.62,
            }}
          >
            Gespeicherter Einkauf
          </span>

          <span
            title={match.reasons.join(' · ')}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 7px',
              borderRadius: 999,
              background:
                'var(--surface-muted, #f2f5f8)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '58%',
            }}
          >
            {purchase.groupedPurchase
              ? 'Gruppen-Einkauf · '
              : ''}
            {confidenceLabel(match.confidence)} · {match.score}
          </span>
        </div>

        <ImageGallery
          urls={purchase.images
            .map((image) => image.url)
            .slice(0, 3)}
          title={purchase.title}
        />
      </div>

      <div style={{ padding: '0 12px 8px' }}>
        <h3
          style={cardTitleStyle()}
          title={purchase.title}
        >
          {purchase.title}
        </h3>

        <div
          title={match.reasons.join(' · ')}
          style={{
            marginTop: 4,
            fontSize: 11,
            lineHeight: 1.25,
            opacity: 0.62,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {match.reasons.join(' · ')}
        </div>
      </div>

      <div
        style={{
          padding: '0 12px 12px',
          alignSelf: 'end',
        }}
      >
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
              'Bunjang-Orders',
              purchase.groupedPurchase
                ? `${purchase.linkedBunjangOrderIds.length} verknüpft`
                : purchase.bunjangOrderId
                  ? '1 verknüpft'
                  : 'noch keine',
            ],
            [
              'Typ',
              purchase.groupedPurchase
                ? 'Zusammengefasst'
                : 'Einzeleinkauf',
            ],
          ]}
        />
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
  const [autoListingEnrichment, setAutoListingEnrichment] = useState(true)
  const [listingProgress, setListingProgress] = useState<string | null>(null)
  const [listingSummary, setListingSummary] = useState<ListingSyncSummary | null>(null)
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


  const listingUrlCoverage = useMemo(() => {
    const withUrl = parsed.records.filter((record) =>
      Boolean(primaryListingUrl(record)),
    ).length

    return {
      withUrl,
      withoutUrl: parsed.records.length - withUrl,
    }
  }, [parsed.records])

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


  function primaryListingUrl(record: BunjangOrderRecord) {
    const extracted =
      record.productUrls?.find((url) =>
        /bunjang\.co\.kr\/products?\//i.test(url),
      ) ??
      record.productUrls?.[0] ??
      null

    if (extracted) return extracted

    if (record.sourceListingId) {
      return `https://m.bunjang.co.kr/products/${record.sourceListingId}`
    }

    return null
  }

  async function autoEnrichListing(
    record: BunjangOrderRecord,
    purchaseId?: string | null,
  ): Promise<AutoListingResult | null> {
    const listingUrl = primaryListingUrl(record)

    if (!listingUrl) return null

    const response = await fetch(
      '/api/purchases/bunjang-auto-listing',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          orderId: record.orderId,
          listingUrl,
          purchaseId: purchaseId ?? null,
        }),
      },
    )

    const data =
      (await response.json()) as AutoListingResult

    if (!response.ok) {
      throw new Error(
        data.error ||
          `Listing für Order #${record.orderId} konnte nicht automatisch importiert werden.`,
      )
    }

    return data
  }

  async function enrichListingsForTargets(
    targets: Array<{
      record: BunjangOrderRecord
      purchaseId?: string | null
    }>,
  ) {
    const unique = new Map<
      string,
      {
        record: BunjangOrderRecord
        purchaseId?: string | null
      }
    >()

    for (const target of targets) {
      if (primaryListingUrl(target.record)) {
        unique.set(target.record.orderId, target)
      }
    }

    const items = [...unique.values()]
    const summary: ListingSyncSummary = {
      attempted: items.length,
      enriched: 0,
      alreadyComplete: 0,
      noUrl: targets.length - items.length,
      noPurchase: 0,
      conflicts: 0,
      failed: 0,
    }

    if (!items.length) {
      setListingSummary(summary)
      return summary
    }

    let completed = 0

    // Two concurrent previews keep the flow fast without spawning too many
    // Bunjang/Playwright fallbacks at the same time.
    for (let start = 0; start < items.length; start += 2) {
      const batch = items.slice(start, start + 2)

      await Promise.all(
        batch.map(async (target) => {
          try {
            const result = await autoEnrichListing(
              target.record,
              target.purchaseId,
            )

            if (!result) {
              summary.noUrl += 1
            } else if (result.status === 'enriched') {
              summary.enriched += 1
            } else if (
              result.status === 'already-complete'
            ) {
              summary.alreadyComplete += 1
            } else if (result.status === 'no-purchase') {
              summary.noPurchase += 1
            } else if (result.status === 'conflict') {
              summary.conflicts += 1
            }
          } catch {
            summary.failed += 1
          } finally {
            completed += 1
            setListingProgress(
              `Listing-Anreicherung ${completed}/${items.length} …`,
            )
          }
        }),
      )
    }

    setListingSummary({ ...summary })
    setListingProgress(null)
    return summary
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
      groupedPurchase?: boolean
      linkedBunjangOrderIds?: string[]
      warnings?: string[]
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

      const saved = await enrichMatch(
        currentMatchRecord,
        currentMatch.purchase.id,
      )

      let listingNote = ''

      if (autoListingEnrichment) {
        try {
          setListingProgress(
            `Listing für Order #${currentMatchRecord.orderId} wird ergänzt …`,
          )
          const listing = await autoEnrichListing(
            currentMatchRecord,
            currentMatch.purchase.id,
          )

          if (listing?.status === 'enriched') {
            listingNote = ' Listing-Daten und Bilder wurden ebenfalls ergänzt.'
          } else if (
            listing?.status === 'already-complete'
          ) {
            listingNote = ' Das Listing war bereits vollständig importiert.'
          } else if (listing?.status === 'conflict') {
            listingNote = ` Listing-Konflikt: ${listing.message || 'bereits einem anderen Einkauf zugeordnet.'}`
          }
        } catch (listingError) {
          listingNote = ` Order-Match gespeichert; Listing-Anreicherung fehlgeschlagen: ${
            listingError instanceof Error
              ? listingError.message
              : 'unbekannter Fehler'
          }`
        } finally {
          setListingProgress(null)
        }
      }

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
        saved.groupedPurchase
          ? `Order #${currentMatchRecord.orderId} wurde dem zusammengefassten Einkauf hinzugefügt. Der Gesamtwert des Einkaufs blieb unverändert. ${saved.linkedBunjangOrderIds?.length ?? 1} Bunjang-Orders sind jetzt verknüpft.${listingNote}`
          : `Match für Order #${currentMatchRecord.orderId} gespeichert. Die Bestellung wurde aus der Synchronisation entfernt.${listingNote}`,
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
    const existingRecords = parsed.records.filter(
      (record) => alreadyStoredOrderIds.has(record.orderId),
    )

    if (
      !activeRecords.length &&
      !(autoListingEnrichment && existingRecords.length)
    ) {
      return
    }

    rememberExtraction(rawText)
    setSubmitting(true)
    setMessage(null)
    setResult(null)
    setListingSummary(null)

    try {
      let data: SyncResult = {
        summary: {
          total: 0,
          updated: 0,
          created: 0,
          skipped: 0,
          conflicts: 0,
          olaeetMatches: 0,
        },
        orders: [],
      }

      if (activeRecords.length) {
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

        data = (await response.json()) as SyncResult

        if (!response.ok) {
          throw new Error(
            data.error || 'Synchronisierung fehlgeschlagen.',
          )
        }
      }

      const successfulOrders = (data.orders ?? []).filter(
        (order) =>
          (order.action === 'updated' ||
            order.action === 'created') &&
          Boolean(order.purchaseId),
      )

      const handled = new Set(
        successfulOrders.map((order) => order.orderId),
      )

      if (handled.size) {
        setResolvedOrderIds((current) => {
          const next = new Set(current)
          for (const orderId of handled) next.add(orderId)
          return next
        })
      }

      if (autoListingEnrichment) {
        const recordById = new Map(
          parsed.records.map((record) => [
            record.orderId,
            record,
          ]),
        )

        const listingTargets: Array<{
          record: BunjangOrderRecord
          purchaseId?: string | null
        }> = []

        // Exact Order IDs are hidden from the normal sync view, but may still
        // miss description/images. The auto-listing endpoint finds their
        // existing Purchase by Order ID and skips already-complete listings.
        for (const record of existingRecords) {
          listingTargets.push({ record })
        }

        for (const order of successfulOrders) {
          const record = recordById.get(order.orderId)
          if (!record) continue

          listingTargets.push({
            record,
            purchaseId: order.purchaseId,
          })
        }

        const listing = await enrichListingsForTargets(
          listingTargets,
        )

        if (listing.attempted) {
          setMessage(
            `Order-Sync abgeschlossen. Listing-Sync: ${listing.enriched} ergänzt, ${listing.alreadyComplete} bereits vollständig, ${listing.noUrl} ohne Produkt-URL, ${listing.noPurchase} ohne gespeicherten Einkauf, ${listing.conflicts} Konflikt(e), ${listing.failed} Fehler.`,
          )
        }
      }

      setResult(data)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Synchronisierung fehlgeschlagen.',
      )
    } finally {
      setListingProgress(null)
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

        {listingProgress ? (
          <div className="alert alert-info">
            {listingProgress}
          </div>
        ) : null}


        {parsed.records.length ? (
          <div
            className={
              listingUrlCoverage.withoutUrl
                ? 'alert alert-warning'
                : 'alert alert-success'
            }
          >
            Listing-URLs erkannt: {listingUrlCoverage.withUrl}/
            {parsed.records.length}
            {listingUrlCoverage.withoutUrl
              ? ` · ${listingUrlCoverage.withoutUrl} Order(s) ohne verwertbare Bunjang-Produkt-URL. Für diese Orders kann die automatische Beschreibung-/Bild-Anreicherung nicht starten.`
              : ' · alle Orders können automatisch mit Listing-Daten ergänzt werden.'}
          </div>
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
          <div
            style={{
              display: 'grid',
              gap: 10,
            }}
          >
            {currentMatchRecord && currentMatch ? (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'auto minmax(0, 1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: '8px 10px',
                    border:
                      '1px solid var(--border, #dfe4ea)',
                    borderRadius: 14,
                    background:
                      'var(--surface-muted, #f7f8fa)',
                  }}
                >
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={matchRecords.length <= 1}
                    onClick={() => moveMatchOrder(-1)}
                    aria-label="Vorheriges erkanntes Match"
                    style={{
                      width: 38,
                      height: 38,
                      padding: 0,
                      borderRadius: 999,
                      fontSize: 21,
                    }}
                  >
                    ‹
                  </button>

                  <div
                    style={{
                      minWidth: 0,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong>
                      Match {matchOrderIndex + 1} /{' '}
                      {matchRecords.length}
                    </strong>

                    <span style={{ opacity: 0.45 }}>
                      ·
                    </span>

                    <span
                      style={{
                        fontSize: 13,
                        opacity: 0.72,
                      }}
                    >
                      Extraktion
                      <strong
                        style={{
                          padding: '0 8px',
                          opacity: 1,
                        }}
                      >
                        ↔
                      </strong>
                      gespeicherter Einkauf
                    </span>

                    <span style={{ opacity: 0.45 }}>
                      ·
                    </span>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <button
                        type="button"
                        className="button button-ghost"
                        disabled={currentMatches.length <= 1}
                        onClick={() => moveCandidate(-1)}
                        aria-label="Vorheriger möglicher Match"
                        style={{
                          minWidth: 34,
                          height: 32,
                          padding: '0 8px',
                        }}
                      >
                        ←
                      </button>

                      <strong
                        style={{
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Kandidat {currentCandidateIndex + 1}/
                        {currentMatches.length}
                      </strong>

                      <button
                        type="button"
                        className="button button-ghost"
                        disabled={currentMatches.length <= 1}
                        onClick={() => moveCandidate(1)}
                        aria-label="Nächster möglicher Match"
                        style={{
                          minWidth: 34,
                          height: 32,
                          padding: '0 8px',
                        }}
                      >
                        →
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="button button-primary"
                    disabled={matchRecords.length <= 1}
                    onClick={() => moveMatchOrder(1)}
                    aria-label="Nächstes erkanntes Match"
                    title="Nächstes erkanntes Match"
                    style={{
                      width: 38,
                      height: 38,
                      padding: 0,
                      borderRadius: 999,
                      fontSize: 21,
                    }}
                  >
                    ›
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(2, minmax(0, 1fr))',
                    gap: 12,
                    alignItems: 'stretch',
                  }}
                >
                  <ExtractedComparisonCard
                    record={currentMatchRecord}
                  />

                  <SavedPurchaseComparisonCard
                    match={currentMatch}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    border:
                      '1px solid var(--border, #dfe4ea)',
                    borderRadius: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong
                      style={{
                        fontSize: 13,
                      }}
                    >
                      #{currentMatchRecord.orderId}
                    </strong>

                    <span
                      style={{
                        fontSize: 12,
                        opacity: 0.65,
                      }}
                    >
                      {confidenceLabel(
                        currentMatch.confidence,
                      )}{' '}
                      · Score {currentMatch.score}
                    </span>

                    <Link
                      className="button button-ghost"
                      href={`/purchases/${currentMatch.purchase.id}`}
                      target="_blank"
                      style={{
                        minHeight: 34,
                        padding: '7px 10px',
                      }}
                    >
                      Einkauf öffnen ↗
                    </Link>
                  </div>

                  <button
                    type="button"
                    className="button button-primary"
                    disabled={savingMatch}
                    onClick={saveCurrentMatch}
                    style={{
                      minWidth: 150,
                    }}
                  >
                    {savingMatch
                      ? 'Speichere …'
                      : 'Match speichern'}
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
                checked={autoListingEnrichment}
                onChange={(event) =>
                  setAutoListingEnrichment(
                    event.target.checked,
                  )
                }
              />
              <span>
                <strong>
                  Bunjang-Listing automatisch ergänzen
                </strong>
                <br />
                <small>
                  Nutzt die vom Extractor gelesene Produkt-URL und den bekannten
                  CardCargo-URL-Importer für Titel, Beschreibung, Listing-ID und
                  Angebotsbilder. Order-Preis, Versand, Kaufdatum und Tracking
                  bleiben maßgeblich.
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
            disabled={
              submitting ||
              (!activeRecords.length &&
                !(
                  autoListingEnrichment &&
                  alreadyStoredOrderIds.size
                ))
            }
            onClick={sync}
          >
            {submitting
              ? 'Order + Listing synchronisieren …'
              : `Order + Listing synchronisieren (${activeRecords.length} offen)`}
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
                {listingSummary ? (
                  <>
                    {' '}· Listings: {listingSummary.enriched} ergänzt,{' '}
                    {listingSummary.alreadyComplete} bereits vollständig,{' '}
                    {listingSummary.noUrl} ohne URL,{' '}
                    {listingSummary.noPurchase} ohne Einkauf,{' '}
                    {listingSummary.failed} Fehler
                  </>
                ) : null}
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
