import 'server-only'

import { randomUUID } from 'node:crypto'
import { inspectImageBytes } from '@/lib/importer/download-image'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'listing-images'
export const MAX_INVENTORY_IMAGES = 24
export const MAX_NEW_INVENTORY_IMAGES = 12

export interface StagedInventoryImageInput {
  path: string
  originalName: string
  mimeType: string
  byteSize: number
}

export interface InventorySourceImageSelection {
  sourceType: 'purchase' | 'warehouse_package'
  sourceImageId: string
}

function validateStagedPath(userId: string, path: string) {
  const prefix = `${userId}/staging/inventory/`
  if (!path.startsWith(prefix) || path.includes('..')) {
    throw new Error('Ungültiger temporärer Bildpfad.')
  }
}

async function removeStorage(paths: string[]) {
  const unique = [...new Set(paths)].filter(Boolean)
  if (!unique.length) return
  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove(unique)
}

async function resolveAllowedSourceImages({
  userId,
  inventoryUnitId,
  selections,
}: {
  userId: string
  inventoryUnitId: string
  selections: InventorySourceImageSelection[]
}) {
  if (!selections.length) return []

  const admin = createAdminClient()
  const { data: unit, error: unitError } = await admin
    .from('inventory_units')
    .select('id, purchase_item_id')
    .eq('id', inventoryUnitId)
    .eq('user_id', userId)
    .single()

  if (unitError || !unit) throw new Error('Inventareintrag wurde nicht gefunden.')
  if (!unit.purchase_item_id) return []

  const { data: item, error: itemError } = await admin
    .from('purchase_items')
    .select('id, purchase_id, warehouse_package_id')
    .eq('id', unit.purchase_item_id)
    .eq('user_id', userId)
    .single()

  if (itemError || !item) throw new Error('Zugehörige Kartenposition wurde nicht gefunden.')

  let linkedPackageId = item.warehouse_package_id as string | null
  if (!linkedPackageId && item.purchase_id) {
    const { data: link, error: linkError } = await admin
      .from('warehouse_package_purchases')
      .select('warehouse_package_id')
      .eq('purchase_id', item.purchase_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (linkError) throw new Error(linkError.message)
    linkedPackageId = link?.warehouse_package_id ?? null
  }

  const purchaseIds = selections
    .filter((selection) => selection.sourceType === 'purchase')
    .map((selection) => selection.sourceImageId)
  const packageIds = selections
    .filter((selection) => selection.sourceType === 'warehouse_package')
    .map((selection) => selection.sourceImageId)

  const results: Array<{
    sourceType: 'purchase' | 'warehouse_package'
    sourceImageId: string
    storagePath: string
    originalFilename: string | null
  }> = []

  if (purchaseIds.length && item.purchase_id) {
    const { data, error } = await admin
      .from('purchase_images')
      .select('id, purchase_id, storage_path, original_filename')
      .eq('purchase_id', item.purchase_id)
      .eq('user_id', userId)
      .in('id', purchaseIds)

    if (error) throw new Error(error.message)
    results.push(
      ...(data ?? []).map((image) => ({
        sourceType: 'purchase' as const,
        sourceImageId: image.id,
        storagePath: image.storage_path,
        originalFilename: image.original_filename,
      })),
    )
  }

  if (packageIds.length && linkedPackageId) {
    const { data, error } = await admin
      .from('warehouse_package_images')
      .select('id, warehouse_package_id, storage_path, original_filename')
      .eq('warehouse_package_id', linkedPackageId)
      .eq('user_id', userId)
      .in('id', packageIds)

    if (error) throw new Error(error.message)
    results.push(
      ...(data ?? []).map((image) => ({
        sourceType: 'warehouse_package' as const,
        sourceImageId: image.id,
        storagePath: image.storage_path,
        originalFilename: image.original_filename,
      })),
    )
  }

  return results
}

export async function archiveInventoryUnitImages({
  userId,
  inventoryUnitId,
  stagedImages,
  sourceSelections,
}: {
  userId: string
  inventoryUnitId: string
  stagedImages: StagedInventoryImageInput[]
  sourceSelections: InventorySourceImageSelection[]
}) {
  if (stagedImages.length > MAX_NEW_INVENTORY_IMAGES) {
    throw new Error(`Pro Vorgang können höchstens ${MAX_NEW_INVENTORY_IMAGES} neue Bilder hochgeladen werden.`)
  }

  stagedImages.forEach((image) => validateStagedPath(userId, image.path))

  const admin = createAdminClient()
  const { data: existing, error: existingError } = await admin
    .from('inventory_unit_images')
    .select('id, sha256, position')
    .eq('inventory_unit_id', inventoryUnitId)
    .eq('user_id', userId)
    .order('position', { ascending: false })

  if (existingError) throw new Error(existingError.message)

  const sourceImages = await resolveAllowedSourceImages({
    userId,
    inventoryUnitId,
    selections: sourceSelections,
  })

  if ((existing?.length ?? 0) + stagedImages.length + sourceImages.length > MAX_INVENTORY_IMAGES) {
    throw new Error(`Ein Inventareintrag kann höchstens ${MAX_INVENTORY_IMAGES} Bilder enthalten.`)
  }

  const knownHashes = new Set(
    (existing ?? []).map((row) => row.sha256).filter((value): value is string => Boolean(value)),
  )
  const createdPaths: string[] = []
  const stagedPaths = stagedImages.map((image) => image.path)
  const rows: Array<Record<string, unknown>> = []
  let position = Number(existing?.[0]?.position ?? 0)
  const warnings: string[] = []

  try {
    const candidates: Array<{
      storagePath: string
      originalFilename: string
      declaredMimeType?: string
      sourceType: 'manual' | 'purchase' | 'warehouse_package'
      sourceImageId: string | null
      staged: boolean
    }> = [
      ...stagedImages.map((image) => ({
        storagePath: image.path,
        originalFilename: image.originalName,
        declaredMimeType: image.mimeType,
        sourceType: 'manual' as const,
        sourceImageId: null,
        staged: true,
      })),
      ...sourceImages.map((image) => ({
        storagePath: image.storagePath,
        originalFilename: image.originalFilename || 'Übernommenes Bild',
        sourceType: image.sourceType,
        sourceImageId: image.sourceImageId,
        staged: false,
      })),
    ]

    for (const candidate of candidates) {
      const { data, error } = await admin.storage.from(BUCKET).download(candidate.storagePath)
      if (error || !data) {
        throw new Error(`${candidate.originalFilename}: ${error?.message || 'Bilddatei nicht gefunden.'}`)
      }

      const inspected = inspectImageBytes(Buffer.from(await data.arrayBuffer()))
      if (candidate.declaredMimeType && candidate.declaredMimeType !== inspected.mimeType) {
        throw new Error(`${candidate.originalFilename}: Dateityp und Bildinhalt stimmen nicht überein.`)
      }

      if (knownHashes.has(inspected.sha256)) {
        warnings.push(`${candidate.originalFilename}: doppeltes Bild wurde übersprungen.`)
        if (candidate.staged) await admin.storage.from(BUCKET).remove([candidate.storagePath])
        continue
      }

      knownHashes.add(inspected.sha256)
      position += 1
      const targetPath = `${userId}/inventory/${inventoryUnitId}/${String(position).padStart(2, '0')}-${randomUUID()}.${inspected.extension}`

      const { error: uploadError } = await admin.storage.from(BUCKET).upload(
        targetPath,
        inspected.bytes,
        {
          contentType: inspected.mimeType,
          cacheControl: '31536000',
          upsert: false,
        },
      )

      if (uploadError) throw new Error(`${candidate.originalFilename}: ${uploadError.message}`)
      createdPaths.push(targetPath)

      rows.push({
        user_id: userId,
        inventory_unit_id: inventoryUnitId,
        storage_path: targetPath,
        original_filename: candidate.originalFilename,
        mime_type: inspected.mimeType,
        byte_size: inspected.byteSize,
        sha256: inspected.sha256,
        source_type: candidate.sourceType,
        source_image_id: candidate.sourceImageId,
        position,
      })

      if (candidate.staged) {
        await admin.storage.from(BUCKET).remove([candidate.storagePath])
      }
    }

    if (rows.length) {
      const { error: insertError } = await admin.from('inventory_unit_images').insert(rows)
      if (insertError) throw new Error(insertError.message)
    }

    return { created: rows.length, warnings }
  } catch (error) {
    await removeStorage([...createdPaths, ...stagedPaths])
    throw error
  }
}

export async function removeInventoryUnitImages({
  userId,
  inventoryUnitId,
  imageIds,
}: {
  userId: string
  inventoryUnitId: string
  imageIds: string[]
}) {
  if (!imageIds.length) return 0

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('inventory_unit_images')
    .select('id, storage_path')
    .eq('inventory_unit_id', inventoryUnitId)
    .eq('user_id', userId)
    .in('id', imageIds)

  if (error) throw new Error(error.message)
  if (!data?.length) return 0

  const { error: deleteError } = await admin
    .from('inventory_unit_images')
    .delete()
    .eq('inventory_unit_id', inventoryUnitId)
    .eq('user_id', userId)
    .in('id', data.map((row) => row.id))

  if (deleteError) throw new Error(deleteError.message)
  await removeStorage(data.map((row) => row.storage_path))
  return data.length
}
