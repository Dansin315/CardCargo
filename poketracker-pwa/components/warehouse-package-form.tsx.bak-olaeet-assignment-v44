'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { purchaseImageCategoryLabels } from '@/lib/purchase-image-categories'
import type { StagedImageInput } from '@/lib/types'
import {
  addDaysToDate,
  filterPurchaseImagesForSelection,
  isValidDateOnly,
  packageStatusLabels,
  packageStatuses,
  toDateInput,
  type PackagePurchaseChoice,
  type PackagePurchaseImageChoice,
  type WarehousePackageManualImageChoice,
  type WarehousePackageRow,
} from '@/lib/warehouse-packages'

const MAX_MANUAL_IMAGES = 12
const MAX_FILE_BYTES = 6 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const fileExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

interface LocalImage {
  id: string
  file: File
  previewUrl: string
}

type Props = {
  mode: 'create' | 'edit'
  userId: string
  packageData?: WarehousePackageRow
  purchases: PackagePurchaseChoice[]
  purchaseImages: PackagePurchaseImageChoice[]
  manualImages?: WarehousePackageManualImageChoice[]
  selectedPurchaseIds?: string[]
}

function numberOrNull(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function textOrNull(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function dateOrNull(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return isValidDateOnly(normalized) ? normalized : 'invalid'
}

function fileExtension(mimeType: string) {
  return fileExtensions[mimeType] ?? 'bin'
}

function readableFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function WarehousePackageForm({
  mode,
  userId,
  packageData,
  purchases,
  purchaseImages,
  manualImages = [],
  selectedPurchaseIds = [],
}: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [arrivedAt, setArrivedAt] = useState(toDateInput(packageData?.arrived_at))
  const [selectedPurchases, setSelectedPurchases] = useState<string[]>(selectedPurchaseIds)
  const [removedManualImageIds, setRemovedManualImageIds] = useState<string[]>([])
  const [localImages, setLocalImages] = useState<LocalImage[]>([])
  const localImagesRef = useRef<LocalImage[]>([])
  const storageDeadlineAt = addDaysToDate(arrivedAt, 80)

  useEffect(() => {
    localImagesRef.current = localImages
  }, [localImages])

  useEffect(() => {
    return () => {
      localImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    }
  }, [])

  function togglePurchase(purchaseId: string) {
    setSelectedPurchases((current) =>
      current.includes(purchaseId)
        ? current.filter((id) => id !== purchaseId)
        : [...current, purchaseId],
    )
  }

  function toggleExistingManualImage(imageId: string) {
    setRemovedManualImageIds((current) =>
      current.includes(imageId)
        ? current.filter((id) => id !== imageId)
        : [...current, imageId],
    )
  }

  function addLocalImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return

    const remainingExisting = manualImages.filter(
      (image) => !removedManualImageIds.includes(image.id),
    ).length
    const remaining = Math.max(0, MAX_MANUAL_IMAGES - remainingExisting - localImages.length)
    const valid: LocalImage[] = []
    const errors: string[] = []

    for (const file of files.slice(0, remaining)) {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        errors.push(`${file.name}: Dateityp nicht unterstützt`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name}: größer als 6 MB`)
        continue
      }
      valid.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })
    }

    if (files.length > remaining) {
      errors.push(`Maximal ${MAX_MANUAL_IMAGES} manuelle Paketbilder`)
    }
    setLocalImages((current) => [...current, ...valid])
    setMessage(errors.length ? errors.join(' · ') : null)
    event.target.value = ''
  }

  function removeLocalImage(id: string) {
    setLocalImages((current) => {
      const target = current.find((image) => image.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((image) => image.id !== id)
    })
  }

  async function stageLocalImages(): Promise<StagedImageInput[]> {
    if (!localImages.length) return []
    const supabase = createClient()
    const uploadId = crypto.randomUUID()
    const uploaded: StagedImageInput[] = []

    try {
      for (const [index, image] of localImages.entries()) {
        const extension = fileExtension(image.file.type)
        const path = `${userId}/staging/warehouse-packages/${uploadId}/${String(index + 1).padStart(2, '0')}-${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage.from('listing-images').upload(path, image.file, {
          contentType: image.file.type,
          cacheControl: '3600',
          upsert: false,
        })
        if (error) throw new Error(`${image.file.name}: ${error.message}`)
        uploaded.push({
          path,
          originalName: image.file.name,
          mimeType: image.file.type,
          byteSize: image.file.size,
        })
      }
      return uploaded
    } catch (error) {
      if (uploaded.length) {
        await supabase.storage.from('listing-images').remove(uploaded.map((image) => image.path))
      }
      throw error
    }
  }

  async function cleanupStagedImages(images: StagedImageInput[]) {
    if (!images.length) return
    const supabase = createClient()
    await supabase.storage.from('listing-images').remove(images.map((image) => image.path))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    let stagedImages: StagedImageInput[] = []

    try {
      const form = new FormData(event.currentTarget)
      const numericValues = {
        weightGrams: numberOrNull(form.get('weightGrams')),
        lengthCm: numberOrNull(form.get('lengthCm')),
        widthCm: numberOrNull(form.get('widthCm')),
        heightCm: numberOrNull(form.get('heightCm')),
      }
      if (Object.values(numericValues).some(Number.isNaN)) {
        throw new Error('Gewicht und Maße müssen gültige Zahlen enthalten.')
      }

      const dateValues = {
        arrivedAt: dateOrNull(form.get('arrivedAt')),
        inspectedAt: dateOrNull(form.get('inspectedAt')),
        storageStartedAt: dateOrNull(form.get('storageStartedAt')),
      }
      if (Object.values(dateValues).includes('invalid')) {
        throw new Error('Mindestens ein Datum ist ungültig.')
      }

      stagedImages = await stageLocalImages()
      const endpoint =
        mode === 'create'
          ? '/api/warehouse-packages'
          : `/api/warehouse-packages/${packageData?.id}`
      const response = await fetch(endpoint, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          externalPackageId: textOrNull(form.get('externalPackageId')),
          customerCode: textOrNull(form.get('customerCode')),
          domesticTrackingNumber: textOrNull(form.get('domesticTrackingNumber')),
          domesticCarrier: textOrNull(form.get('domesticCarrier')),
          senderName: textOrNull(form.get('senderName')),
          packageDescription: textOrNull(form.get('packageDescription')),
          providerStatus: textOrNull(form.get('providerStatus')),
          status: String(form.get('status') ?? 'expected'),
          ...numericValues,
          ...dateValues,
          notes: textOrNull(form.get('notes')),
          purchaseIds: selectedPurchases,
          stagedImages,
          removeManualImageIds: removedManualImageIds,
        }),
      })

      const result = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !result.id) {
        await cleanupStagedImages(stagedImages)
        throw new Error(result.error || 'Das OLAEET-Paket konnte nicht gespeichert werden.')
      }

      router.push(
        `/warehouse-packages/${result.id}?${mode === 'create' ? 'created' : 'updated'}=1`,
      )
      router.refresh()
    } catch (error) {
      if (stagedImages.length) await cleanupStagedImages(stagedImages)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Das OLAEET-Paket konnte nicht gespeichert werden.',
      )
      setSubmitting(false)
    }
  }

  const cancelHref = packageData ? `/warehouse-packages/${packageData.id}` : '/warehouse-packages'
  const selectedPurchaseImages = filterPurchaseImagesForSelection(
    purchaseImages,
    selectedPurchases,
  )
  const visibleManualImages = manualImages.filter(
    (image) => !removedManualImageIds.includes(image.id),
  )

  return (
    <form className="page-stack" onSubmit={submit}>
      {message ? <div className="alert alert-error">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Paketidentifikation</h2>
            <p>Mindestens Paket-ID oder koreanische Trackingnummer erfassen.</p>
          </div>
        </div>
        <div className="form-grid two-columns">
          <label>
            OLAEET-Paket-ID
            <input name="externalPackageId" type="text" maxLength={200} defaultValue={packageData?.external_package_id ?? ''} />
          </label>
          <label>
            Kundencode / Suite-Code
            <input name="customerCode" type="text" maxLength={100} defaultValue={packageData?.customer_code ?? ''} />
          </label>
          <label>
            Koreanische Trackingnummer
            <input name="domesticTrackingNumber" type="text" maxLength={200} defaultValue={packageData?.domestic_tracking_number ?? ''} />
          </label>
          <label>
            Koreanischer Paketdienst
            <input name="domesticCarrier" type="text" maxLength={120} placeholder="z. B. CJ Logistics" defaultValue={packageData?.domestic_carrier ?? ''} />
          </label>
          <label>
            Händler / Absender
            <input name="senderName" type="text" maxLength={200} defaultValue={packageData?.sender_name ?? ''} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={packageData?.status ?? 'expected'}>
              {packageStatuses.map((status) => (
                <option key={status} value={status}>{packageStatusLabels[status]}</option>
              ))}
            </select>
          </label>
          <label className="field-wide">
            Paketbeschreibung
            <textarea name="packageDescription" rows={3} maxLength={2_000} defaultValue={packageData?.package_description ?? ''} />
          </label>
          <label className="field-wide">
            OLAEET-Originalstatus
            <input name="providerStatus" type="text" maxLength={200} placeholder="Originalbezeichnung aus OLAEET" defaultValue={packageData?.provider_status ?? ''} />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Eingang, Inspektion und Lagerung</h2>
            <p>Kalendertage sowie von OLAEET gemessene Paketdaten.</p>
          </div>
        </div>
        <div className="form-grid two-columns">
          <label>
            Eingang bei OLAEET
            <input name="arrivedAt" type="date" value={arrivedAt} onChange={(event) => setArrivedAt(event.target.value)} />
          </label>
          <label>
            Inspektionsdatum
            <input name="inspectedAt" type="date" defaultValue={toDateInput(packageData?.inspected_at)} />
          </label>
          <label>
            Lagerbeginn
            <input name="storageStartedAt" type="date" defaultValue={toDateInput(packageData?.storage_started_at)} />
          </label>
          <label>
            Lagerfrist
            <input type="date" value={storageDeadlineAt} readOnly aria-describedby="storage-deadline-help" />
            <small id="storage-deadline-help">Automatisch: 80 Kalendertage nach dem Eingang bei OLAEET.</small>
          </label>
          <label>
            Gewicht in Gramm
            <input name="weightGrams" type="number" min="0" max="1000000" step="0.01" inputMode="decimal" defaultValue={packageData?.weight_grams ?? ''} />
          </label>
          <div className="dimension-grid field-wide">
            <label>
              Länge (cm)
              <input name="lengthCm" type="number" min="0" max="10000" step="0.01" inputMode="decimal" defaultValue={packageData?.length_cm ?? ''} />
            </label>
            <label>
              Breite (cm)
              <input name="widthCm" type="number" min="0" max="10000" step="0.01" inputMode="decimal" defaultValue={packageData?.width_cm ?? ''} />
            </label>
            <label>
              Höhe (cm)
              <input name="heightCm" type="number" min="0" max="10000" step="0.01" inputMode="decimal" defaultValue={packageData?.height_cm ?? ''} />
            </label>
          </div>
          <label className="field-wide">
            Notizen
            <textarea name="notes" rows={5} maxLength={10_000} defaultValue={packageData?.notes ?? ''} />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Enthaltene Einkäufe</h2>
            <p>Ausgewählte Einkäufe zeigen ihre archivierten Bunjang-Bilder direkt darunter.</p>
          </div>
          <span className="panel-note">{purchases.length} verfügbar</span>
        </div>
        {purchases.length ? (
          <div className="purchase-checklist">
            {purchases.map((purchase) => (
              <label className="purchase-check" key={purchase.id}>
                <input
                  name="purchaseIds"
                  type="checkbox"
                  value={purchase.id}
                  checked={selectedPurchases.includes(purchase.id)}
                  onChange={() => togglePurchase(purchase.id)}
                />
                <span>
                  <strong>{purchase.title}</strong>
                  <small>
                    {purchase.source_listing_id ? `Bunjang #${purchase.source_listing_id}` : 'Manuell'}
                    {' · '}
                    {purchase.purchased_at || 'ohne Kaufdatum'}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Keine zuweisbaren Einkäufe vorhanden. Bereits anderen OLAEET-Paketen zugeordnete Einkäufe werden hier nicht angezeigt.</p>
          </div>
        )}

        {selectedPurchases.length ? (
          <div className="package-inherited-images">
            <span className="section-label">Bilder der ausgewählten Einkäufe</span>
            {selectedPurchaseImages.length ? (
              <div className="detail-gallery compact-gallery">
                {selectedPurchaseImages.map((image) => {
                  const purchase = purchases.find((item) => item.id === image.purchase_id)
                  return (
                    <figure key={image.id}>
                      {image.signed_url ? (
                        <img src={image.signed_url} alt={`Angebotsbild von ${purchase?.title ?? 'Einkauf'}`} />
                      ) : (
                        <div className="missing-image">Bild nicht verfügbar</div>
                      )}
                      <figcaption>
                        <span>{purchase?.title ?? 'Bunjang-Einkauf'}</span>
                        <span>{purchaseImageCategoryLabels[image.category]} · über Einkaufszuordnung</span>
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            ) : (
              <p className="muted-copy">Für die ausgewählten Einkäufe sind keine Bilder verfügbar.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Manuelle OLAEET-Paketbilder</h2>
            <p>Zum Beispiel OLAEET-Fotos, Inspektionsbilder oder eigene Paketaufnahmen.</p>
          </div>
          <span className="panel-note">
            {visibleManualImages.length + localImages.length}/{MAX_MANUAL_IMAGES}
          </span>
        </div>

        {manualImages.length ? (
          <div className="detail-gallery compact-gallery">
            {manualImages.map((image) => {
              const removed = removedManualImageIds.includes(image.id)
              return (
                <figure className={removed ? 'image-marked-for-removal' : undefined} key={image.id}>
                  {image.signed_url ? (
                    <img src={image.signed_url} alt={image.original_filename || 'Manuelles OLAEET-Paketbild'} />
                  ) : (
                    <div className="missing-image">Bild nicht verfügbar</div>
                  )}
                  <figcaption>
                    <span>{image.original_filename || `Paketbild ${image.position}`}</span>
                    <button
                      className="button button-ghost button-small"
                      type="button"
                      onClick={() => toggleExistingManualImage(image.id)}
                    >
                      {removed ? 'Behalten' : 'Entfernen'}
                    </button>
                  </figcaption>
                </figure>
              )
            })}
          </div>
        ) : null}

        <div className="upload-zone">
          <div>
            <strong>Bilder hinzufügen</strong>
            <span>JPEG, PNG, WebP oder GIF; maximal 6 MB je Datei.</span>
          </div>
          <label className="button button-secondary">
            Dateien wählen
            <input
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={addLocalImages}
              disabled={visibleManualImages.length + localImages.length >= MAX_MANUAL_IMAGES}
            />
          </label>
        </div>

        {localImages.length ? (
          <div className="local-image-list">
            {localImages.map((image) => (
              <article key={image.id}>
                <img src={image.previewUrl} alt={image.file.name} />
                <div>
                  <strong>{image.file.name}</strong>
                  <span>{readableFileSize(image.file.size)}</span>
                </div>
                <button className="button button-ghost button-small" type="button" onClick={() => removeLocalImage(image.id)}>
                  Entfernen
                </button>
              </article>
            ))}
          </div>
        ) : null}

        <p className="muted-copy">
          Diese Bilder gehören direkt zum OLAEET-Paket. Sie bleiben erhalten, wenn ein Bunjang-Einkauf aus dem Paket entfernt wird.
        </p>
      </section>

      <div className="form-actions">
        <Link className="button button-secondary" href={cancelHref}>Abbrechen</Link>
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Speichert …' : mode === 'create' ? 'OLAEET-Paket speichern' : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  )
}
