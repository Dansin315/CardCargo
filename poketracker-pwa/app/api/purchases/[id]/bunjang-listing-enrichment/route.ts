import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPurchaseSchema } from '@/lib/importer/schema'
import { downloadListingImage } from '@/lib/importer/download-image'
import { normalizeListingUrl } from '@/lib/importer/safe-fetch'
import { archivePurchaseImages, type StagedPurchaseImageInput } from '@/lib/purchase-images'
import { hasTrustedRequestOrigin } from '@/lib/request-security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const inputSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  listing: createPurchaseSchema,
})

const statusRank: Record<string, number> = {
  planned: 0,
  ordered: 1,
  paid: 2,
  shipped_domestic: 3,
  warehouse_received: 4,
  consolidated: 5,
  international_transit: 6,
  delivered: 7,
  cancelled: 8,
}

function preferredStatus(current: string, incoming: string) {
  if (current === 'cancelled') return current
  if (incoming === 'cancelled') return current
  return (statusRank[incoming] ?? 0) > (statusRank[current] ?? 0)
    ? incoming
    : current
}

function mergeMetadata(existing: unknown, input: z.infer<typeof createPurchaseSchema>, orderId: string) {
  const current =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {}

  return {
    ...current,
    listing_import: {
      ...(current.listing_import &&
      typeof current.listing_import === 'object' &&
      !Array.isArray(current.listing_import)
        ? (current.listing_import as Record<string, unknown>)
        : {}),
      enriched_at: new Date().toISOString(),
      bunjang_order_id: orderId,
      listing_url: input.listingUrl,
      canonical_url: input.canonicalUrl ?? null,
      source_listing_id: input.externalId ?? null,
      requested_remote_image_count: input.remoteImageUrls.length,
      requested_manual_image_count: input.stagedImages.length,
    },
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const admin = createAdminClient()
  const remoteStagingPaths: string[] = []

  try {
    const { id } = await context.params
    const { orderId, listing } = inputSchema.parse(await request.json())

    const listingUrl = normalizeListingUrl(listing.listingUrl)
    const canonicalUrl = listing.canonicalUrl
      ? normalizeListingUrl(listing.canonicalUrl)
      : null

    const { data: purchase, error: purchaseError } = await admin
      .from('purchases')
      .select(
        'id, user_id, source, bunjang_order_id, source_listing_id, listing_url, canonical_url, title, description, seller_name, price_amount, domestic_shipping_amount, price_currency, purchased_at, status, raw_metadata',
      )
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (purchaseError) throw new Error(purchaseError.message)
    if (!purchase || purchase.source !== 'bunjang') {
      return NextResponse.json({ error: 'Bunjang-Einkauf nicht gefunden.' }, { status: 404 })
    }

    if (purchase.bunjang_order_id && purchase.bunjang_order_id !== orderId) {
      return NextResponse.json(
        {
          error: `Der Einkauf ist bereits mit Bunjang-Bestellung ${purchase.bunjang_order_id} verknüpft.`,
        },
        { status: 409 },
      )
    }

    if (listing.externalId) {
      const { data: listingOwner, error: listingOwnerError } = await admin
        .from('purchases')
        .select('id, title')
        .eq('user_id', auth.user.id)
        .eq('source', 'bunjang')
        .eq('source_listing_id', listing.externalId)
        .neq('id', purchase.id)
        .maybeSingle()

      if (listingOwnerError) throw new Error(listingOwnerError.message)
      if (listingOwner) {
        return NextResponse.json(
          {
            error:
              `Dieses Bunjang-Listing ist bereits mit dem separaten Einkauf „${listingOwner.title}“ verknüpft. ` +
              'Der URL-Import erstellt keinen weiteren Datensatz. Bestehende Alt-Duplikate sollten gezielt zusammengeführt werden.',
          },
          { status: 409 },
        )
      }
    }

    const warnings: string[] = []
    const stagedImages: StagedPurchaseImageInput[] = listing.stagedImages.map((image) => ({
      ...image,
      category: 'listing' as const,
    }))

    for (const [index, remoteUrl] of listing.remoteImageUrls.entries()) {
      try {
        const asset = await downloadListingImage(remoteUrl)
        const path = `${auth.user.id}/staging/url-enrichment-${randomUUID()}-${String(index + 1).padStart(2, '0')}.${asset.extension}`
        const { error: uploadError } = await admin.storage
          .from('listing-images')
          .upload(path, asset.bytes, {
            contentType: asset.mimeType,
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) throw new Error(uploadError.message)
        remoteStagingPaths.push(path)
        stagedImages.push({
          path,
          originalName: `bunjang-listing-${String(index + 1).padStart(2, '0')}.${asset.extension}`,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize,
          category: 'listing',
        })
      } catch (error) {
        warnings.push(
          `Ein Bunjang-Angebotsbild konnte nicht ergänzt werden: ${
            error instanceof Error ? error.message : 'Abruf fehlgeschlagen'
          }`,
        )
      }
    }

    const { error: updateError } = await admin
      .from('purchases')
      .update({
        bunjang_order_id: orderId,
        source_listing_id: purchase.source_listing_id || listing.externalId || null,
        listing_url: listingUrl,
        canonical_url: canonicalUrl || purchase.canonical_url || null,
        title: listing.title,
        description: purchase.description || listing.description || null,
        seller_name: purchase.seller_name || listing.sellerName || null,
        price_amount: purchase.price_amount ?? listing.priceAmount,
        domestic_shipping_amount:
          purchase.domestic_shipping_amount ?? listing.domesticShippingAmount,
        price_currency: purchase.price_currency || listing.priceCurrency,
        purchased_at: purchase.purchased_at || listing.purchasedAt || null,
        status: preferredStatus(purchase.status, listing.status),
        raw_metadata: mergeMetadata(purchase.raw_metadata, listing, orderId),
      })
      .eq('id', purchase.id)
      .eq('user_id', auth.user.id)

    if (updateError) throw new Error(updateError.message)

    if (stagedImages.length) {
      const archived = await archivePurchaseImages({
        userId: auth.user.id,
        purchaseId: purchase.id,
        stagedImages,
      })
      warnings.push(...archived.warnings)
    }

    revalidatePath(`/purchases/${purchase.id}`)
    revalidatePath('/purchases')

    return NextResponse.json(
      {
        id: purchase.id,
        enrichedExisting: true,
        warnings,
      },
      { status: 200 },
    )
  } catch (error) {
    if (remoteStagingPaths.length) {
      await admin.storage.from('listing-images').remove(remoteStagingPaths)
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Ungültige URL-Importdaten.' },
        { status: 422 },
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Der bestehende Bunjang-Einkauf konnte nicht ergänzt werden.',
      },
      { status: 400 },
    )
  }
}
