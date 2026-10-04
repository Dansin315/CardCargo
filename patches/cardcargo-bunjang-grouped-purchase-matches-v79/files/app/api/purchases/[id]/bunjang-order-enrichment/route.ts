import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { normalizeDomesticTrackingNumber } from '@/lib/domestic-tracking'
import { hasTrustedRequestOrigin } from '@/lib/request-security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => value || null)

const recordSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  orderUrl: z.string().url().max(2_000),
  sourceListingId: nullableText(200),
  title: nullableText(1_000),
  sellerName: nullableText(300),
  purchasedAt: nullableText(30),
  orderedAt: nullableText(100),
  productAmount: z.number().finite().min(0).nullable(),
  domesticShippingAmount:
    z.number().finite().min(0).nullable(),
  totalAmount: z.number().finite().min(0).nullable(),
  domesticCarrier: nullableText(120),
  domesticTrackingNumber: nullableText(200),
  transactionMethod: nullableText(200),
  bunjangStatus: nullableText(100),
  imageUrls: z.array(z.string().url()).max(12),
  rawText: z.string().max(30_000),
  warnings: z.array(z.string().max(500)).max(20),
})

const inputSchema = z.object({
  record: recordSchema,
  autoAssignOlaeet: z.boolean().default(true),
})

type Metadata = Record<string, unknown>
type OrderRecord = z.infer<typeof recordSchema>

