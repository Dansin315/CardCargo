'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  parseBunjangOrderImport,
  type BunjangOrderRecord,
} from '@/lib/bunjang-order-import'
import { BUNJANG_ORDER_CACHE_KEY } from '@/lib/bunjang-order-match'

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
  alreadyLinked: boolean
}

type SuggestionsResponse = {
  error?: string
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
      return 'Exakter Treffer'
    case 'strong':
      return 'Sehr wahrscheinlicher Treffer'
    case 'likely':
      return 'Wahrscheinlicher Treffer'
    default:
      return 'Möglicher Treffer'
  }
}

function OrderSummary({
  record,
}: {
  record: BunjangOrderRecord
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 9,
      }}
    >
      {record.imageUrls.length ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {record.imageUrls.slice(0, 4).map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              style={{
                width: 88,
                height: 88,
                objectFit: 'cover',
                borderRadius: 10,
                border: '1px solid var(--border, #ddd)',
              }}
            />
          ))}
        </div>
      ) : null}

      <div>
        <strong>
          {record.title ||
            `Bunjang Bestellung #${record.orderId}`}
        </strong>
        <div>Order #{record.orderId}</div>
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '5px 12px',
          margin: 0,
        }}
      >
        <dt>Verkäufer</dt>
        <dd style={{ margin: 0 }}>
          {record.sellerName || '–'}
        </dd>

        <dt>Kaufdatum</dt>
        <dd style={{ margin: 0 }}>
          {record.purchasedAt || '–'}
        </dd>

        <dt>Warenwert</dt>
        <dd style={{ margin: 0 }}>
          {money(record.productAmount)}
        </dd>

        <dt>Versand</dt>
        <dd style={{ margin: 0 }}>
          {money(record.domesticShippingAmount)}
        </dd>

        <dt>Gesamt</dt>
        <dd style={{ margin: 0 }}>
          {money(record.totalAmount)}
        </dd>

        <dt>Carrier</dt>
        <dd style={{ margin: 0 }}>
          {record.domesticCarrier || '–'}
        </dd>

        <dt>Tracking</dt>
        <dd style={{ margin: 0 }}>
          {record.domesticTrackingNumber || '–'}
        </dd>
      </dl>
    </div>
  )
}

