import 'server-only'

import { randomUUID } from 'node:crypto'
import { inspectImageBytes } from '@/lib/importer/download-image'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PurchaseImageCategory, StagedImageInput } from '@/lib/types'

const BUCKET = 'listing-images'
export const MAX_PURCHASE_IMAGES = 24
export const MAX_NEW_PURCHASE_IMAGES = 12

export interface StagedPurchaseImageInput extends StagedImageInput {
  category: PurchaseImageCategory
}

export interface ArchivedPurchaseImages {
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

export async function archivePurchaseImages({
  userId,
  purchaseId,
  stagedImages,
  deletedImageIds = [],
}: {
  userId: string
  purchaseId: string
  stagedImages: StagedPurchaseImageInput[]
  deletedImageIds?: string[]
}): Promise<ArchivedPurchaseImages> {
  if (!stagedImages.length) return { imageIds: [], storagePaths: [], warnings: [] }
  if (stagedImages.length > MAX_NEW_PURCHASE_IMAGES) {
    throw new Error(
      `Pro Bearbeitung können höchstens ${MAX_NEW_PURCHASE_IMAGES} neue Einkaufsbilder hochgeladen werden.`,
    )
  }

  const admin = createAdminClient()
  const stagedPaths = stagedImages.map((image) => image.path)
  const finalPaths: string[] = []
  const warnings: string[] = []

  for (const image of stagedImages) validateStagedPath(userId, image.path)

  try {
    const { data: existingRows, error: existingError } = await admin
      .from('purchase_images')
      .select('id, sha256, position, kind')
      .eq('purchase_id', purchaseId)
      .eq('user_id', userId)
      .order('position', { ascending: false })

    if (existingError) throw new Error(existingError.message)

    const removableIds = new Set(
      (existingRows ?? [])
        .filter((row) => row.kind === 'manual' && deletedImageIds.includes(row.id))
        .map((row) => row.id),
    )
    const remainingRows = (existingRows ?? []).filter(
      (row) => !removableIds.has(row.id),
    )
    if (remainingRows.length + stagedImages.length > MAX_PURCHASE_IMAGES) {
      throw new Error(
        `Ein Einkauf kann höchstens ${MAX_PURCHASE_IMAGES} archivierte Bilder enthalten.`,
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
        warnings.push(`${staged.originalName}: doppeltes Einkaufsbild wurde übersprungen.`)
        await admin.storage.from(BUCKET).remove([staged.path])
        continue
      }

      knownHashes.add(inspected.sha256)
      position += 1
      const targetPath = `${userId}/purchases/${purchaseId}/${String(position).padStart(2, '0')}-manual-${randomUUID()}.${inspected.extension}`
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
        purchase_id: purchaseId,
        storage_path: targetPath,
        source_url: null,
        original_filename: staged.originalName,
        mime_type: inspected.mimeType,
        byte_size: inspected.byteSize,
        sha256: inspected.sha256,
        position,
        kind: 'manual',
        category: staged.category,
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
      .from('purchase_images')
      .insert(rows)
      .select('id, storage_path')

    if (insertError) {
      throw new Error(
        `Bildmetadaten konnten nicht gespeichert werden: ${insertError.message}`,
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

export async function removeManualPurchaseImages({
  userId,
  purchaseId,
  imageIds,
}: {
  userId: string
  purchaseId: string
  imageIds: string[]
}) {
  if (!imageIds.length) return
  const admin = createAdminClient()

  const { data: rows, error: readError } = await admin
    .from('purchase_images')
    .select('id, storage_path, kind')
    .eq('purchase_id', purchaseId)
    .eq('user_id', userId)
    .in('id', imageIds)

  if (readError) throw new Error(readError.message)
  if (!rows?.length) return
  if (rows.some((row) => row.kind !== 'manual')) {
    throw new Error('Automatisch archivierte Angebotsbilder können nicht hier gelöscht werden.')
  }

  const { count, error: countError } = await admin
    .from('purchase_images')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_id', purchaseId)
    .eq('user_id', userId)

  if (countError) throw new Error(countError.message)
  if ((count ?? 0) - rows.length < 1) {
    throw new Error('Mindestens ein Bild muss beim Einkauf archiviert bleiben.')
  }

  const { error: deleteError } = await admin
    .from('purchase_images')
    .delete()
    .eq('purchase_id', purchaseId)
    .eq('user_id', userId)
    .in('id', rows.map((row) => row.id))

  if (deleteError) throw new Error(deleteError.message)
  await cleanupStorage(rows.map((row) => row.storage_path))
}

export async function rollbackArchivedPurchaseImages(
  userId: string,
  purchaseId: string,
  archived: ArchivedPurchaseImages,
) {
  if (archived.imageIds.length) {
    const admin = createAdminClient()
    await admin
      .from('purchase_images')
      .delete()
      .eq('purchase_id', purchaseId)
      .eq('user_id', userId)
      .in('id', archived.imageIds)
  }
  await cleanupStorage(archived.storagePaths)
}
