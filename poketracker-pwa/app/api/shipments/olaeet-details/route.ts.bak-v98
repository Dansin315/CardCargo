import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import {
  imageBucketCandidates,
  packageImageTableCandidates,
  packagePurchaseRelationTableCandidates,
} from '@/lib/olaeet-image-schema.generated'

type GenericRow = Record<string, unknown>
type SupabaseClient = Awaited<ReturnType<typeof getApiUser>>['supabase']

type ImageCandidate = {
  raw: string
  bucket?: string | null
  filename?: string | null
  source: string
  purchaseId?: string | null
}

type ResolvedImage = {
  url: string
  filename: string
  source: string
  purchaseId?: string | null
}

function objectRow(value: unknown): GenericRow | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GenericRow)
    : null
}

function arrayRows(value: unknown): GenericRow[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is GenericRow =>
          Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
      )
    : []
}

function asRows(value: unknown) {
  return Array.isArray(value) ? (value as unknown as GenericRow[]) : []
}

function norm(value: unknown) {
  return String(value || '').trim()
}

function tracking(value: unknown) {
  return norm(value).replace(/\D/g, '')
}

function imageLike(value: string) {
  return (
    /^https?:\/\//i.test(value) ||
    /\.(?:jpe?g|png|webp|gif|avif)(?:$|\?)/i.test(value) ||
    /(?:^|\/)images?\//i.test(value) ||
    /(?:^|\/)photos?\//i.test(value)
  )
}

function imageKey(key: string) {
  return /image|photo|picture|media|inspection|archive|storage_path|signed_url/i.test(key)
}

function extractImageCandidates(
  value: unknown,
  source: string,
  output: ImageCandidate[],
  contextKey = '',
  depth = 0,
) {
  if (depth > 5 || value === null || value === undefined) return

  if (typeof value === 'string') {
    if (imageLike(value) && (imageKey(contextKey) || /^https?:\/\//i.test(value))) {
      output.push({ raw: value, source })
    }
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      extractImageCandidates(entry, source, output, contextKey, depth + 1)
    }
    return
  }

  if (typeof value !== 'object') return

  const row = value as GenericRow
  const explicit = [
    'signed_url',
    'signedUrl',
    'url',
    'image_url',
    'photo_url',
    'storage_path',
    'storagePath',
    'path',
  ]

  for (const key of explicit) {
    const raw = row[key]
    if (
      typeof raw === 'string' &&
      raw.trim() &&
      (key === 'storage_path' || key === 'storagePath' || imageKey(key) || imageLike(raw))
    ) {
      output.push({
        raw: raw.trim(),
        bucket: typeof row.bucket === 'string' ? row.bucket : typeof row.bucket_name === 'string' ? row.bucket_name : null,
        filename: typeof row.original_filename === 'string' ? row.original_filename : typeof row.filename === 'string' ? row.filename : null,
        source,
        purchaseId: typeof row.purchase_id === 'string' ? row.purchase_id : null,
      })
    }
  }

  for (const [key, child] of Object.entries(row)) {
    if (explicit.includes(key)) continue
    if (!imageKey(key) && depth > 0) continue
    extractImageCandidates(child, source, output, key, depth + 1)
  }
}

async function dynamicRows(
  supabase: SupabaseClient,
  table: string,
  relationColumn: string,
  ids: string[],
) {
  if (!ids.length) return []
  const response = await supabase
    .from(table as never)
    .select('*')
    .in(relationColumn as never, ids as never)

  const typed = response as unknown as {
    data: unknown
    error: { message: string } | null
  }

  return typed.error ? [] : asRows(typed.data)
}

async function resolveCandidate(
  supabase: SupabaseClient,
  candidate: ImageCandidate,
): Promise<ResolvedImage | null> {
  const raw = candidate.raw.trim()
  if (!raw) return null

  const fallbackFilename = raw.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() || 'bild'
  const filename = candidate.filename || fallbackFilename

  if (/^https?:\/\//i.test(raw)) {
    return {
      url: raw,
      filename,
      source: candidate.source,
      purchaseId: candidate.purchaseId,
    }
  }

  const buckets = [candidate.bucket, ...imageBucketCandidates].filter(
    (value, index, list): value is string => Boolean(value) && list.indexOf(value) === index,
  )

  for (const bucket of buckets) {
    let path = raw.replace(/^\/+/, '')
    if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1)

    const signed = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
    if (!signed.error && signed.data?.signedUrl) {
      return {
        url: signed.data.signedUrl,
        filename,
        source: candidate.source,
        purchaseId: candidate.purchaseId,
      }
    }
  }

  return null
}

