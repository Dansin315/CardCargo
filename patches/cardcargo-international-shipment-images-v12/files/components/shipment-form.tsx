'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { formatDate } from '@/lib/format'
import { purchaseImageCategoryLabels } from '@/lib/purchase-image-categories'
import {
  filterShipmentLinkedImagesForSelection,
  shipmentCurrencies,
  shipmentImageCategories,
  shipmentImageCategoryLabels,
  shipmentStatusLabels,
  shipmentStatuses,
  shippingServiceLabels,
  shippingServices,
  type ShipmentImageCategory,
  type ShipmentLinkedImageChoice,
  type ShipmentManualImageChoice,
  type ShipmentRow,
  type ShipmentWarehousePackageChoice,
  type StagedShipmentImageInput,
} from '@/lib/shipments'
import { createClient } from '@/lib/supabase/client'
import { packageStatusLabels, toDateInput } from '@/lib/warehouse-packages'

const MAX_NEW_IMAGES = 12
const MAX_TOTAL_IMAGES = 24
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
  category: ShipmentImageCategory
}

type Props = {
  mode: 'create' | 'edit'
  userId: string
  shipmentData?: ShipmentRow
  packages: ShipmentWarehousePackageChoice[]
  linkedImages?: ShipmentLinkedImageChoice[]
  manualImages?: ShipmentManualImageChoice[]
  selectedWarehousePackageIds?: string[]
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
  return normalized || null
}

function fileExtension(mimeType: string) {
  return fileExtensions[mimeType] ?? 'bin'
}

function linkedImageLabel(image: ShipmentLinkedImageChoice) {
  if (image.source === 'warehouse_package') return 'Manuelles OLAEET-Paketbild'
  return purchaseImageCategoryLabels[image.category as keyof typeof purchaseImageCategoryLabels]
}

