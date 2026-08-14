'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { purchaseStatusLabels } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { purchaseImageCategoryLabels } from '@/lib/purchase-image-categories'
import type {
  PurchaseImageCategory,
  PurchaseRow,
  PurchaseStatus,
  StagedImageInput,
} from '@/lib/types'

const purchaseStatuses = Object.keys(purchaseStatusLabels) as PurchaseStatus[]
const MAX_IMAGES = 24
const MAX_NEW_IMAGES = 12
const MAX_FILE_BYTES = 6 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const manualCategories = Object.entries(purchaseImageCategoryLabels).filter(
  ([category]) => category !== 'listing',
) as Array<[Exclude<PurchaseImageCategory, 'listing'>, string]>

const fileExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

interface ExistingPurchaseImage {
  id: string
  signedUrl: string | null
  originalFilename: string | null
  kind: 'remote' | 'manual'
  category: PurchaseImageCategory
  position: number
}

interface LocalImage {
  id: string
  file: File
  previewUrl: string
  category: Exclude<PurchaseImageCategory, 'listing'>
}

interface StagedPurchaseImage extends StagedImageInput {
  category: PurchaseImageCategory
}

function numberOrNull(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function fileExtension(mimeType: string) {
  return fileExtensions[mimeType] ?? 'bin'
}

function readableFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function PurchaseEditForm({
  purchase,
  userId,
  images,
}: {
  purchase: PurchaseRow
  userId: string
  images: ExistingPurchaseImage[]
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [localImages, setLocalImages] = useState<LocalImage[]>([])
  const localImagesRef = useRef<LocalImage[]>([])
  const [deleteManualImageIds, setDeleteManualImageIds] = useState<string[]>([])

  useEffect(() => {
    localImagesRef.current = localImages
  }, [localImages])

  useEffect(() => {
    return () => {
      localImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    }
  }, [])

  const remainingExistingImages = images.length - deleteManualImageIds.length

  function addLocalImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return

    const valid: LocalImage[] = []
    const errors: string[] = []
    const remainingByTotal = Math.max(
      0,
      MAX_IMAGES - remainingExistingImages - localImages.length,
    )
    const remaining = Math.min(
      MAX_NEW_IMAGES - localImages.length,
      remainingByTotal,
    )

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
        category: 'general',
      })
    }

    if (files.length > remaining) {
      errors.push(
        `Maximal ${MAX_NEW_IMAGES} neue und ${MAX_IMAGES} Bilder insgesamt`,
      )
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

  function updateLocalCategory(
    id: string,
    category: Exclude<PurchaseImageCategory, 'listing'>,
  ) {
    setLocalImages((current) =>
      current.map((image) => (image.id === id ? { ...image, category } : image)),
    )
  }

  function toggleExistingImageDeletion(imageId: string) {
    setDeleteManualImageIds((current) =>
      current.includes(imageId)
        ? current.filter((id) => id !== imageId)
        : [...current, imageId],
    )
  }

  async function stageLocalImages(): Promise<StagedPurchaseImage[]> {
    if (!localImages.length) return []
    const supabase = createClient()
    const uploadId = crypto.randomUUID()
    const uploaded: StagedPurchaseImage[] = []

    try {
      for (const [index, image] of localImages.entries()) {
        const extension = fileExtension(image.file.type)
        const path = `${userId}/staging/purchase-edit-${uploadId}/${String(index + 1).padStart(2, '0')}-${crypto.randomUUID()}.${extension}`
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
          category: image.category,
        })
      }
      return uploaded
    } catch (error) {
      if (uploaded.length) {
        await supabase.storage
          .from('listing-images')
          .remove(uploaded.map((item) => item.path))
      }
      throw error
    }
  }

  async function cleanupStagedImages(imagesToClean: StagedPurchaseImage[]) {
    if (!imagesToClean.length) return
    const supabase = createClient()
    await supabase.storage
      .from('listing-images')
      .remove(imagesToClean.map((image) => image.path))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    let stagedImages: StagedPurchaseImage[] = []

    try {
      const form = new FormData(event.currentTarget)
      const priceAmount = numberOrNull(form.get('priceAmount'))
      const domesticShippingAmount = numberOrNull(form.get('domesticShippingAmount'))
      const serviceFeeAmount = numberOrNull(form.get('serviceFeeAmount'))

      if ([priceAmount, domesticShippingAmount, serviceFeeAmount].some(Number.isNaN)) {
        throw new Error('Preis- und Kostenfelder müssen gültige Zahlen enthalten.')
      }

      if (remainingExistingImages + localImages.length < 1) {
        throw new Error('Mindestens ein Bild muss beim Einkauf archiviert bleiben.')
      }

      stagedImages = await stageLocalImages()

      const response = await fetch(`/api/purchases/${purchase.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: String(form.get('title') ?? ''),
          description: String(form.get('description') ?? ''),
          sellerName: String(form.get('sellerName') ?? ''),
          priceAmount,
          domesticShippingAmount,
          serviceFeeAmount,
          priceCurrency: String(form.get('priceCurrency') ?? 'KRW'),
          purchasedAt: String(form.get('purchasedAt') ?? '').trim() || null,
          status: String(form.get('status') ?? 'ordered'),
          stagedImages,
          deleteManualImageIds,
        }),
      })

      const result = (await response.json()) as { error?: string; warnings?: string[] }
      if (!response.ok) {
        await cleanupStagedImages(stagedImages)
        throw new Error(result.error || 'Der Einkauf konnte nicht aktualisiert werden.')
      }

      const warningCount = result.warnings?.length ?? 0
      router.push(
        `/purchases/${purchase.id}?updated=1${warningCount ? `&warnings=${warningCount}` : ''}`,
      )
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Der Einkauf konnte nicht aktualisiert werden.',
      )
      setSubmitting(false)
    }
  }

  return (
    <form className="page-stack" onSubmit={submit}>
      {message ? <div className="alert alert-error">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Einkaufsdaten</h2>
            <p>Die Angebots-URL bleibt unverändert. Bilder können ergänzt werden.</p>
          </div>
        </div>

        <div className="form-grid two-columns">
          <label className="field-wide">
            Titel
            <input name="title" type="text" required maxLength={300} defaultValue={purchase.title} />
          </label>

          <label>
            Verkäufer
            <input name="sellerName" type="text" maxLength={200} defaultValue={purchase.seller_name ?? ''} />
          </label>

          <label>
            Kaufdatum
            <input name="purchasedAt" type="date" defaultValue={purchase.purchased_at ?? ''} />
          </label>

          <label>
            Artikelpreis
            <input name="priceAmount" type="number" min="0" max="999999999999" step="0.01" inputMode="decimal" defaultValue={purchase.price_amount ?? ''} />
          </label>

          <label>
            Versandkosten in Korea
            <input name="domesticShippingAmount" type="number" min="0" max="999999999999" step="0.01" inputMode="decimal" defaultValue={purchase.domestic_shipping_amount ?? ''} />
          </label>

          <label>
            Service-/Zahlungsgebühren
            <input name="serviceFeeAmount" type="number" min="0" max="999999999999" step="0.01" inputMode="decimal" defaultValue={purchase.service_fee_amount ?? ''} />
          </label>

          <label>
            Währung
            <input name="priceCurrency" type="text" required minLength={3} maxLength={3} defaultValue={purchase.price_currency} autoCapitalize="characters" />
          </label>

          <label>
            Status
            <select name="status" defaultValue={purchase.status}>
              {purchaseStatuses.map((status) => (
                <option key={status} value={status}>
                  {purchaseStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="field-wide">
            Beschreibung / Notizen
            <textarea name="description" rows={8} maxLength={10_000} defaultValue={purchase.description ?? ''} />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Archivierte Einkaufsbilder</h2>
            <p>
              Manuelle Bilder können ergänzt oder entfernt werden. Automatisch archivierte
              Angebotsbilder bleiben geschützt.
            </p>
          </div>
          <span className="panel-note">
            {remainingExistingImages + localImages.length}/{MAX_IMAGES}
          </span>
        </div>

        <div className="purchase-edit-image-grid">
          {images.map((image, index) => {
            const marked = deleteManualImageIds.includes(image.id)
            return (
              <article className={marked ? 'marked-for-removal' : ''} key={image.id}>
                {image.signedUrl ? (
                  <img src={image.signedUrl} alt={`Einkaufsbild ${index + 1}`} />
                ) : (
                  <div className="missing-image">Bild nicht verfügbar</div>
                )}
                <div>
                  <strong>{image.originalFilename || `Bild ${index + 1}`}</strong>
                  <span>{purchaseImageCategoryLabels[image.category]}</span>
                  <span>
                    {image.kind === 'remote'
                      ? 'Automatisch archiviert'
                      : marked
                        ? 'Wird beim Speichern entfernt'
                        : 'Manuell hochgeladen'}
                  </span>
                </div>
                {image.kind === 'manual' ? (
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() => toggleExistingImageDeletion(image.id)}
                  >
                    {marked ? 'Behalten' : 'Entfernen'}
                  </button>
                ) : null}
              </article>
            )
          })}
        </div>

        <div className="upload-zone">
          <div>
            <h3>Weitere Bilder hinzufügen</h3>
            <p>
              Zum Beispiel Chat-Screenshots, vom Verkäufer gesendete Detailbilder,
              Zahlungsbelege oder Versandnachweise. JPEG, PNG, WebP oder GIF; maximal 6 MB.
            </p>
          </div>
          <label className="button button-secondary file-button">
            Dateien wählen
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={addLocalImages}
            />
          </label>
        </div>

        {localImages.length ? (
          <div className="local-image-list purchase-new-image-list">
            {localImages.map((image) => (
              <article key={image.id}>
                <img src={image.previewUrl} alt={image.file.name} />
                <div>
                  <strong>{image.file.name}</strong>
                  <span>{readableFileSize(image.file.size)}</span>
                  <label>
                    Bildtyp
                    <select
                      value={image.category}
                      onChange={(event) =>
                        updateLocalCategory(
                          image.id,
                          event.target.value as Exclude<PurchaseImageCategory, 'listing'>,
                        )
                      }
                    >
                      {manualCategories.map(([category, label]) => (
                        <option key={category} value={category}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button className="button button-ghost button-small" type="button" onClick={() => removeLocalImage(image.id)}>
                  Entfernen
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel provenance-panel">
        <div>
          <span className="section-label">Importquelle</span>
          <strong>Bunjang {purchase.source_listing_id ? `#${purchase.source_listing_id}` : ''}</strong>
        </div>
        <a className="text-link" href={purchase.canonical_url || purchase.listing_url} target="_blank" rel="noreferrer">
          Originalangebot öffnen ↗
        </a>
      </section>

      <div className="form-actions">
        <Link className="button button-secondary" href={`/purchases/${purchase.id}`}>
          Abbrechen
        </Link>
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Speichert …' : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  )
}
