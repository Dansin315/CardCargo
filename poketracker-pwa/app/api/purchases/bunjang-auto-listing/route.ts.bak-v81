import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { previewBunjangListing } from '@/lib/importer/parse-listing'
import { downloadListingImage } from '@/lib/importer/download-image'
import { normalizeListingUrl } from '@/lib/importer/safe-fetch'
import {
  archivePurchaseImages,
  type StagedPurchaseImageInput,
} from '@/lib/purchase-images'
import { hasTrustedRequestOrigin } from '@/lib/request-security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

const inputSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  listingUrl: z.string().url().max(2_000),
  purchaseId: z.string().uuid().nullable().optional(),
})

type Metadata = Record<string, unknown>

type PurchaseRow = {
  id: string
  source: string
  title: string
  description: string | null
  seller_name: string | null
  price_amount: number | null
  price_currency: string
  domestic_shipping_amount: number | null
  purchased_at: string | null
  domestic_carrier: string | null
  domestic_tracking_number: string | null
  bunjang_order_id: string | null
  source_listing_id: string | null
  listing_url: string
  canonical_url: string | null
  raw_metadata: unknown
}

function asMetadata(value: unknown): Metadata {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? (value as Metadata)
    : {}
}

function orderIdFromMetadata(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  const id = (value as Record<string, unknown>).order_id
  return typeof id === 'string' && id.trim()
    ? id.trim()
    : null
}

function metadataOrders(value: unknown) {
  const metadata = asMetadata(value)
  const result: Array<Record<string, unknown>> = []
  const seen = new Set<string>()

  if (Array.isArray(metadata.bunjang_orders)) {
    for (const item of metadata.bunjang_orders) {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item)
      ) {
        continue
      }

      const order = item as Record<string, unknown>
      const id = orderIdFromMetadata(order)

      if (id && !seen.has(id)) {
        seen.add(id)
        result.push(order)
      }
    }
  }

  const legacy =
    metadata.bunjang_order &&
    typeof metadata.bunjang_order === 'object' &&
    !Array.isArray(metadata.bunjang_order)
      ? (metadata.bunjang_order as Record<string, unknown>)
      : null

  const legacyId = orderIdFromMetadata(legacy)

  if (legacy && legacyId && !seen.has(legacyId)) {
    result.push(legacy)
  }

  return result
}

function linkedOrderIds(purchase: PurchaseRow) {
  const ids = new Set<string>()

  if (purchase.bunjang_order_id) {
    ids.add(purchase.bunjang_order_id)
  }

  for (const order of metadataOrders(
    purchase.raw_metadata,
  )) {
    const id = orderIdFromMetadata(order)
    if (id) ids.add(id)
  }

  return [...ids]
}

function metadataMarksGrouped(value: unknown) {
  const metadata = asMetadata(value)

  if (
    metadata.bunjang_grouped === true ||
    metadata.grouped === true ||
    metadata.is_grouped === true
  ) {
    return true
  }

  for (const key of [
    'grouped_listings',
    'source_listings',
    'listing_urls',
    'purchase_sources',
  ]) {
    const candidate = metadata[key]
    if (Array.isArray(candidate) && candidate.length > 1) {
      return true
    }
  }

  return false
}

function isGroupedPurchase(purchase: PurchaseRow) {
  return (
    purchase.title.includes('&&') ||
    metadataMarksGrouped(purchase.raw_metadata) ||
    linkedOrderIds(purchase).length > 1
  )
}

function listingIdFromUrl(value: string) {
  const match =
    value.match(/\/products?\/(\d{5,})/i) ||
    value.match(
      /[?&](?:product|product_id|item|item_id|goods|goods_id)=(\d{5,})/i,
    )

  return match?.[1] ?? null
}

function normalizeComparableUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    return normalizeListingUrl(value)
  } catch {
    return value.trim()
  }
}

function orderListingAlreadyImported(
  purchase: PurchaseRow,
  orderId: string,
  listingUrl: string,
) {
  const normalized = normalizeComparableUrl(listingUrl)
  const externalId = listingIdFromUrl(listingUrl)

  for (const order of metadataOrders(
    purchase.raw_metadata,
  )) {
    if (orderIdFromMetadata(order) !== orderId) continue

    const importedAt = order.listing_imported_at
    const storedUrl = normalizeComparableUrl(
      order.listing_url,
    )
    const storedId =
      typeof order.listing_external_id === 'string'
        ? order.listing_external_id
        : null

    if (
      importedAt &&
      ((normalized && storedUrl === normalized) ||
        (externalId && storedId === externalId))
    ) {
      return true
    }
  }

  // Legacy/manual URL import: for a one-to-one Purchase, matching listing ID
  // plus an existing description is a strong indication that enrichment is
  // already complete.
  if (
    !isGroupedPurchase(purchase) &&
    externalId &&
    purchase.source_listing_id === externalId &&
    Boolean(purchase.description?.trim())
  ) {
    return true
  }

  return false
}