async function resolvePackageImages(
  supabase: SupabaseClient,
  packageRows: GenericRow[],
) {
  const packageIds = packageRows.map((row) => norm(row.id)).filter(Boolean)
  const candidatesByPackage = new Map<string, ImageCandidate[]>()
  const purchaseIdsByPackage = new Map<string, Set<string>>()

  const ensureCandidates = (packageId: string) => {
    const current = candidatesByPackage.get(packageId) ?? []
    candidatesByPackage.set(packageId, current)
    return current
  }

  const ensurePurchases = (packageId: string) => {
    const current = purchaseIdsByPackage.get(packageId) ?? new Set<string>()
    purchaseIdsByPackage.set(packageId, current)
    return current
  }

  for (const pkg of packageRows) {
    const packageId = norm(pkg.id)
    if (!packageId) continue
    extractImageCandidates(pkg, 'OLAEET-Paket', ensureCandidates(packageId))

    const purchaseId = norm(pkg.purchase_id)
    if (purchaseId) ensurePurchases(packageId).add(purchaseId)
    if (Array.isArray(pkg.purchase_ids)) {
      for (const value of pkg.purchase_ids) {
        const id = norm(value)
        if (id) ensurePurchases(packageId).add(id)
      }
    }
  }

  const relationColumns = ['warehouse_package_id', 'package_id']

  for (const table of packageImageTableCandidates) {
    for (const relationColumn of relationColumns) {
      const rows = await dynamicRows(supabase, table, relationColumn, packageIds)
      if (!rows.length) continue

      for (const row of rows) {
        const packageId = norm(row[relationColumn])
        if (!packageId) continue
        extractImageCandidates(row, 'OLAEET-Paket', ensureCandidates(packageId))
      }
      break
    }
  }

  for (const table of packagePurchaseRelationTableCandidates) {
    for (const relationColumn of relationColumns) {
      const rows = await dynamicRows(supabase, table, relationColumn, packageIds)
      if (!rows.length) continue

      for (const row of rows) {
        const packageId = norm(row[relationColumn])
        const purchaseId = norm(row.purchase_id || row.purchaseId)
        if (packageId && purchaseId) ensurePurchases(packageId).add(purchaseId)
      }
      break
    }
  }

  for (const directColumn of ['warehouse_package_id', 'package_id']) {
    const rows = await dynamicRows(supabase, 'purchases', directColumn, packageIds)
    for (const row of rows) {
      const packageId = norm(row[directColumn])
      const purchaseId = norm(row.id)
      if (packageId && purchaseId) ensurePurchases(packageId).add(purchaseId)
    }
  }

  const allPurchaseIds = [...new Set([...purchaseIdsByPackage.values()].flatMap((set) => [...set]))]
  let purchaseImages: GenericRow[] = []

  if (allPurchaseIds.length) {
    const response = await supabase
      .from('purchase_images')
      .select('*')
      .in('purchase_id', allPurchaseIds)

    if (!response.error && Array.isArray(response.data)) {
      purchaseImages = response.data as unknown as GenericRow[]
    }
  }

  const purchaseImagesByPurchase = new Map<string, GenericRow[]>()
  for (const image of purchaseImages) {
    const purchaseId = norm(image.purchase_id)
    if (!purchaseId) continue
    const current = purchaseImagesByPurchase.get(purchaseId) ?? []
    current.push(image)
    purchaseImagesByPurchase.set(purchaseId, current)
  }

  for (const [packageId, purchaseIds] of purchaseIdsByPackage) {
    const bucket = ensureCandidates(packageId)
    for (const purchaseId of purchaseIds) {
      for (const image of purchaseImagesByPurchase.get(purchaseId) ?? []) {
        extractImageCandidates(image, 'Bunjang-Einkauf', bucket)
      }
    }
  }

  const result = new Map<string, ResolvedImage[]>()

  for (const packageId of packageIds) {
    const candidates = ensureCandidates(packageId)
    const deduped = new Map<string, ImageCandidate>()
    for (const candidate of candidates) {
      const key = `${candidate.raw}|${candidate.source}`
      if (!deduped.has(key)) deduped.set(key, candidate)
    }

    const resolved = await Promise.all(
      [...deduped.values()].slice(0, 80).map((candidate) => resolveCandidate(supabase, candidate)),
    )

    const byUrl = new Map<string, ResolvedImage>()
    for (const image of resolved) {
      if (image && !byUrl.has(image.url)) byUrl.set(image.url, image)
    }
    result.set(packageId, [...byUrl.values()])
  }

  return result
}