export function ShipmentForm({
  mode,
  userId,
  shipmentData,
  packages,
  linkedImages = [],
  manualImages = [],
  selectedWarehousePackageIds = [],
}: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedPackages, setSelectedPackages] = useState<string[]>(
    selectedWarehousePackageIds,
  )
  const [removedManualImageIds, setRemovedManualImageIds] = useState<string[]>([])
  const [localImages, setLocalImages] = useState<LocalImage[]>([])
  const localImagesRef = useRef<LocalImage[]>([])
  const [totalWeight, setTotalWeight] = useState(
    shipmentData?.total_weight_grams === null ||
      shipmentData?.total_weight_grams === undefined
      ? ''
      : String(shipmentData.total_weight_grams),
  )

  useEffect(() => {
    localImagesRef.current = localImages
  }, [localImages])

  useEffect(() => {
    return () => {
      localImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    }
  }, [])

  const selectedWeight = useMemo(
    () =>
      packages
        .filter((warehousePackage) => selectedPackages.includes(warehousePackage.id))
        .reduce((sum, warehousePackage) => sum + Number(warehousePackage.weight_grams || 0), 0),
    [packages, selectedPackages],
  )

  const visibleLinkedImages = filterShipmentLinkedImagesForSelection(
    linkedImages,
    selectedPackages,
  )
  const visibleManualImages = manualImages.filter(
    (image) => !removedManualImageIds.includes(image.id),
  )

  function togglePackage(packageId: string) {
    setSelectedPackages((current) =>
      current.includes(packageId)
        ? current.filter((id) => id !== packageId)
        : [...current, packageId],
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

    const totalRemaining = Math.max(
      0,
      MAX_TOTAL_IMAGES - visibleManualImages.length - localImages.length,
    )
    const allowedCount = Math.min(MAX_NEW_IMAGES - localImages.length, totalRemaining)
    const valid: LocalImage[] = []
    const errors: string[] = []

    for (const file of files.slice(0, allowedCount)) {
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

    if (files.length > allowedCount) {
      errors.push(
        `Maximal ${MAX_NEW_IMAGES} neue und ${MAX_TOTAL_IMAGES} eigene Sendungsbilder insgesamt`,
      )
    }

    setLocalImages((current) => [...current, ...valid])
    setMessage(errors.length ? errors.join(' · ') : null)
    event.target.value = ''
  }

  function updateLocalImageCategory(id: string, category: ShipmentImageCategory) {
    setLocalImages((current) =>
      current.map((image) => (image.id === id ? { ...image, category } : image)),
    )
  }

  function removeLocalImage(id: string) {
    setLocalImages((current) => {
      const target = current.find((image) => image.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((image) => image.id !== id)
    })
  }

  async function stageLocalImages(): Promise<StagedShipmentImageInput[]> {
    if (!localImages.length) return []
    const supabase = createClient()
    const uploadId = crypto.randomUUID()
    const uploaded: StagedShipmentImageInput[] = []

    try {
      for (const [index, image] of localImages.entries()) {
        const extension = fileExtension(image.file.type)
        const path = `${userId}/staging/shipments/${uploadId}/${String(index + 1).padStart(2, '0')}-${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage
          .from('listing-images')
          .upload(path, image.file, {
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
          .remove(uploaded.map((image) => image.path))
      }
      throw error
    }
  }

  async function cleanupStagedImages(images: StagedShipmentImageInput[]) {
    if (!images.length) return
    const supabase = createClient()
    await supabase.storage.from('listing-images').remove(images.map((image) => image.path))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    let stagedImages: StagedShipmentImageInput[] = []

    try {
      const form = new FormData(event.currentTarget)
      const numericValues = {
        totalWeightGrams: numberOrNull(form.get('totalWeightGrams')),
        internationalShippingAmount: numberOrNull(
          form.get('internationalShippingAmount'),
        ),
        forwardingFeeAmount: numberOrNull(form.get('forwardingFeeAmount')),
        importTaxAmount: numberOrNull(form.get('importTaxAmount')),
      }

      if (Object.values(numericValues).some(Number.isNaN)) {
        throw new Error('Gewicht und Kosten müssen gültige Zahlen enthalten.')
      }

      stagedImages = await stageLocalImages()
      const endpoint =
        mode === 'create' ? '/api/shipments' : `/api/shipments/${shipmentData?.id}`
      const response = await fetch(endpoint, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          externalShipmentId: textOrNull(form.get('externalShipmentId')),
          shippingService: String(form.get('shippingService') ?? ''),
          trackingNumber: textOrNull(form.get('trackingNumber')),
          status: String(form.get('status') ?? 'draft'),
          shippedAt: dateOrNull(form.get('shippedAt')),
          estimatedDeliveryAt: dateOrNull(form.get('estimatedDeliveryAt')),
          deliveredAt: dateOrNull(form.get('deliveredAt')),
          ...numericValues,
          currency: String(form.get('currency') ?? 'KRW'),
          notes: textOrNull(form.get('notes')),
          warehousePackageIds: selectedPackages,
          stagedImages,
          removeManualImageIds: removedManualImageIds,
        }),
      })

      const result = (await response.json()) as {
        id?: string
        error?: string
        warnings?: string[]
      }
      if (!response.ok || !result.id) {
        await cleanupStagedImages(stagedImages)
        throw new Error(
          result.error || 'Die internationale Sendung konnte nicht gespeichert werden.',
        )
      }

      router.push(`/shipments/${result.id}?${mode === 'create' ? 'created' : 'updated'}=1`)
      router.refresh()
    } catch (error) {
      if (stagedImages.length) await cleanupStagedImages(stagedImages)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Die internationale Sendung konnte nicht gespeichert werden.',
      )
      setSubmitting(false)
    }
  }

  const cancelHref = shipmentData ? `/shipments/${shipmentData.id}` : '/shipments'

  return (
    <form className="page-stack" onSubmit={submit}>
      {message ? <div className="alert alert-error">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Sendungsidentifikation</h2>
            <p>Versanddienst, Trackingnummer und aktueller Status.</p>
          </div>
        </div>
        <div className="form-grid two-columns">
          <label>
            OLAEET-Sendungs-ID
            <input
              name="externalShipmentId"
              type="text"
              maxLength={200}
              defaultValue={shipmentData?.external_shipment_id ?? ''}
            />
          </label>
          <label>
            Versanddienst
            <select
              name="shippingService"
              defaultValue={shipmentData?.shipping_service ?? 'fedex_priority'}
            >
              {shippingServices.map((service) => (
                <option key={service} value={service}>
                  {shippingServiceLabels[service]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Internationale Trackingnummer
            <input
              name="trackingNumber"
              type="text"
              maxLength={250}
              defaultValue={shipmentData?.tracking_number ?? ''}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={shipmentData?.status ?? 'draft'}>
              {shipmentStatuses.map((status) => (
                <option key={status} value={status}>
                  {shipmentStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Versanddatum
            <input
              name="shippedAt"
              type="date"
              defaultValue={toDateInput(shipmentData?.shipped_at)}
            />
          </label>
          <label>
            Voraussichtliche Lieferung
            <input
              name="estimatedDeliveryAt"
              type="date"
              defaultValue={toDateInput(shipmentData?.estimated_delivery_at)}
            />
          </label>
          <label>
            Tatsächliche Lieferung
            <input
              name="deliveredAt"
              type="date"
              defaultValue={toDateInput(shipmentData?.delivered_at)}
            />
          </label>
          <label>
            Gesamtgewicht in Gramm
            <input
              name="totalWeightGrams"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              inputMode="decimal"
              value={totalWeight}
              onChange={(event) => setTotalWeight(event.target.value)}
            />
            <button
              className="button button-ghost button-small inline-field-action"
              type="button"
              onClick={() => setTotalWeight(selectedWeight ? String(selectedWeight) : '')}
              disabled={!selectedPackages.length}
            >
              Summe der Paketgewichte übernehmen
            </button>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Kosten</h2>
            <p>Alle Beträge dieser Sendung werden in derselben Währung geführt.</p>
          </div>
        </div>
        <div className="form-grid two-columns">
          <label>
            Internationale Versandkosten
            <input
              name="internationalShippingAmount"
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              inputMode="decimal"
              defaultValue={shipmentData?.international_shipping_amount ?? ''}
            />
          </label>
          <label>
            OLAEET-Servicegebühren
            <input
              name="forwardingFeeAmount"
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              inputMode="decimal"
              defaultValue={shipmentData?.forwarding_fee_amount ?? ''}
            />
          </label>
          <label>
            Zoll- und Einfuhrkosten
            <input
              name="importTaxAmount"
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              inputMode="decimal"
              defaultValue={shipmentData?.import_tax_amount ?? ''}
            />
          </label>
          <label>
            Währung
            <select name="currency" defaultValue={shipmentData?.currency ?? 'KRW'}>
              {shipmentCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="field-wide">
            Notizen
            <textarea
              name="notes"
              rows={5}
              maxLength={10_000}
              defaultValue={shipmentData?.notes ?? ''}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Enthaltene OLAEET-Pakete</h2>
            <p>
              Bereits anderen Sendungen zugeordnete Pakete werden nicht angeboten. Wird eine
              Zuordnung entfernt, ist das Paket wieder auswählbar.
            </p>
          </div>
          <span className="panel-note">{packages.length} verfügbar</span>
        </div>

        {packages.length ? (
          <div className="purchase-checklist">
            {packages.map((warehousePackage) => (
              <label className="purchase-check shipment-package-check" key={warehousePackage.id}>
                <input
                  name="warehousePackageIds"
                  type="checkbox"
                  value={warehousePackage.id}
                  checked={selectedPackages.includes(warehousePackage.id)}
                  onChange={() => togglePackage(warehousePackage.id)}
                />
                <span>
                  <strong>
                    {warehousePackage.external_package_id ||
                      warehousePackage.domestic_tracking_number ||
                      'OLAEET-Paket'}
                  </strong>
                  <small>
                    {warehousePackage.sender_name || 'Absender nicht erfasst'} ·{' '}
                    {packageStatusLabels[warehousePackage.status]} ·{' '}
                    {formatDate(warehousePackage.arrived_at)} ·{' '}
                    {warehousePackage.weight_grams === null
                      ? 'Gewicht unbekannt'
                      : `${Number(warehousePackage.weight_grams).toLocaleString('de-DE')} g`}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Es ist momentan kein nicht zugeordnetes OLAEET-Paket verfügbar.</p>
            <Link className="button button-secondary" href="/warehouse-packages/new">
              OLAEET-Paket erfassen
            </Link>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Dynamisch eingeblendete Bilder</h2>
            <p>
              Bilder aus den ausgewählten OLAEET-Paketen und deren Bunjang-Einkäufen. Sie werden
              nicht kopiert und verschwinden automatisch, wenn ein Paket entfernt wird.
            </p>
          </div>
          <span className="panel-note">{visibleLinkedImages.length} Bilder</span>
        </div>

        {visibleLinkedImages.length ? (
          <div className="shipment-image-grid">
            {visibleLinkedImages.map((image) => (
              <article className="shipment-image-card" key={image.id}>
                {image.signed_url ? (
                  <img src={image.signed_url} alt={image.original_filename || image.package_label} />
                ) : null}
                <div>
                  <strong>{image.package_label}</strong>
                  <small>{linkedImageLabel(image)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>Für die aktuell ausgewählten Pakete sind keine Bilder vorhanden.</p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Eigene Sendungsbilder</h2>
            <p>
              Konsolidierungsfoto, Versandkarton, Etikett, Zolldokument oder Schadensnachweis.
              Diese Bilder bleiben unabhängig von den Paketzuordnungen bestehen.
            </p>
          </div>
          <span className="panel-note">
            {visibleManualImages.length + localImages.length}/{MAX_TOTAL_IMAGES}
          </span>
        </div>

        {visibleManualImages.length || localImages.length ? (
          <div className="shipment-image-grid">
            {visibleManualImages.map((image) => (
              <article className="shipment-image-card editable-image" key={image.id}>
                {image.signed_url ? (
                  <img src={image.signed_url} alt={image.original_filename || 'Sendungsbild'} />
                ) : null}
                <div>
                  <strong>{shipmentImageCategoryLabels[image.category]}</strong>
                  <small>{image.original_filename || 'Manuell hochgeladen'}</small>
                  <button
                    className="text-button danger-text"
                    type="button"
                    onClick={() => toggleExistingManualImage(image.id)}
                  >
                    Zum Löschen markieren
                  </button>
                </div>
              </article>
            ))}

            {localImages.map((image) => (
              <article className="shipment-image-card editable-image" key={image.id}>
                <img src={image.previewUrl} alt={image.file.name} />
                <div>
                  <label>
                    Bildtyp
                    <select
                      value={image.category}
                      onChange={(event) =>
                        updateLocalImageCategory(
                          image.id,
                          event.target.value as ShipmentImageCategory,
                        )
                      }
                    >
                      {shipmentImageCategories.map((category) => (
                        <option key={category} value={category}>
                          {shipmentImageCategoryLabels[category]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>{image.file.name}</small>
                  <button
                    className="text-button danger-text"
                    type="button"
                    onClick={() => removeLocalImage(image.id)}
                  >
                    Entfernen
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        <label className="file-drop-field">
          <span>
            <strong>Versandbilder hinzufügen</strong>
            <small>JPEG, PNG, WebP oder GIF; maximal 6 MB je Datei.</small>
          </span>
          <span className="button button-secondary">Dateien wählen</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={addLocalImages}
          />
        </label>
      </section>

      <div className="form-actions">
        <Link className="button button-secondary" href={cancelHref}>
          Abbrechen
        </Link>
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting
            ? 'Speichert …'
            : mode === 'create'
              ? 'Sendung speichern'
              : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  )
}