function mergeListingMetadata(args: {
  existing: unknown
  orderId: string
  listingUrl: string
  canonicalUrl: string | null
  externalId: string | null
  title: string
  description: string
  sellerName: string | null
  imageUrls: string[]
  grouped: boolean
}) {
  const current = asMetadata(args.existing)
  const existingOrders = metadataOrders(args.existing)

  let found = false
  const nextOrders = existingOrders.map((order) => {
    if (orderIdFromMetadata(order) !== args.orderId) {
      return order
    }

    found = true
    return {
      ...order,
      listing_imported_at: new Date().toISOString(),
      listing_url: args.listingUrl,
      listing_canonical_url: args.canonicalUrl,
      listing_external_id: args.externalId,
      listing_title: args.title,
      listing_description: args.description,
      listing_seller_name: args.sellerName,
      listing_image_urls: args.imageUrls,
    }
  })

  if (!found) {
    nextOrders.push({
      order_id: args.orderId,
      listing_imported_at: new Date().toISOString(),
      listing_url: args.listingUrl,
      listing_canonical_url: args.canonicalUrl,
      listing_external_id: args.externalId,
      listing_title: args.title,
      listing_description: args.description,
      listing_seller_name: args.sellerName,
      listing_image_urls: args.imageUrls,
    })
  }

  const groupedListings = Array.isArray(
    current.grouped_listings,
  )
    ? current.grouped_listings.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              !Array.isArray(entry),
          ),
      )
    : []

  const comparable =
    args.canonicalUrl || args.listingUrl

  const nextGroupedListings = [
    ...groupedListings.filter((entry) => {
      const existingComparable =
        (typeof entry.canonicalUrl === 'string' &&
          entry.canonicalUrl) ||
        (typeof entry.listingUrl === 'string' &&
          entry.listingUrl) ||
        null

      return existingComparable !== comparable
    }),
    {
      orderId: args.orderId,
      title: args.title,
      description: args.description,
      listingUrl: args.listingUrl,
      canonicalUrl: args.canonicalUrl,
      externalId: args.externalId,
      sellerName: args.sellerName,
      imageUrls: args.imageUrls,
    },
  ]

  return {
    ...current,
    bunjang_orders: nextOrders,
    ...(args.grouped
      ? {
          grouped_listings: nextGroupedListings,
          bunjang_grouped: true,
        }
      : {
          listing_import: {
            ...(current.listing_import &&
            typeof current.listing_import === 'object' &&
            !Array.isArray(current.listing_import)
              ? (current.listing_import as Record<
                  string,
                  unknown
                >)
              : {}),
            enriched_at: new Date().toISOString(),
            bunjang_order_id: args.orderId,
            listing_url: args.listingUrl,
            canonical_url: args.canonicalUrl,
            source_listing_id: args.externalId,
            requested_remote_image_count:
              args.imageUrls.length,
          },
        }),
  }
}