export async function GET(request: Request) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const shipmentRef = String(url.searchParams.get('shipmentRef') || '').trim()
  if (!shipmentRef) {
    return NextResponse.json({ error: 'shipmentRef fehlt.' }, { status: 400 })
  }

  try {
    let shipmentId: string | null = null
    let externalShipmentId: string | null = null
    let baseShipment: GenericRow | null = null

    if (/^SHP-\d{8}-[A-Z0-9]+$/i.test(shipmentRef)) {
      externalShipmentId = shipmentRef.toUpperCase()
    } else {
      const baseResponse = await auth.supabase
        .from('shipments')
        .select('*')
        .eq('id', shipmentRef)
        .eq('user_id', auth.user.id)
        .maybeSingle()

      if (!baseResponse.error && baseResponse.data) {
        baseShipment = objectRow(baseResponse.data)
        shipmentId = String(baseShipment?.id || shipmentRef)
        externalShipmentId = String(
          baseShipment?.external_shipment_id ||
            baseShipment?.shipment_number ||
            baseShipment?.provider_shipment_id ||
            '',
        ).trim() || null
      }
    }

    let extraction: GenericRow | null = null

    if (shipmentId) {
      const response = await auth.supabase
        .from('olaeet_shipment_extractions' as never)
        .select('*')
        .eq('user_id' as never, auth.user.id as never)
        .eq('shipment_id' as never, shipmentId as never)
        .maybeSingle()

      if (!response.error && response.data) extraction = objectRow(response.data)
    }

    if (!extraction && externalShipmentId) {
      const response = await auth.supabase
        .from('olaeet_shipment_extractions' as never)
        .select('*')
        .eq('user_id' as never, auth.user.id as never)
        .eq('external_shipment_id' as never, externalShipmentId as never)
        .maybeSingle()

      if (!response.error && response.data) {
        extraction = objectRow(response.data)
        shipmentId = String(extraction?.shipment_id || shipmentId || '') || null
      }
    }

    if (!extraction) return NextResponse.json({ found: false, baseShipment })

    const resolvedShipmentId = String(extraction.shipment_id || shipmentId || '')
    const extractedPackages = arrayRows(extraction.packages)
    const extractedByExternal = new Map(
      extractedPackages.map((row) => [norm(row.externalPackageId || row.external_package_id).toUpperCase(), row]),
    )
    const extractedByTracking = new Map(
      extractedPackages
        .map((row) => [tracking(row.domesticTrackingNumber || row.domestic_tracking_number), row] as const)
        .filter(([value]) => Boolean(value)),
    )

    const warehouseById = new Map<string, GenericRow>()

    if (resolvedShipmentId) {
      const direct = await auth.supabase
        .from('warehouse_packages')
        .select('*')
        .eq('user_id', auth.user.id)
        .eq('shipment_id' as never, resolvedShipmentId as never)

      if (!direct.error && Array.isArray(direct.data)) {
        for (const row of direct.data as unknown as GenericRow[]) warehouseById.set(norm(row.id), row)
      }
    }

    const linkResponse = resolvedShipmentId
      ? await auth.supabase
          .from('olaeet_shipment_package_links' as never)
          .select('*')
          .eq('user_id' as never, auth.user.id as never)
          .eq('shipment_id' as never, resolvedShipmentId as never)
      : { data: [], error: null }

    const links = linkResponse.error ? [] : asRows(linkResponse.data)
    const linkedIds = links.map((row) => norm(row.warehouse_package_id)).filter(Boolean)

    if (linkedIds.length) {
      const response = await auth.supabase
        .from('warehouse_packages')
        .select('*')
        .eq('user_id', auth.user.id)
        .in('id', linkedIds)

      if (!response.error && Array.isArray(response.data)) {
        for (const row of response.data as unknown as GenericRow[]) warehouseById.set(norm(row.id), row)
      }
    }

    const extractedExternalIds = [...extractedByExternal.keys()].filter(Boolean)
    if (extractedExternalIds.length) {
      const response = await auth.supabase
        .from('warehouse_packages')
        .select('*')
        .eq('user_id', auth.user.id)
        .in('external_package_id', extractedExternalIds)

      if (!response.error && Array.isArray(response.data)) {
        for (const row of response.data as unknown as GenericRow[]) warehouseById.set(norm(row.id), row)
      }
    }

    const warehouseRows = [...warehouseById.values()]
    const imageMap = await resolvePackageImages(auth.supabase, warehouseRows)

    const linkedByWarehouseId = new Map(links.map((row) => [norm(row.warehouse_package_id), row]))
    const packages = warehouseRows
      .map((warehouse) => {
        const warehouseId = norm(warehouse.id)
        const external = norm(warehouse.external_package_id).toUpperCase()
        const domestic = tracking(warehouse.domestic_tracking_number)
        const extracted = extractedByExternal.get(external) || extractedByTracking.get(domestic) || null
        const link = linkedByWarehouseId.get(warehouseId) || null

        return {
          warehouse_package_id: warehouseId,
          external_package_id:
            norm(link?.external_package_id) || norm(extracted?.externalPackageId || extracted?.external_package_id) || norm(warehouse.external_package_id),
          domestic_tracking_number:
            norm(link?.domestic_tracking_number) || norm(extracted?.domesticTrackingNumber || extracted?.domestic_tracking_number) || norm(warehouse.domestic_tracking_number),
          item_category: norm(link?.item_category) || norm(extracted?.itemCategory || extracted?.item_category) || null,
          recipient_masked: norm(link?.recipient_masked) || norm(extracted?.recipientMasked || extracted?.recipient_masked) || null,
          match_method: norm(link?.match_method) || (external && extractedByExternal.has(external) ? 'storage-number' : 'tracking'),
          warehousePackage: warehouse,
          images: imageMap.get(warehouseId) ?? [],
        }
      })
      .sort((left, right) => norm(left.external_package_id).localeCompare(norm(right.external_package_id)))

    return NextResponse.json({
      found: true,
      shipmentId: resolvedShipmentId || null,
      externalShipmentId: extraction.external_shipment_id || externalShipmentId,
      baseShipment,
      extraction,
      packages,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Sendungsdetails konnten nicht geladen werden.',
      },
      { status: 400 },
    )
  }
}
