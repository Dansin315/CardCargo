'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  itemLanguageOptions,
  type CardCatalogCandidate,
  type CatalogMatchType,
  type CatalogProvider,
} from '@/lib/card-catalog-types'
import { catalogMatchLabels, catalogProviderLabels, type PurchaseItemRow } from '@/lib/purchase-items'

interface Draft {
  id: string | null
  itemName: string
  setName: string
  setCode: string
  pokemonNameEn: string
  cardNumber: string
  language: string
  rarity: string
  variant: string
  quantity: string
  gradingCompany: string
  grade: string
  sellerCondition: string
  allocatedUnitCost: string
  notes: string
  catalogProvider: CatalogProvider | null
  catalogCardId: string | null
  catalogLanguage: string | null
  catalogMatchType: CatalogMatchType | null
  catalogImageUrl: string | null
  catalogSnapshot: Record<string, unknown> | null
}

function blankDraft(): Draft {
  return {
    id: null,
    itemName: '',
    setName: '',
    setCode: '',
    pokemonNameEn: '',
    cardNumber: '',
    language: 'Korean',
    rarity: '',
    variant: '',
    quantity: '1',
    gradingCompany: '',
    grade: '',
    sellerCondition: '',
    allocatedUnitCost: '',
    notes: '',
    catalogProvider: null,
    catalogCardId: null,
    catalogLanguage: null,
    catalogMatchType: null,
    catalogImageUrl: null,
    catalogSnapshot: null,
  }
}

function draftFromItem(item: PurchaseItemRow): Draft {
  return {
    id: item.id,
    itemName: item.item_name,
    setName: item.set_name ?? '',
    setCode: item.set_code ?? '',
    pokemonNameEn: item.pokemon_name_en ?? '',
    cardNumber: item.card_number ?? '',
    language: item.language ?? 'Korean',
    rarity: item.rarity ?? '',
    variant: item.variant ?? '',
    quantity: String(item.quantity),
    gradingCompany: item.grading_company ?? '',
    grade: item.grade ?? '',
    sellerCondition: item.seller_condition ?? '',
    allocatedUnitCost: item.allocated_unit_cost === null ? '' : String(item.allocated_unit_cost),
    notes: item.notes ?? '',
    catalogProvider: item.catalog_provider,
    catalogCardId: item.catalog_card_id,
    catalogLanguage: item.catalog_language,
    catalogMatchType: item.catalog_match_type,
    catalogImageUrl: item.catalog_image_url,
    catalogSnapshot: item.catalog_snapshot,
  }
}

function parseNullableNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function PurchaseItemsManager({
  purchaseId,
  warehousePackageId,
  purchaseCurrency = 'KRW',
  purchaseStatus = 'expected',
}: {
  purchaseId?: string
  warehousePackageId?: string
  purchaseCurrency?: string
  purchaseStatus?: string
}) {
  const router = useRouter()
  const isWarehousePackage = Boolean(warehousePackageId)

  if (Boolean(purchaseId) === Boolean(warehousePackageId)) {
    throw new Error('PurchaseItemsManager benötigt genau einen Kontext: Einkauf oder OLAEET-Paket.')
  }

  const itemsApiPath = isWarehousePackage
    ? `/api/warehouse-packages/${warehousePackageId}/items`
    : `/api/purchases/${purchaseId}/items`
  const [items, setItems] = useState<PurchaseItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [candidates, setCandidates] = useState<CardCatalogCandidate[]>([])
  const [catalogWarnings, setCatalogWarnings] = useState<string[]>([])
  const [catalogSearching, setCatalogSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function refreshItems() {
    const response = await fetch(itemsApiPath, { cache: 'no-store' })
    const result = (await response.json()) as { items?: PurchaseItemRow[]; error?: string }
    if (!response.ok) throw new Error(result.error || 'Einzelkarten konnten nicht geladen werden.')
    setItems(result.items ?? [])
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialItems() {
      try {
        const response = await fetch(itemsApiPath, { cache: 'no-store' })
        const result = (await response.json()) as { items?: PurchaseItemRow[]; error?: string }

        if (!response.ok) {
          throw new Error(result.error || 'Einzelkarten konnten nicht geladen werden.')
        }

        if (!cancelled) {
          setItems(result.items ?? [])
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Einzelkarten konnten nicht geladen werden.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialItems()

    return () => {
      cancelled = true
    }
  }, [itemsApiPath])

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [items],
  )

  function startNew() {
    setDraft(blankDraft())
    setCandidates([])
    setCatalogWarnings([])
    setMessage(null)
    setShowForm(true)
  }

  function startEdit(item: PurchaseItemRow) {
    setDraft(draftFromItem(item))
    setCandidates([])
    setCatalogWarnings([])
    setMessage(null)
    setShowForm(true)
  }

  function cancelEdit() {
    setShowForm(false)
    setDraft(blankDraft())
    setCandidates([])
    setCatalogWarnings([])
  }

  async function searchCatalog() {
    if (!draft.itemName.trim() && !draft.cardNumber.trim() && !draft.setCode.trim()) {
      setMessage('Für die Katalogsuche mindestens Kartenname, Kartennummer oder Setcode eingeben.')
      return
    }
    setCatalogSearching(true)
    setMessage(null)
    setCandidates([])
    setCatalogWarnings([])
    try {
      const params = new URLSearchParams({
        language: draft.language,
        includeFallback: '1',
      })
      if (draft.itemName.trim()) params.set('name', draft.itemName.trim())
      if (draft.cardNumber.trim()) params.set('cardNumber', draft.cardNumber.trim())
      if (draft.setCode.trim()) params.set('setCode', draft.setCode.trim())
      const response = await fetch(`/api/card-catalog/search?${params.toString()}`, { cache: 'no-store' })
      const result = (await response.json()) as {
        candidates?: CardCatalogCandidate[]
        warnings?: string[]
        error?: string
      }
      if (!response.ok) throw new Error(result.error || 'Katalogsuche fehlgeschlagen.')
      setCandidates(result.candidates ?? [])
      setCatalogWarnings(result.warnings ?? [])
      if (!(result.candidates ?? []).length) {
        setMessage('Kein eindeutiger Katalogtreffer gefunden. Die Karte kann vollständig manuell gespeichert werden.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Katalogsuche fehlgeschlagen.')
    } finally {
      setCatalogSearching(false)
    }
  }

  function chooseCandidate(candidate: CardCatalogCandidate) {
    const suggestedVariant = candidate.variants.length === 1 ? candidate.variants[0] : ''
    setDraft((current) => ({
      ...current,
      itemName: candidate.englishName || candidate.name || current.itemName,
      pokemonNameEn: candidate.pokemonNameEn || current.pokemonNameEn,
      cardNumber: current.cardNumber.trim() || candidate.numberDisplay || candidate.number || '',
      setCode: candidate.setCode || current.setCode,
      setName: candidate.setName || current.setName,
      rarity: candidate.rarity || current.rarity,
      variant: current.variant || suggestedVariant,
      catalogProvider: candidate.provider,
      catalogCardId: candidate.providerCardId,
      catalogLanguage: candidate.catalogLanguage,
      catalogMatchType: candidate.matchType,
      catalogImageUrl: candidate.imageUrl,
      catalogSnapshot: candidate.snapshot,
    }))
    setMessage('Katalogtreffer übernommen. Alle Felder bleiben vor dem Speichern manuell editierbar.')
  }

  function clearCatalogMatch() {
    setDraft((current) => ({
      ...current,
      catalogProvider: null,
      catalogCardId: null,
      catalogLanguage: null,
      catalogMatchType: null,
      catalogImageUrl: null,
      catalogSnapshot: null,
    }))
  }

  function submitCatalogSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void searchCatalog()
  }

  async function saveItem() {
    setSubmitting(true)
    setMessage(null)
    try {
      const quantity = Number(draft.quantity)
      const allocatedUnitCost = parseNullableNumber(draft.allocatedUnitCost)
      if (!draft.itemName.trim()) {
        throw new Error(
          'Zum Speichern der Einzelkarte wird ein Kartenname benötigt. Für die Katalogsuche ist der Name optional.',
        )
      }
      if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Menge muss mindestens 1 sein.')
      if (Number.isNaN(allocatedUnitCost)) throw new Error('Preisanteil muss eine gültige Zahl sein.')

      const payload = {
        itemName: draft.itemName,
        setName: draft.setName || null,
        setCode: draft.setCode || null,
        pokemonNameEn: draft.pokemonNameEn || null,
        cardNumber: draft.cardNumber || null,
        language: draft.language,
        rarity: draft.rarity || null,
        variant: draft.variant || null,
        quantity,
        gradingCompany: draft.gradingCompany || null,
        grade: draft.grade || null,
        sellerCondition: draft.sellerCondition || null,
        allocatedUnitCost,
        notes: draft.notes || null,
        catalogProvider: draft.catalogProvider,
        catalogCardId: draft.catalogCardId,
        catalogLanguage: draft.catalogLanguage,
        catalogMatchType: draft.catalogMatchType,
        catalogImageUrl: draft.catalogImageUrl,
        catalogSnapshot: draft.catalogSnapshot,
      }

      const url = draft.id ? `/api/purchase-items/${draft.id}` : itemsApiPath
      const response = await fetch(url, {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Einzelkarte konnte nicht gespeichert werden.')
      await refreshItems()
      cancelEdit()
      setMessage(isWarehousePackage && !draft.id ? 'Bonuskarte gespeichert und paketweit verknüpft.' : 'Einzelkarte gespeichert.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Einzelkarte konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteItem(item: PurchaseItemRow) {
    const sourceNote = item.source_scope === 'warehouse_package'
      ? 'Die paketweite Bonuskarte verschwindet dadurch auch aus allen verknüpften Bunjang-Ansichten.'
      : 'Die Karte verschwindet dadurch auch aus der verknüpften OLAEET-Paketansicht.'
    if (!window.confirm(`„${item.item_name}“ wirklich löschen?\n\n${sourceNote}`)) return
    setMessage(null)
    const response = await fetch(`/api/purchase-items/${item.id}`, { method: 'DELETE' })
    const result = (await response.json()) as { error?: string }
    if (!response.ok) {
      setMessage(result.error || 'Einzelkarte konnte nicht gelöscht werden.')
      return
    }
    await refreshItems()
    setMessage('Einzelkarte gelöscht.')
    router.refresh()
  }

  async function createInventory(item: PurchaseItemRow) {
    const remaining = item.quantity - Number(item.inventory_created_count ?? 0)
    if (remaining <= 0) return
    if (!window.confirm(`${remaining} Exemplar${remaining === 1 ? '' : 'e'} von „${item.item_name}“ ins Inventar übernehmen?`)) return
    setMessage(null)
    const response = await fetch(`/api/purchase-items/${item.id}/inventory`, { method: 'POST' })
    const result = (await response.json()) as { created?: number; error?: string }
    if (!response.ok) {
      setMessage(result.error || 'Inventareinträge konnten nicht erzeugt werden.')
      return
    }
    await refreshItems()
    setMessage(`${result.created ?? 0} Inventareintrag${result.created === 1 ? '' : 'e'} erzeugt.`)
    router.refresh()
  }

  return (
    <section className="panel" id="purchase-items">
      <div className="panel-heading">
        <div>
          <h2>{isWarehousePackage ? 'Einzelkarten / Paketinhalt' : 'Einzelkarten / Purchase Items'}</h2>
          <p>
            {isWarehousePackage
              ? 'Zeigt Karten aus den verknüpften Bunjang-Einkäufen und direkt am OLAEET-Paket erfasste Bonuskarten. Dieselben Datensätze sind in beiden Ansichten sichtbar.'
              : 'Optional. Neben den Karten dieses Bunjang-Kaufs werden auch paketweite Bonuskarten des verknüpften OLAEET-Pakets angezeigt.'}
          </p>
        </div>
        {!showForm ? (
          <button className="button button-primary" type="button" onClick={startNew}>
            {isWarehousePackage ? '+ Bonus-/Einzelkarte hinzufügen' : '+ Einzelkarte hinzufügen'}
          </button>
        ) : null}
      </div>

      {message ? <div className="alert alert-info">{message}</div> : null}

      {loading ? <p className="panel-note">Einzelkarten werden geladen …</p> : null}

      {!loading && items.length ? (
        <div className="purchase-item-editor-list">
          {items.map((item) => {
            const created = Number(item.inventory_created_count ?? 0)
            const remaining = Math.max(0, item.quantity - created)
            return (
              <article className="purchase-item-editor-row" key={item.id}>
                <div className="catalog-reference-thumb">
                  {item.catalog_image_url ? (
                    <img src={item.catalog_image_url} alt={`Katalogreferenz ${item.item_name}`} referrerPolicy="no-referrer" />
                  ) : (
                    <span>Manuell</span>
                  )}
                </div>
                <div className="purchase-item-editor-main">
                  <strong>{item.item_name}</strong>
                  <span>{[item.set_name, item.set_code, item.card_number, item.language].filter(Boolean).join(' · ') || 'Keine weiteren Kartendaten'}</span>
                  <small>
                    {item.source_scope === 'warehouse_package'
                      ? `OLAEET-Bonus · ${item.source_package_label || 'Paket'}`
                      : `Bunjang-Einkauf · ${item.source_purchase_title || 'verknüpfter Einkauf'}`}
                  </small>
                  <small>
                    {item.catalog_provider && item.catalog_match_type
                      ? `${catalogProviderLabels[item.catalog_provider]} · ${catalogMatchLabels[item.catalog_match_type]}`
                      : 'Kein Katalogtreffer verknüpft'}
                  </small>
                </div>
                <div className="purchase-item-editor-quantity">
                  <strong>{item.quantity}×</strong>
                  <span>{created} im Inventar</span>
                </div>
                <div className="purchase-item-editor-actions">
                  <button className="button button-secondary button-small" type="button" onClick={() => startEdit(item)}>
                    Bearbeiten
                  </button>
                  {remaining > 0 ? (
                    <button className="button button-secondary button-small" type="button" onClick={() => createInventory(item)}>
                      {remaining}× ins Inventar
                    </button>
                  ) : null}
                  <button className="button button-ghost button-small" type="button" onClick={() => deleteItem(item)}>
                    Löschen
                  </button>
                </div>
              </article>
            )
          })}
          <p className="panel-note">{items.length} Positionen · {totalQuantity} physische Karten {isWarehousePackage ? 'im Paket' : 'laut Einkauf'}</p>
        </div>
      ) : null}

      {!loading && !items.length && !showForm ? (
        <div className="empty-state compact-empty">
          <p>
            {isWarehousePackage
              ? 'Noch keine Einzelkarten im Paket erfasst. Bonuskarten können direkt hier hinzugefügt werden; Karten aus verknüpften Einkäufen erscheinen automatisch.'
              : 'Noch keine Einzelkarten erfasst. Das ist beabsichtigt zulässig und blockiert keinen anderen CardCargo-Prozess.'}
          </p>
        </div>
      ) : null}

      {showForm ? (
        <form className="purchase-item-form" onSubmit={submitCatalogSearch}>
          <div className="panel-heading">
            <div>
              <h3>
                {draft.id
                  ? 'Einzelkarte bearbeiten'
                  : isWarehousePackage
                    ? 'Bonus-/Einzelkarte zum OLAEET-Paket hinzufügen'
                    : 'Einzelkarte hinzufügen'}
              </h3>
              <p>
                {isWarehousePackage && !draft.id
                  ? 'Direkt hier erfasste Karten gelten als paketweite Bonuskarten und werden auch bei den verknüpften Bunjang-Einkäufen angezeigt.'
                  : 'Erst manuell eingeben, dann optional einen Katalogtreffer suchen und übernehmen.'}
              </p>
            </div>
          </div>

          <div className="catalog-search-fields">
            <label className="catalog-search-field">
              <span className="catalog-search-field-title">Kartenname</span>
              <input
                value={draft.itemName}
                onChange={(event) => setDraft({ ...draft, itemName: event.target.value })}
                placeholder="z. B. Shining Rayquaza"
                maxLength={200}
              />
            </label>
            <label className="catalog-search-field">
              <span className="catalog-search-field-title">Kartennummer / Code</span>
              <input
                value={draft.cardNumber}
                onChange={(event) => setDraft({ ...draft, cardNumber: event.target.value })}
                placeholder="z. B. 025/165"
                maxLength={80}
              />
            </label>
            <label className="catalog-search-field">
              <span className="catalog-search-field-title">Setcode</span>
              <input
                value={draft.setCode}
                onChange={(event) => setDraft({ ...draft, setCode: event.target.value })}
                placeholder="z. B. sv4a oder PAF"
                maxLength={80}
              />
            </label>
            <label className="catalog-search-field">
              <span className="catalog-search-field-title">Sprache des physischen Exemplars</span>
              <select value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value })}>
                {itemLanguageOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <details className="catalog-advanced-search">
            <summary>Erweiterte Suchfunktion</summary>
            <div className="catalog-advanced-search-content">
              <label className="catalog-search-field">
                <span className="catalog-search-field-title">Setname</span>
                <input
                  value={draft.setName}
                  onChange={(event) => setDraft({ ...draft, setName: event.target.value })}
                  placeholder="z. B. Shiny Treasure ex"
                  maxLength={200}
                />
              </label>
              <label className="catalog-search-field">
                <span className="catalog-search-field-title">Englischer Pokémon-Name</span>
                <input
                  value={draft.pokemonNameEn}
                  onChange={(event) => setDraft({ ...draft, pokemonNameEn: event.target.value })}
                  placeholder="z. B. Mew"
                  maxLength={200}
                />
              </label>
            </div>
            <p className="catalog-advanced-search-note">
              Zusätzliche Kartendaten. Bei einem Katalogtreffer werden sie nach Möglichkeit automatisch übernommen und bleiben manuell editierbar.
            </p>
          </details>

          <div className="catalog-search-bar">
            <button className="button button-secondary" type="submit" disabled={catalogSearching || submitting}>
              {catalogSearching ? 'Katalog wird durchsucht …' : 'Pokémon-Katalog durchsuchen'}
            </button>
            <span>TCGdex · Katalogtreffer bleiben nur Vorschläge</span>
          </div>

          {catalogWarnings.length ? (
            <div className="alert alert-warning">{catalogWarnings.join(' · ')}</div>
          ) : null}

          {candidates.length ? (
            <div className="catalog-candidate-grid">
              {candidates.map((candidate) => (
                <article className="catalog-candidate" key={`${candidate.provider}:${candidate.providerCardId}`}>
                  <div className="catalog-candidate-image">
                    {candidate.imageUrl ? <img src={candidate.imageUrl} alt={`Referenz ${candidate.name}`} referrerPolicy="no-referrer" /> : <span>Kein Bild</span>}
                  </div>
                  <div>
                    <strong>{candidate.name}</strong>
                    <span>
                      {[candidate.setName, candidate.setCode, candidate.numberDisplay].filter(Boolean).join(' · ')}
                    </span>
                    {candidate.englishName && candidate.englishName !== candidate.name ? (
                      <small>Englisch: {candidate.englishName}</small>
                    ) : null}
                    <small>
                      {catalogProviderLabels[candidate.provider]} · {candidate.catalogLanguage.toUpperCase()} · {catalogMatchLabels[candidate.matchType]}
                    </small>
                    <small>{[candidate.rarity, candidate.category, candidate.hp ? `${candidate.hp} HP` : null].filter(Boolean).join(' · ')}</small>
                  </div>
                  <button className="button button-secondary button-small" type="button" onClick={() => chooseCandidate(candidate)}>
                    Treffer übernehmen
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          {draft.catalogProvider && draft.catalogMatchType ? (
            <div className="catalog-selected-card">
              {draft.catalogImageUrl ? <img src={draft.catalogImageUrl} alt="Ausgewählte Katalogreferenz" referrerPolicy="no-referrer" /> : null}
              <div>
                <strong>Katalogreferenz ausgewählt</strong>
                <span>{catalogProviderLabels[draft.catalogProvider]} · {catalogMatchLabels[draft.catalogMatchType]}</span>
                <small>Die Referenz beschreibt den Katalogdatensatz, nicht automatisch die Sprache oder den Zustand deines physischen Exemplars.</small>
              </div>
              <button className="button button-ghost button-small" type="button" onClick={clearCatalogMatch}>Verknüpfung entfernen</button>
            </div>
          ) : null}

          <div className="form-grid three-columns">
            <label>
              Seltenheit
              <input value={draft.rarity} onChange={(event) => setDraft({ ...draft, rarity: event.target.value })} maxLength={120} />
            </label>
            <label>
              Variante
              <input value={draft.variant} onChange={(event) => setDraft({ ...draft, variant: event.target.value })} placeholder="z. B. Holo" maxLength={120} />
            </label>
            <label>
              Menge
              <input type="number" min="1" max="999" step="1" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} required />
            </label>
            <label>
              Verkäufer-Zustand
              <input value={draft.sellerCondition} onChange={(event) => setDraft({ ...draft, sellerCondition: event.target.value })} placeholder="z. B. NM" maxLength={120} />
            </label>
            <label>
              Grading-Unternehmen
              <input value={draft.gradingCompany} onChange={(event) => setDraft({ ...draft, gradingCompany: event.target.value })} placeholder="PSA / CGC / BGS" maxLength={80} />
            </label>
            <label>
              Grade
              <input value={draft.grade} onChange={(event) => setDraft({ ...draft, grade: event.target.value })} maxLength={80} />
            </label>
            <label>
              Anteiliger Kaufpreis je Exemplar ({purchaseCurrency})
              <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.allocatedUnitCost} onChange={(event) => setDraft({ ...draft, allocatedUnitCost: event.target.value })} />
            </label>
            <label className="field-wide">
              Notizen
              <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} maxLength={4000} />
            </label>
          </div>

          <div className="form-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={() => void saveItem()}
              disabled={submitting || catalogSearching}
            >
              {submitting ? 'Speichert …' : 'Einzelkarte speichern'}
            </button>
            <button className="button button-secondary" type="button" onClick={cancelEdit} disabled={submitting}>Abbrechen</button>
          </div>

          {purchaseStatus !== 'delivered' ? (
            <p className="panel-note">
              Hinweis: {isWarehousePackage ? 'Das OLAEET-Paket' : 'Der Einkauf'} hat aktuell den Status „{purchaseStatus}“. Inventarübernahme bleibt bewusst eine manuelle Entscheidung.
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  )
}
