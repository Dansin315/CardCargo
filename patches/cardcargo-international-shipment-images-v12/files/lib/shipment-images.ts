import 'server-only'

import { randomUUID } from 'node:crypto'
import { inspectImageBytes } from '@/lib/importer/download-image'
import { createAdminClient } from '@/lib/supabase/admin'
import type { StagedShipmentImageInput } from '@/lib/shipments'

const BUCKET = 'listing-images'
export const MAX_NEW_SHIPMENT_IMAGES = 12
export const MAX_SHIPMENT_IMAGES = 24

export interface ArchivedShipmentImages {
  imageIds: string[]
  storagePaths: string[]
  warnings: string[]
}

function validateStagedPath(userId: string, path: string) {
  const prefix = `${userId}/staging/`
  if (!path.startsWith(prefix) || path.includes('..')) {
    throw new Error('Ungültiger temporärer Bildpfad.')
  }
}

async function cleanupStorage(paths: string[]) {
  const uniquePaths = [...new Set(paths)]
  if (!uniquePaths.length) return
  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove(uniquePaths)
}

export async function archiveShipmentImages({
  userId,
  shipmentId,
  stagedImages,
  removeImageIds = [],
}: {
  userId: string
  shipmentId: string
  stagedImages: StagedShipmentImageInput[]
  removeImageIds?: string[]
}): Promise<ArchivedShipmentImages> {
  if (!stagedImages.length) return { imageIds: [], storagePaths: [], warnings: [] }
  if (stagedImages.length > MAX_NEW_SHIPMENT_IMAGES) {
    throw new Error(
      `Pro Speichervorgang können höchstens ${MAX_NEW_SHIPMENT_IMAGES} neue Sendungsbilder hochgeladen werden.`,
    )
  }

  const admin = createAdminClient()
  const stagedPaths = stagedImages.map((image) => image.path)
  const finalPaths: string[] = []
  const warnings: string[] = []

  for (const image of stagedImages) validateStagedPath(userId, image.path)

  try {
    const { data: existingRows, error: existingError } = await admin
      .from('shipment_images')
      .select('id, sha256, position')
      .eq('shipment_id', shipmentId)
      .eq('user_id', userId)
      .order('position', { ascending: false })

    if (existingError) throw new Error(existingError.message)

    const removedSet = new Set(removeImageIds)
    const remainingRows = (existingRows ?? []).filter((row) => !removedSet.has(row.id))
    if (remainingRows.length + stagedImages.length > MAX_SHIPMENT_IMAGES) {
      throw new Error(
        `Eine internationale Sendung kann insgesamt höchstens ${MAX_SHIPMENT_IMAGES} eigene Bilder enthalten.`,
      )
    }

    const knownHashes = new Set(
      remainingRows
        .map((row) => row.sha256)
        .filter((value): value is string => Boolean(value)),
    )
    let position = Number(existingRows?.[0]?.position ?? 0)
    const rows: Array<Record<string, unknown>> = []

    for (const staged of stagedImages) {
      const { data, error } = await admin.storage.from(BUCKET).download(staged.path)
      if (error || !data) {
        throw new Error(
          `${staged.originalName}: ${error?.message || 'Temporäre Datei nicht gefunden.'}`,
        )
      }

      const inspected = inspectImageBytes(Buffer.from(await data.arrayBuffer()))
      if (inspected.mimeType !== staged.mimeType) {
        throw new Error(
          `${staged.originalName}: Dateityp und tatsächlicher Bildinhalt stimmen nicht überein.`,
        )
      }

      if (knownHashes.has(inspected.sha256)) {
        warnings.push(`${staged.originalName}: doppeltes Sendungsbild wurde übersprungen.`)
        await admin.storage.from(BUCKET).remove([staged.path])
        continue
      }

      knownHashes.add(inspected.sha256)
      position += 1
      const targetPath = `${userId}/shipments/${shipmentId}/${String(position).padStart(2, '0')}-${staged.category}-${randomUUID()}.${inspected.extension}`
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(
        targetPath,
        inspected.bytes,
        {
          contentType: inspected.mimeType,
          cacheControl: '31536000',
          upsert: false,
        },
      )
      if (uploadError) throw new Error(`${staged.originalName}: ${uploadError.message}`)

      finalPaths.push(targetPath)
      rows.push({
        user_id: userId,
        shipment_id: shipmentId,
        storage_path: targetPath,
        original_filename: staged.originalName,
        category: staged.category,
        mime_type: inspected.mimeType,
        byte_size: inspected.byteSize,
        sha256: inspected.sha256,
        position,
      })

      const { error: stagingDeleteError } = await admin.storage
        .from(BUCKET)
        .remove([staged.path])
      if (stagingDeleteError) {
        warnings.push(
          `${staged.originalName}: temporäre Kopie konnte nicht sofort entfernt werden.`,
        )
      }
    }

    if (!rows.length) return { imageIds: [], storagePaths: [], warnings }

    const { data: inserted, error: insertError } = await admin
      .from('shipment_images')
      .insert(rows)
      .select('id, storage_path')

    if (insertError) {
      throw new Error(
        `Sendungsbild-Metadaten konnten nicht gespeichert werden: ${insertError.message}`,
      )
    }

    return {
      imageIds: (inserted ?? []).map((row) => row.id),
      storagePaths: (inserted ?? []).map((row) => row.storage_path),
      warnings,
    }
  } catch (error) {
    await cleanupStorage([...finalPaths, ...stagedPaths])
    throw error
  }
}

export async function removeShipmentImages({
  userId,
  shipmentId,
  imageIds,
}: {
  userId: string
  shipmentId: string
  imageIds: string[]
}) {
  if (!imageIds.length) return
  const admin = createAdminClient()
  const { data: rows, error: readError } = await admin
    .from('shipment_images')
    .select('id, storage_path')
    .eq('shipment_id', shipmentId)
    .eq('user_id', userId)
    .in('id', imageIds)

  if (readError) throw new Error(readError.message)
  if (!rows?.length) return

  const { error: deleteError } = await admin
    .from('shipment_images')
    .delete()
    .eq('shipment_id', shipmentId)
    .eq('user_id', userId)
    .in(
      'id',
      rows.map((row) => row.id),
    )

  if (deleteError) throw new Error(deleteError.message)
  await cleanupStorage(rows.map((row) => row.storage_path))
}

export async function rollbackArchivedShipmentImages(
  userId: string,
  shipmentId: string,
  archived: ArchivedShipmentImages,
) {
  if (archived.imageIds.length) {
    const admin = createAdminClient()
    await admin
      .from('shipment_images')
      .delete()
      .eq('shipment_id', shipmentId)
      .eq('user_id', userId)
      .in('id', archived.imageIds)
  }
  await cleanupStorage(archived.storagePaths)
}

export async function removeShipmentStoragePaths(paths: string[]) {
  await cleanupStorage(paths)
}