type PurchaseRow = {
  id: string
  title: string
  seller_name: string | null
  price_amount: number | null
  price_currency: string
  purchased_at: string | null
  status: string
  domestic_shipping_amount: number | null
  domestic_carrier: string | null
  domestic_tracking_number: string | null
  bunjang_order_id: string | null
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

function linkedOrderIds(purchase: {
  bunjang_order_id: string | null
  raw_metadata: unknown
}) {
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

function serializedOrder(record: OrderRecord) {
  return {
    synced_at: new Date().toISOString(),
    order_id: record.orderId,
    order_url: record.orderUrl,
    source_listing_id: record.sourceListingId,
    title: record.title,
    seller_name: record.sellerName,
    purchased_at: record.purchasedAt,
    ordered_at: record.orderedAt,
    bunjang_status: record.bunjangStatus,
    transaction_method: record.transactionMethod,
    product_amount: record.productAmount,
    domestic_shipping_amount:
      record.domesticShippingAmount,
    total_amount: record.totalAmount,
    carrier: record.domesticCarrier,
    tracking_number: record.domesticTrackingNumber,
    image_urls: record.imageUrls,
    parser_warnings: record.warnings,
    raw_text: record.rawText || null,
  }
}

function mergeMetadata(
  existing: unknown,
  purchase: PurchaseRow,
  record: OrderRecord,
  grouped: boolean,
) {
  const current = asMetadata(existing)
  const orders = metadataOrders(existing)
  const nextOrder = serializedOrder(record)

  const nextOrders = [
    ...orders.filter(
      (order) =>
        orderIdFromMetadata(order) !== record.orderId,
    ),
    nextOrder,
  ]

  const primary =
    current.bunjang_order &&
    typeof current.bunjang_order === 'object' &&
    !Array.isArray(current.bunjang_order)
      ? current.bunjang_order
      : nextOrder

  const groupSnapshot =
    current.bunjang_group_snapshot &&
    typeof current.bunjang_group_snapshot === 'object' &&
    !Array.isArray(current.bunjang_group_snapshot)
      ? current.bunjang_group_snapshot
      : grouped
        ? {
            captured_at: new Date().toISOString(),
            price_amount: purchase.price_amount,
            price_currency: purchase.price_currency,
            domestic_shipping_amount:
              purchase.domestic_shipping_amount,
            domestic_carrier:
              purchase.domestic_carrier,
            domestic_tracking_number:
              purchase.domestic_tracking_number,
            purchased_at: purchase.purchased_at,
          }
        : null

  return {
    ...current,
    bunjang_order: primary,
    bunjang_orders: nextOrders,
    bunjang_grouped: grouped || nextOrders.length > 1,
    ...(groupSnapshot
      ? { bunjang_group_snapshot: groupSnapshot }
      : {}),
  }
}

function findOrderOwner(
  purchases: PurchaseRow[],
  orderId: string,
) {
  return (
    purchases.find((candidate) =>
      linkedOrderIds(candidate).includes(orderId),
    ) ?? null
  )
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  try {
    const { id } = await context.params
    const input = inputSchema.parse(await request.json())
    const record = input.record
    const warnings: string[] = []

    const { data: allPurchases, error: allError } =
      await auth.supabase
        .from('purchases')
        .select(
          'id, title, seller_name, price_amount, price_currency, purchased_at, status, domestic_shipping_amount, domestic_carrier, domestic_tracking_number, bunjang_order_id, raw_metadata',
        )
        .eq('user_id', auth.user.id)
        .eq('source', 'bunjang')

    if (allError) throw new Error(allError.message)

    const purchases =
      (allPurchases ?? []) as unknown as PurchaseRow[]

    const purchase =
      purchases.find((candidate) => candidate.id === id) ??
      null

    if (!purchase) {
      return NextResponse.json(
        { error: 'Bunjang-Einkauf nicht gefunden.' },
        { status: 404 },
      )
    }

    const owner = findOrderOwner(
      purchases,
      record.orderId,
    )

    if (owner && owner.id !== purchase.id) {
      return NextResponse.json(
        {
          error:
            `Bestellung ${record.orderId} ist bereits mit ` +
            `„${owner.title}“ verknüpft.`,
        },
        { status: 409 },
      )
    }

    const previouslyLinked = linkedOrderIds(purchase)
    const grouped =
      isGroupedPurchase(purchase) ||
      previouslyLinked.some(
        (orderId) => orderId !== record.orderId,
      )

    const currentTracking =
      normalizeDomesticTrackingNumber(
        purchase.domestic_tracking_number,
      )
    const extractedTracking =
      normalizeDomesticTrackingNumber(
        record.domesticTrackingNumber,
      )

    if (
      !grouped &&
      currentTracking &&
      extractedTracking &&
      currentTracking !== extractedTracking
    ) {
      warnings.push(
        `Vorhandene Trackingnummer ${purchase.domestic_tracking_number} ` +
          `wurde nicht mit ${record.domesticTrackingNumber} überschrieben.`,
      )
    }

    if (grouped) {
      warnings.push(
        'Zusammengefasster Einkauf: Gesamtpreis, Gesamtversand und ' +
          'Purchase-Tracking bleiben unverändert. Die Werte dieser ' +
          'Bunjang-Order wurden separat gespeichert.',
      )
    }

    let nextStatus = purchase.status

    if (
      !grouped &&
      record.domesticTrackingNumber &&
      ['planned', 'ordered', 'paid'].includes(nextStatus)
    ) {
      nextStatus = 'shipped_domestic'
    }

    const nextMetadata = mergeMetadata(
      purchase.raw_metadata,
      purchase,
      record,
      grouped,
    )

    const updatePayload = grouped
      ? {
          // A grouped CardCargo purchase is the aggregate container.
          // NEVER replace its aggregate financial/logistics fields with one
          // constituent Bunjang order.
          bunjang_order_id:
            purchase.bunjang_order_id || record.orderId,
          seller_name:
            purchase.seller_name || record.sellerName,
          purchased_at:
            purchase.purchased_at || record.purchasedAt,
          status: purchase.status,
          raw_metadata: nextMetadata,
        }
      : {
          // For a normal one-to-one purchase the Bunjang order remains the
          // authoritative source for transactional values.
          bunjang_order_id: record.orderId,
          seller_name:
            record.sellerName || purchase.seller_name,
          price_amount:
            record.productAmount ?? purchase.price_amount,
          purchased_at:
            record.purchasedAt || purchase.purchased_at,
          domestic_shipping_amount:
            record.domesticShippingAmount ??
            purchase.domestic_shipping_amount,
          domestic_carrier:
            record.domesticCarrier ||
            purchase.domestic_carrier,
          domestic_tracking_number:
            record.domesticTrackingNumber ||
            purchase.domestic_tracking_number,
          status: nextStatus,
          raw_metadata: nextMetadata,
        }

    const { data: updated, error: updateError } =
      await auth.supabase
        .from('purchases')
        .update(updatePayload)
        .eq('id', purchase.id)
        .eq('user_id', auth.user.id)
        .select(
          'id, title, seller_name, price_amount, purchased_at, domestic_shipping_amount, domestic_carrier, domestic_tracking_number, bunjang_order_id, status, raw_metadata',
        )
        .single()

    if (updateError) throw new Error(updateError.message)

    let olaeetMatch: {
      packageId: string
      externalPackageId: string | null
    } | null = null

    // A grouped purchase may contain multiple domestic shipments. Assigning
    // the whole aggregate purchase to one OLAEET package based on one
    // constituent order would be unsafe, so auto-assignment is intentionally
    // disabled for grouped purchases.
    if (grouped && input.autoAssignOlaeet) {
      warnings.push(
        'OLAEET-Autozuordnung wurde für den zusammengefassten Einkauf ' +
          'übersprungen, da einzelne Bunjang-Orders unterschiedliche ' +
          'Sendungsnummern besitzen können.',
      )
    }

    const effectiveTracking =
      normalizeDomesticTrackingNumber(
        updated.domestic_tracking_number,
      )

    if (
      !grouped &&
      input.autoAssignOlaeet &&
      effectiveTracking
    ) {
      const { data: packages, error: packageError } =
        await auth.supabase
          .from('warehouse_packages')
          .select(
            'id, external_package_id, domestic_tracking_number',
          )
          .eq('user_id', auth.user.id)
          .eq('provider', 'OLAEET')
          .not('domestic_tracking_number', 'is', null)

      if (packageError) {
        throw new Error(packageError.message)
      }

      const matches = (packages ?? []).filter(
        (pkg) =>
          normalizeDomesticTrackingNumber(
            pkg.domestic_tracking_number,
          ) === effectiveTracking,
      )

      if (matches.length === 1) {
        const pkg = matches[0]

        const { data: currentLink, error: linkError } =
          await auth.supabase
            .from('warehouse_package_purchases')
            .select('warehouse_package_id')
            .eq('user_id', auth.user.id)
            .eq('purchase_id', purchase.id)
            .maybeSingle()

        if (linkError) {
          throw new Error(linkError.message)
        }

        if (
          currentLink?.warehouse_package_id &&
          currentLink.warehouse_package_id !== pkg.id
        ) {
          warnings.push(
            'Tracking passt zu OLAEET, der Einkauf ist aber bereits ' +
              'einem anderen Paket zugeordnet.',
          )
        } else {
          const {
            data: currentLinks,
            error: currentLinksError,
          } = await auth.supabase
            .from('warehouse_package_purchases')
            .select('purchase_id')
            .eq('user_id', auth.user.id)
            .eq('warehouse_package_id', pkg.id)

          if (currentLinksError) {
            throw new Error(currentLinksError.message)
          }

          const purchaseIds = [
            ...new Set([
              ...(currentLinks ?? []).map(
                (link) => link.purchase_id,
              ),
              purchase.id,
            ]),
          ]

          const { error: assignError } =
            await auth.supabase.rpc(
              'replace_warehouse_package_purchases',
              {
                p_package_id: pkg.id,
                p_purchase_ids: purchaseIds,
              },
            )

          if (assignError) {
            throw new Error(assignError.message)
          }

          if (
            [
              'planned',
              'ordered',
              'paid',
              'shipped_domestic',
            ].includes(updated.status)
          ) {
            const { error: statusError } =
              await auth.supabase
                .from('purchases')
                .update({
                  status: 'warehouse_received',
                })
                .eq('id', purchase.id)
                .eq('user_id', auth.user.id)

            if (statusError) {
              throw new Error(statusError.message)
            }
          }

          olaeetMatch = {
            packageId: pkg.id,
            externalPackageId:
              pkg.external_package_id,
          }
        }
      } else if (matches.length > 1) {
        warnings.push(
          'Mehrere OLAEET-Pakete besitzen dieselbe Trackingnummer; ' +
            'keine automatische Zuordnung.',
        )
      }
    }

    const finalLinkedOrderIds = [
      ...new Set([
        ...previouslyLinked,
        record.orderId,
      ]),
    ]

    revalidatePath(`/purchases/${purchase.id}`)
    revalidatePath('/purchases')
    revalidatePath('/warehouse-packages')

    return NextResponse.json({
      purchase: updated,
      olaeetMatch,
      warnings,
      groupedPurchase: grouped,
      linkedBunjangOrderIds: finalLinkedOrderIds,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error:
            error.issues[0]?.message ||
            'Ungültige Bunjang-Bestelldaten.',
        },
        { status: 422 },
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Bunjang-Bestelldaten konnten nicht ergänzt werden.',
      },
      { status: 400 },
    )
  }
}
