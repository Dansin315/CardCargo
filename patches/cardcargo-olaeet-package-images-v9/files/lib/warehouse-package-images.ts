import 'server-only'

import { randomUUID } from 'node:crypto'
import { inspectImageBytes } from '@/lib/importer/download-image'
import { createAdminClient } from '@/lib/supabase/admin'
import type { StagedImageInput } from '@/lib/types'

const BUCKET = 'listing-images'
export const MAX_WAREHOUSE_PACKAGE_IMAGES = 12

export interface ArchivedWarehousePackageImages {
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

export async function archiveWarehousePackageImages({
  userId,
  packageId,
  stagedImages,
}: {
  userId: string
  packageId: string
  stagedImages: StagedImageInput[]
}): Promise<ArchivedWarehousePackageImages> {
  if (!stagedImages.length) return { imageIds: [], storagePaths: [], warnings: [] }
  if (stagedImages.length > MAX_WAREHOUSE_PACKAGE_IMAGES) {
    throw new Error(`Pro OLAEET-Paket können höchstens ${MAX_WAREHOUSE_PACKAGE_IMAGES} neue Bilder auf einmal hochgeladen werden.`)
  }

  const admin = createAdminClient()
  const stagedPaths = stagedImages.map((image) => image.path)
  const finalPaths: string[] = []
  const warnings: string[] = []

  for (const image of stagedImages) validateStagedPath(userId, image.path)

  try {
    const { data: existingRows, error: existingError } = await admin
      .from('warehouse_package_images')
      .select('sha256, position')
      .eq('warehouse_package_id', packageId)
      .eq('user_id', userId)
      .order('position', { ascending: false })

    if (existingError) throw new Error(existingError.message)

    const knownHashes = new Set(
      (existingRows ?? [])
        .map((row) => row.sha256)
        .filter((value): value is string => Boolean(value)),
    )
    let position = Number(existingRows?.[0]?.position ?? 0)
    const rows: Array<Record<string, unknown>> = []

    for (const staged of stagedImages) {
      const { data, error } = await admin.storage.from(BUCKET).download(staged.path)
      if (error || !data) throw new Error(`${staged.originalName}: ${error?.message || 'Temporäre Datei nicht gefunden.'}`)

      const inspected = inspectImageBytes(Buffer.from(await data.arrayBuffer()))
      if (inspected.mimeType !== staged.mimeType) {
        throw new Error(`${staged.originalName}: Dateityp und tatsächlicher Bildinhalt stimmen nicht überein.`)
      }

      if (knownHashes.has(inspected.sha256)) {
        warnings.push(`${staged.originalName}: doppeltes Paketbild wurde übersprungen.`)
        await admin.storage.from(BUCKET).remove([staged.path])
        continue
      }

      knownHashes.add(inspected.sha256)
      position += 1
      const targetPath = `${userId}/warehouse-packages/${packageId}/${String(position).padStart(2, '0')}-manual-${randomUUID()}.${inspected.extension}`
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
        warehouse_package_id: packageId,
        storage_path: targetPath,
        original_filename: staged.originalName,
        mime_type: inspected.mimeType,
        byte_size: inspected.byteSize,
        sha256: inspected.sha256,
        position,
      })

      const { error: stagingDeleteError } = await admin.storage.from(BUCKET).remove([staged.path])
      if (stagingDeleteError) warnings.push(`${staged.originalName}: temporäre Kopie konnte nicht sofort entfernt werden.`)
    }

    if (!rows.length) {
      return { imageIds: [], storagePaths: [], warnings }
    }

    const { data: inserted, error: insertError } = await admin
      .from('warehouse_package_images')
      .insert(rows)
      .select('id, storage_path')

    if (insertError) throw new Error(`Paketbild-Metadaten konnten nicht gespeichert werden: ${insertError.message}`)

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

export async function removeWarehousePackageImages({
  userId,
  packageId,
  imageIds,
}: {
  userId: string
  packageId: string
  imageIds: string[]
}) {
  if (!imageIds.length) return
  const admin = createAdminClient()
  const { data: rows, error: readError } = await admin
    .from('warehouse_package_images')
    .select('id, storage_path')
    .eq('warehouse_package_id', packageId)
    .eq('user_id', userId)
    .in('id', imageIds)

  if (readError) throw new Error(readError.message)
  if (!rows?.length) return

  const { error: deleteError } = await admin
    .from('warehouse_package_images')
    .delete()
    .eq('warehouse_package_id', packageId)
    .eq('user_id', userId)
    .in('id', rows.map((row) => row.id))

  if (deleteError) throw new Error(deleteError.message)
  await cleanupStorage(rows.map((row) => row.storage_path))
}

export async function rollbackArchivedWarehousePackageImages(
  userId: string,
  packageId: string,
  archived: ArchivedWarehousePackageImages,
) {
  if (archived.imageIds.length) {
    const admin = createAdminClient()
    await admin
      .from('warehouse_package_images')
      .delete()
      .eq('warehouse_package_id', packageId)
      .eq('user_id', userId)
      .in('id', archived.imageIds)
  }
  await cleanupStorage(archived.storagePaths)
}

export async function removeWarehousePackageStoragePaths(paths: string[]) {
  await cleanupStorage(paths)
}