function findPurchaseForOrder(
  purchases: PurchaseRow[],
  orderId: string,
  purchaseId?: string | null,
) {
  if (purchaseId) {
    return (
      purchases.find(
        (purchase) => purchase.id === purchaseId,
      ) ?? null
    )
  }

  return (
    purchases.find((purchase) =>
      linkedOrderIds(purchase).includes(orderId),
    ) ?? null
  )
}

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json(
      { error: 'Anfrage von fremder Origin blockiert.' },
      { status: 403 },
    )
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    )
  }

  const admin = createAdminClient()
  const remoteStagingPaths: string[] = []

  try {
    const input = inputSchema.parse(await request.json())
    const listingUrl = normalizeListingUrl(
      input.listingUrl,
    )

    const { data, error } = await admin
      .from('purchases')
      .select(
        'id, source, title, description, seller_name, price_amount, price_currency, domestic_shipping_amount, purchased_at, domestic_carrier, domestic_tracking_number, bunjang_order_id, source_listing_id, listing_url, canonical_url, raw_metadata',
      )
      .eq('user_id', auth.user.id)
      .eq('source', 'bunjang')

    if (error) throw new Error(error.message)

    const purchases =
      (data ?? []) as unknown as PurchaseRow[]

    const purchase = findPurchaseForOrder(
      purchases,
      input.orderId,
      input.purchaseId,
    )

    if (!purchase) {
      return NextResponse.json({
        status: 'no-purchase',
        orderId: input.orderId,
        listingUrl,
        message:
          'Für diese Bunjang-Order existiert noch kein gespeicherter CardCargo-Einkauf.',
      })
    }

    if (
      orderListingAlreadyImported(
        purchase,
        input.orderId,
        listingUrl,
      )
    ) {
      return NextResponse.json({
        status: 'already-complete',
        orderId: input.orderId,
        purchaseId: purchase.id,
        listingUrl,
        message:
          'Listing-Daten wurden für diese Order bereits importiert.',
      })
    }

    const preview = await previewBunjangListing(
      listingUrl,
    )

    const canonicalUrl = preview.canonicalUrl
      ? normalizeListingUrl(preview.canonicalUrl)
      : null
    const externalId =
      preview.externalId || listingIdFromUrl(listingUrl)
    const grouped = isGroupedPurchase(purchase)

    if (externalId) {
      const listingOwner = purchases.find(
        (candidate) =>
          candidate.id !== purchase.id &&
          candidate.source_listing_id === externalId,
      )

      if (listingOwner) {
        return NextResponse.json({
          status: 'conflict',
          orderId: input.orderId,
          purchaseId: purchase.id,
          listingUrl,
          externalId,
          message:
            `Listing ${externalId} ist bereits mit „${listingOwner.title}“ verknüpft.`,
        })
      }
    }

    const warnings: string[] = []
    const stagedImages: StagedPurchaseImageInput[] = []
    const previewImageUrls = [
      ...new Set(preview.imageUrls ?? []),
    ].slice(0, 12)

    for (const [index, remoteUrl] of
      previewImageUrls.entries()) {
      try {
        const asset = await downloadListingImage(
          remoteUrl,
        )
        const path =
          `${auth.user.id}/staging/auto-bunjang-${input.orderId}-` +
          `${randomUUID()}-${String(index + 1).padStart(2, '0')}.` +
          `${asset.extension}`

        const { error: uploadError } =
          await admin.storage
            .from('listing-images')
            .upload(path, asset.bytes, {
              contentType: asset.mimeType,
              cacheControl: '3600',
              upsert: false,
            })

        if (uploadError) {
          throw new Error(uploadError.message)
        }

        remoteStagingPaths.push(path)
        stagedImages.push({
          path,
          originalName:
            `bunjang-${input.orderId}-${String(index + 1).padStart(2, '0')}.${asset.extension}`,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize,
          category: 'listing',
        })
      } catch (imageError) {
        warnings.push(
          `Ein Listing-Bild konnte nicht archiviert werden: ${
            imageError instanceof Error
              ? imageError.message
              : 'Abruf fehlgeschlagen'
          }`,
        )
      }
    }

    const nextMetadata = mergeListingMetadata({
      existing: purchase.raw_metadata,
      orderId: input.orderId,
      listingUrl,
      canonicalUrl,
      externalId,
      title: preview.title,
      description: preview.description || '',
      sellerName: preview.sellerName || null,
      imageUrls: previewImageUrls,
      grouped,
    })

    const updatePayload = grouped
      ? {
          // Keep the grouped Purchase as an aggregate container. The detailed
          // listing is stored under grouped_listings / bunjang_orders.
          source_listing_id:
            purchase.source_listing_id || externalId || null,
          listing_url:
            purchase.listing_url || listingUrl,
          canonical_url:
            purchase.canonical_url || canonicalUrl || null,
          seller_name:
            purchase.seller_name ||
            preview.sellerName ||
            null,
          raw_metadata: nextMetadata,
        }
      : {
          source_listing_id:
            purchase.source_listing_id || externalId || null,
          listing_url: listingUrl,
          canonical_url:
            canonicalUrl || purchase.canonical_url || null,
          // Listing is authoritative for presentation data only.
          title: preview.title || purchase.title,
          description:
            preview.description ||
            purchase.description ||
            null,
          seller_name:
            purchase.seller_name ||
            preview.sellerName ||
            null,
          raw_metadata: nextMetadata,
        }

    const { error: updateError } = await admin
      .from('purchases')
      .update(updatePayload)
      .eq('id', purchase.id)
      .eq('user_id', auth.user.id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    let archivedImageCount = 0

    if (stagedImages.length) {
      const archived = await archivePurchaseImages({
        userId: auth.user.id,
        purchaseId: purchase.id,
        stagedImages,
      })

      warnings.push(...archived.warnings)
      archivedImageCount =
        stagedImages.length - archived.warnings.length
    }

    revalidatePath(`/purchases/${purchase.id}`)
    revalidatePath('/purchases')

    return NextResponse.json({
      status: 'enriched',
      orderId: input.orderId,
      purchaseId: purchase.id,
      groupedPurchase: grouped,
      listingUrl,
      canonicalUrl,
      externalId,
      title: preview.title,
      descriptionImported: Boolean(
        preview.description?.trim(),
      ),
      requestedImageCount: previewImageUrls.length,
      archivedImageCount,
      warnings,
      message: grouped
        ? 'Listing wurde der einzelnen Bunjang-Order im zusammengefassten Einkauf zugeordnet.'
        : 'Listing-Daten und Bilder wurden automatisch ergänzt.',
    })
  } catch (error) {
    if (remoteStagingPaths.length) {
      await admin.storage
        .from('listing-images')
        .remove(remoteStagingPaths)
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error:
            error.issues[0]?.message ||
            'Ungültige Auto-Listing-Daten.',
        },
        { status: 422 },
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Bunjang-Listing konnte nicht automatisch ergänzt werden.',
      },
      { status: 400 },
    )
  }
}