function PurchaseMatchCard({
  match,
  selected,
  onSelect,
  onClear,
}: {
  match: MatchSuggestion
  selected: boolean
  onSelect: () => void
  onClear: () => void
}) {
  const purchase = match.purchase

  return (
    <article
      style={{
        border: selected
          ? '2px solid currentColor'
          : '1px solid var(--border, #ddd)',
        borderRadius: 14,
        padding: 14,
        display: 'grid',
        gap: 10,
      }}
    >
      {purchase.images.length ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {purchase.images.map((image) => (
            <img
              key={image.id}
              src={image.url}
              alt=""
              style={{
                width: 96,
                height: 96,
                objectFit: 'cover',
                borderRadius: 10,
                border:
                  '1px solid var(--border, #ddd)',
              }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            minHeight: 70,
            border:
              '1px dashed var(--border, #bbb)',
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            opacity: 0.65,
          }}
        >
          Keine archivierten Bilder
        </div>
      )}

      <div>
        <strong>{purchase.title}</strong>
        <div>
          {purchase.sourceListingId
            ? `Bunjang #${purchase.sourceListingId}`
            : 'Keine Listing-ID'}
        </div>
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '5px 12px',
          margin: 0,
        }}
      >
        <dt>Verkäufer</dt>
        <dd style={{ margin: 0 }}>
          {purchase.sellerName || '–'}
        </dd>

        <dt>Preis</dt>
        <dd style={{ margin: 0 }}>
          {money(
            purchase.priceAmount,
            purchase.priceCurrency,
          )}
        </dd>

        <dt>Versand</dt>
        <dd style={{ margin: 0 }}>
          {money(
            purchase.domesticShippingAmount,
            purchase.priceCurrency,
          )}
        </dd>

        <dt>Kaufdatum</dt>
        <dd style={{ margin: 0 }}>
          {purchase.purchasedAt || '–'}
        </dd>

        <dt>Status</dt>
        <dd style={{ margin: 0 }}>
          {purchase.status}
        </dd>

        <dt>Carrier</dt>
        <dd style={{ margin: 0 }}>
          {purchase.domesticCarrier || '–'}
        </dd>

        <dt>Tracking</dt>
        <dd style={{ margin: 0 }}>
          {purchase.domesticTrackingNumber || '–'}
        </dd>
      </dl>

      <div>
        <strong>
          {confidenceLabel(match.confidence)}
        </strong>
        <div style={{ marginTop: 4 }}>
          {match.reasons.join(' · ')}
        </div>
      </div>

      {match.alreadyLinked ? (
        <div className="alert alert-success">
          Dieser Einkauf ist bereits mit dieser
          Bunjang-Order-ID verbunden.
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <button
          className={
            selected
              ? 'button button-ghost'
              : 'button button-secondary'
          }
          type="button"
          onClick={selected ? onClear : onSelect}
        >
          {selected
            ? 'Auswahl rückgängig'
            : 'Diesen Einkauf verwenden'}
        </button>

        <Link
          className="button button-ghost"
          href={`/purchases/${purchase.id}`}
          target="_blank"
        >
          Einkauf im Detail öffnen ↗
        </Link>
      </div>
    </article>
  )
}

export function BunjangOrderImporter() {
  const [rawText, setRawText] = useState('')
  const [createMissing, setCreateMissing] =
    useState(false)
  const [autoAssignOlaeet, setAutoAssignOlaeet] =
    useState(true)
  const [manualOnly, setManualOnly] =
    useState(true)
  const [submitting, setSubmitting] =
    useState(false)
  const [loadingMatches, setLoadingMatches] =
    useState(false)
  const [message, setMessage] = useState<
    string | null
  >(null)
  const [result, setResult] =
    useState<SyncResult | null>(null)
  const [suggestions, setSuggestions] =
    useState<
      Record<string, MatchSuggestion[]>
    >({})
  const [manualMatches, setManualMatches] =
    useState<Record<string, string>>({})

  const parsed = useMemo(
    () => parseBunjangOrderImport(rawText),
    [rawText],
  )

  function rememberExtraction(text: string) {
    const parsedText =
      parseBunjangOrderImport(text)

    if (parsedText.records.length) {
      localStorage.setItem(
        BUNJANG_ORDER_CACHE_KEY,
        text,
      )
    }
  }

  function changeRawText(text: string) {
    setRawText(text)
    setSuggestions({})
    setManualMatches({})
    setResult(null)
    rememberExtraction(text)
  }

  async function clipboard() {
    setMessage(null)

    try {
      const text =
        await navigator.clipboard.readText()
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

  async function loadSuggestions() {
    if (!parsed.records.length) return

    setLoadingMatches(true)
    setMessage(null)

    try {
      const response = await fetch(
        '/api/purchases/bunjang-order-match-suggestions',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            records: parsed.records,
          }),
        },
      )

      const data =
        (await response.json()) as SuggestionsResponse

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Match-Vorschläge konnten nicht geladen werden.',
        )
      }

      const next: Record<
        string,
        MatchSuggestion[]
      > = {}

      for (const entry of data.suggestions ?? []) {
        next[entry.orderId] = entry.matches
      }

      setSuggestions(next)

      const exactSelections: Record<
        string,
        string
      > = {}

      for (const entry of data.suggestions ?? []) {
        const alreadyLinked =
          entry.matches.find(
            (match) => match.alreadyLinked,
          )

        if (alreadyLinked) {
          exactSelections[entry.orderId] =
            alreadyLinked.purchase.id
        }
      }

      setManualMatches((current) => ({
        ...exactSelections,
        ...current,
      }))
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Match-Vorschläge konnten nicht geladen werden.',
      )
    } finally {
      setLoadingMatches(false)
    }
  }

  async function enrichManualMatch(
    record: BunjangOrderRecord,
    purchaseId: string,
  ): Promise<SyncOrderResult> {
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
        domestic_tracking_number:
          | string
          | null
      }
      olaeetMatch?: {
        externalPackageId: string | null
      } | null
      warnings?: string[]
    }

    if (!response.ok || !data.purchase) {
      return {
        orderId: record.orderId,
        title: record.title,
        action: 'conflict',
        purchaseId,
        matchMethod: 'manual_review',
        trackingNumber:
          record.domesticTrackingNumber,
        olaeetExternalId: null,
        message:
          data.error ||
          'Der ausgewählte Einkauf konnte nicht aktualisiert werden.',
      }
    }

    return {
      orderId: record.orderId,
      title: data.purchase.title,
      action: 'updated',
      purchaseId: data.purchase.id,
      matchMethod: 'manual_review',
      trackingNumber:
        data.purchase.domestic_tracking_number,
      olaeetExternalId:
        data.olaeetMatch?.externalPackageId ??
        null,
      message: data.olaeetMatch
        ? `Manuell geprüfter Match übernommen und mit ${data.olaeetMatch.externalPackageId || 'OLAEET'} verknüpft.`
        : 'Manuell geprüfter Match übernommen und Bestelldaten ergänzt.',
    }
  }

  async function sync() {
    if (!parsed.records.length) return

    rememberExtraction(rawText)
    setSubmitting(true)
    setMessage(null)
    setResult(null)

    try {
      const manualResults: SyncOrderResult[] =
        []
      const remaining: BunjangOrderRecord[] =
        []

      for (const record of parsed.records) {
        const purchaseId =
          manualMatches[record.orderId]

        if (!purchaseId) {
          remaining.push(record)
          continue
        }

        manualResults.push(
          await enrichManualMatch(
            record,
            purchaseId,
          ),
        )
      }

      let bulkResult: SyncResult = {
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

      if (remaining.length) {
        const response = await fetch(
          '/api/purchases/bunjang-order-sync',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              records: remaining,
              createMissing,
              autoAssignOlaeet,
              manualOnly,
            }),
          },
        )

        const data =
          (await response.json()) as SyncResult

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Synchronisierung fehlgeschlagen.',
          )
        }

        bulkResult = data
      }

      const allOrders = [
        ...manualResults,
        ...(bulkResult.orders ?? []),
      ]

      const summary = {
        total: allOrders.length,
        updated: allOrders.filter(
          (order) => order.action === 'updated',
        ).length,
        created: allOrders.filter(
          (order) => order.action === 'created',
        ).length,
        skipped: allOrders.filter(
          (order) => order.action === 'skipped',
        ).length,
        conflicts: allOrders.filter(
          (order) => order.action === 'conflict',
        ).length,
        olaeetMatches: allOrders.filter(
          (order) =>
            Boolean(order.olaeetExternalId) &&
            order.action !== 'conflict',
        ).length,
      }

      setResult({
        summary,
        orders: allOrders,
      })
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
              Lade den Batch des Bunjang
              Detail-Extractors ein. Die Daten
              bleiben zusätzlich lokal für den
              URL-Import verfügbar.
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

        <label
          style={{
            marginTop: 14,
            display: 'block',
          }}
        >
          Extractor-JSON
          <textarea
            rows={10}
            value={rawText}
            onChange={(event) =>
              changeRawText(event.target.value)
            }
            placeholder="Bunjang-Order-Extractor-Daten hier einfügen …"
          />
        </label>

        {message ? (
          <div className="alert alert-error">
            {message}
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
        <div className="panel-heading">
          <div>
            <h2>2. Extrahierte Bestellungen</h2>
            <p>
              {parsed.records.length}{' '}
              Bestellung(en) ·{' '}
              {
                parsed.records.filter(
                  (record) =>
                    record.domesticTrackingNumber,
                ).length
              }{' '}
              mit Tracking
            </p>
          </div>

          <button
            className="button button-secondary"
            type="button"
            disabled={
              loadingMatches ||
              !parsed.records.length
            }
            onClick={loadSuggestions}
          >
            {loadingMatches
              ? 'Suche Matches …'
              : 'Mögliche Matches suchen'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {parsed.records.map((record) => (
            <article
              key={record.orderId}
              style={{
                border:
                  '1px solid var(--border, #ddd)',
                borderRadius: 14,
                padding: 14,
              }}
            >
              <OrderSummary record={record} />
            </article>
          ))}
        </div>
      </section>

      {Object.keys(suggestions).length ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                3. Mögliche bestehende Einkäufe
                prüfen
              </h2>
              <p>
                Vergleiche die extrahierte
                Bunjang-Bestellung mit Bildern und
                gespeicherten Daten. Eine Auswahl
                wird beim Synchronisieren
                verbindlich verwendet.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 22,
            }}
          >
            {parsed.records.map((record) => {
              const matches =
                suggestions[record.orderId] ?? []

              return (
                <article
                  key={record.orderId}
                  style={{
                    border:
                      '1px solid var(--border, #ddd)',
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'minmax(260px, .8fr) minmax(340px, 1.2fr)',
                      gap: 18,
                      alignItems: 'start',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          marginBottom: 10,
                        }}
                      >
                        <strong>
                          Extrahierte Bestellung
                        </strong>
                      </div>

                      <OrderSummary
                        record={record}
                      />
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gap: 10,
                      }}
                    >
                      <strong>
                        CardCargo-Vorschläge
                      </strong>

                      {matches.length ? (
                        matches.map((match) => (
                          <PurchaseMatchCard
                            key={match.purchase.id}
                            match={match}
                            selected={
                              manualMatches[
                                record.orderId
                              ] === match.purchase.id
                            }
                            onSelect={() =>
                              setManualMatches(
                                (current) => ({
                                  ...current,
                                  [record.orderId]:
                                    match.purchase.id,
                                }),
                              )
                            }
                            onClear={() =>
                              setManualMatches(
                                (current) => {
                                  const next = {
                                    ...current,
                                  }
                                  delete next[
                                    record.orderId
                                  ]
                                  return next
                                },
                              )
                            }
                          />
                        ))
                      ) : (
                        <div className="alert alert-info">
                          Kein ausreichend ähnlicher
                          bestehender Einkauf gefunden.
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {Object.keys(suggestions).length
                ? '4. Synchronisieren'
                : '3. Synchronisieren'}
            </h2>
            <p>
              Manuell ausgewählte Matches werden
              zuerst übernommen. Danach werden die
              übrigen Orders verarbeitet.
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
                setManualOnly(
                  event.target.checked,
                )
              }
            />
            <span>
              <strong>
                Nicht ausgewählte Orders nicht
                automatisch bestehenden Einkäufen
                zuordnen
              </strong>
              <br />
              <small>
                Empfohlen für die persönliche
                Prüfung. Ohne deine Auswahl wird
                kein heuristischer Bestands-Match
                verwendet.
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
                setCreateMissing(
                  event.target.checked,
                )
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
                setAutoAssignOlaeet(
                  event.target.checked,
                )
              }
            />
            Exakte Tracking-Treffer automatisch
            OLAEET zuordnen
          </label>
        </div>

        <div
          style={{
            marginBottom: 14,
          }}
        >
          <strong>
            {Object.keys(manualMatches).length}
          </strong>{' '}
          Match(es) persönlich ausgewählt
        </div>

        <button
          className="button button-primary"
          type="button"
          disabled={
            submitting || !parsed.records.length
          }
          onClick={sync}
        >
          {submitting
            ? 'Synchronisiere …'
            : 'Geprüfte Bestellungen synchronisieren'}
        </button>
      </section>

      {result?.summary ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Ergebnis</h2>
              <p>
                {result.summary.updated}{' '}
                aktualisiert ·{' '}
                {result.summary.created} neu ·{' '}
                {result.summary.skipped} ohne
                Zuordnung ·{' '}
                {result.summary.conflicts}{' '}
                Konflikte ·{' '}
                {result.summary.olaeetMatches}{' '}
                OLAEET-Matches
              </p>
            </div>

            <Link
              href="/purchases"
              className="button button-secondary"
            >
              Einkäufe öffnen
            </Link>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 10,
            }}
          >
            {(result.orders ?? []).map(
              (order) => (
                <article
                  key={`${order.orderId}-${order.purchaseId || 'none'}`}
                  style={{
                    border:
                      '1px solid var(--border, #ddd)',
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <strong>
                    {order.title ||
                      `Bestellung ${order.orderId}`}
                  </strong>
                  <p
                    style={{
                      margin: '6px 0',
                    }}
                  >
                    {order.message}
                  </p>
                </article>
              ),
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
