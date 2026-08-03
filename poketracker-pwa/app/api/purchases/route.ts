import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPurchaseSchema } from '@/lib/importer/schema'
import { downloadListingImage, inspectImageBytes } from '@/lib/importer/download-image'
import { normalizeListingUrl } from '@/lib/importer/safe-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'listing-images'

type RemoteImageAsset = Awaited<ReturnType<typeof downloadListingImage>>
type ManualImageAsset = ReturnType<typeof inspectImageBytes> & {
  path: string
  originalName: string
}

async function removeStoragePaths(paths: string[]) {
  const uniquePaths = [...new Set(paths)]
  if (!uniquePaths.length) return
  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove(uniquePaths)
}

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const user = auth.user
  const admin = createAdminClient()
  const warnings: string[] = []
  const storedPaths: string[] = []
  const stagedPaths: string[] = []
  let purchaseId: string | null = null

  try {
    const input = createPurchaseSchema.parse(await request.json())
    const listingUrl = input.source === 'bunjang' ? normalizeListingUrl(input.listingUrl) : input.listingUrl
    const canonicalUrl =
      input.source === 'bunjang' && input.canonicalUrl
        ? normalizeListingUrl(input.canonicalUrl)
        : input.canonicalUrl ?? null

    const stagedPrefix = `${user.id}/staging/`
    for (const image of input.stagedImages) {
      if (!image.path.startsWith(stagedPrefix) || image.path.includes('..')) {
        throw new Error('Ungültiger temporärer Bildpfad.')
      }
      stagedPaths.push(image.path)
    }

    const remoteResults = await Promise.allSettled(
      input.remoteImageUrls.map((remoteUrl) => downloadListingImage(remoteUrl)),
    )
    const remoteAssets: RemoteImageAsset[] = []
    const knownHashes = new Set<string>()

    for (const result of remoteResults) {
      if (result.status === 'rejected') {
        warnings.push(
          `Ein automatisch erkanntes Bild wurde übersprungen: ${
            result.reason instanceof Error ? result.reason.message : 'Abruf fehlgeschlagen'
          }`,
        )
        continue
      }

      if (knownHashes.has(result.value.sha256)) {
        warnings.push('Ein doppelt erkanntes Angebotsbild wurde nur einmal archiviert.')
        continue
      }

      knownHashes.add(result.value.sha256)
      remoteAssets.push(result.value)
    }

    const manualAssets: ManualImageAsset[] = []
    for (const staged of input.stagedImages) {
      try {
        const { data, error } = await admin.storage.from(BUCKET).download(staged.path)
        if (error || !data) throw new Error(error?.message || 'Temporäre Datei nicht gefunden.')

        const bytes = Buffer.from(await data.arrayBuffer())
        const inspected = inspectImageBytes(bytes)
        if (inspected.mimeType !== staged.mimeType) {
          throw new Error('Dateityp und tatsächlicher Bildinhalt stimmen nicht überein.')
        }
        if (knownHashes.has(inspected.sha256)) {
          warnings.push(`${staged.originalName}: doppeltes Bild wurde nur einmal archiviert.`)
          await admin.storage.from(BUCKET).remove([staged.path])
          continue
        }

        knownHashes.add(inspected.sha256)
        manualAssets.push({
          ...inspected,
          path: staged.path,
          originalName: staged.originalName,
        })
      } catch (error) {
        warnings.push(
          `${staged.originalName}: ${
            error instanceof Error ? error.message : 'Manuelles Bild konnte nicht geprüft werden.'
          }`,
        )
        await admin.storage.from(BUCKET).remove([staged.path])
      }
    }

    if (!remoteAssets.length && !manualAssets.length) {
      return NextResponse.json(
        {
          error:
            'Es konnte kein gültiges Angebotsbild gespeichert werden. Lade mindestens einen Screenshot oder eine Bilddatei hoch.',
          warnings,
        },
        { status: 422 },
      )
    }

    const { data: purchase, error: purchaseError } = await admin
      .from('purchases')
      .insert({
        user_id: user.id,
        source: input.source,
        source_listing_id: input.externalId || null,
        listing_url: listingUrl,
        canonical_url: canonicalUrl,
        title: input.title,
        description: input.description || null,
        seller_name: input.sellerName || null,
        price_amount: input.priceAmount,
        domestic_shipping_amount: input.domesticShippingAmount,
        price_currency: input.priceCurrency,
        purchased_at: input.purchasedAt || null,
        status: input.status,
        raw_metadata: {
          imported_at: new Date().toISOString(),
          requested_remote_image_count: input.remoteImageUrls.length,
          requested_manual_image_count: input.stagedImages.length,
          validated_remote_image_count: remoteAssets.length,
          validated_manual_image_count: manualAssets.length,
        },
      })
      .select('id')
      .single()

    if (purchaseError || !purchase) {
      await removeStoragePaths(manualAssets.map((asset) => asset.path))
      const conflict = purchaseError?.code === '23505'
      return NextResponse.json(
        {
          error: conflict
            ? 'Dieses Bunjang-Angebot wurde bereits als Einkauf erfasst.'
            : purchaseError?.message || 'Der Einkauf konnte nicht angelegt werden.',
        },
        { status: conflict ? 409 : 500 },
      )
    }

    purchaseId = purchase.id
    const imageRows: Array<Record<string, unknown>> = []
    let position = 0

    for (const asset of remoteAssets) {
      position += 1
      const path = `${user.id}/purchases/${purchase.id}/${String(position).padStart(2, '0')}-${asset.sha256.slice(0, 20)}.${asset.extension}`
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, asset.bytes, {
        contentType: asset.mimeType,
        cacheControl: '31536000',
        upsert: false,
      })

      if (uploadError) {
        warnings.push(`Ein Angebotsbild konnte nicht archiviert werden: ${uploadError.message}`)
        continue
      }

      storedPaths.push(path)
      imageRows.push({
        user_id: user.id,
        purchase_id: purchase.id,
        storage_path: path,
        source_url: asset.originalUrl,
        original_filename: null,
        mime_type: asset.mimeType,
        byte_size: asset.byteSize,
        sha256: asset.sha256,
        position,
        kind: 'remote',
      })
    }

    for (const asset of manualAssets) {
      position += 1
      const targetPath = `${user.id}/purchases/${purchase.id}/${String(position).padStart(2, '0')}-manual-${randomUUID()}.${asset.extension}`
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(targetPath, asset.bytes, {
        contentType: asset.mimeType,
        cacheControl: '31536000',
        upsert: false,
      })

      if (uploadError) {
        warnings.push(`Eine manuell hochgeladene Bilddatei wurde übersprungen: ${uploadError.message}`)
        await admin.storage.from(BUCKET).remove([asset.path])
        continue
      }

      storedPaths.push(targetPath)
      const { error: stagingDeleteError } = await admin.storage.from(BUCKET).remove([asset.path])
      if (stagingDeleteError) {
        warnings.push('Eine temporäre Kopie konnte nicht sofort bereinigt werden.')
      }

      imageRows.push({
        user_id: user.id,
        purchase_id: purchase.id,
        storage_path: targetPath,
        source_url: null,
        original_filename: asset.originalName,
        mime_type: asset.mimeType,
        byte_size: asset.byteSize,
        sha256: asset.sha256,
        position,
        kind: 'manual',
      })
    }

    if (!imageRows.length) {
      await admin.from('purchases').delete().eq('id', purchase.id)
      return NextResponse.json(
        {
          error:
            'Der Einkauf wurde nicht gespeichert, weil kein Angebotsbild erfolgreich archiviert werden konnte.',
          warnings,
        },
        { status: 422 },
      )
    }

    const { error: imageInsertError } = await admin.from('purchase_images').insert(imageRows)
    if (imageInsertError) throw new Error(`Bildmetadaten konnten nicht gespeichert werden: ${imageInsertError.message}`)

    return NextResponse.json({ id: purchase.id, warnings }, { status: 201 })
  } catch (error) {
    if (storedPaths.length) await removeStoragePaths(storedPaths)
    if (stagedPaths.length) await removeStoragePaths(stagedPaths)
    if (purchaseId) await admin.from('purchases').delete().eq('id', purchaseId)

    const message = error instanceof Error ? error.message : 'Der Einkauf konnte nicht gespeichert werden.'
    return NextResponse.json({ error: message, warnings }, { status: 400 })
  }
}
