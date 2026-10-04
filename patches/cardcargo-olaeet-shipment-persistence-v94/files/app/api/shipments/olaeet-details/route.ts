import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'

type GenericRow = Record<string, unknown>

function objectRow(value: unknown): GenericRow | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GenericRow)
    : null
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

      if (!response.error && response.data) {
        extraction = objectRow(response.data)
      }
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

    if (!extraction) {
      return NextResponse.json({ found: false, baseShipment })
    }

    const resolvedShipmentId = String(extraction.shipment_id || shipmentId || '')

    const linksResponse = resolvedShipmentId
      ? await auth.supabase
          .from('olaeet_shipment_package_links' as never)
          .select(
            'warehouse_package_id, external_package_id, domestic_tracking_number, item_category, recipient_masked, match_method',
          )
          .eq('user_id' as never, auth.user.id as never)
          .eq('shipment_id' as never, resolvedShipmentId as never)
          .order('external_package_id' as never, { ascending: true } as never)
      : { data: [], error: null }

    const links = Array.isArray(linksResponse.data)
      ? (linksResponse.data as unknown as GenericRow[])
      : []

    const warehouseIds = links
      .map((row) => String(row.warehouse_package_id || ''))
      .filter(Boolean)

    let warehouseRows: GenericRow[] = []
    if (warehouseIds.length) {
      const warehouseResponse = await auth.supabase
        .from('warehouse_packages')
        .select('*')
        .eq('user_id', auth.user.id)
        .in('id', warehouseIds)

      if (!warehouseResponse.error && Array.isArray(warehouseResponse.data)) {
        warehouseRows = warehouseResponse.data as unknown as GenericRow[]
      }
    }

    const warehouseById = new Map(
      warehouseRows.map((row) => [String(row.id), row]),
    )

    const packages = links.map((link) => ({
      ...link,
      warehousePackage: warehouseById.get(String(link.warehouse_package_id)) || null,
    }))

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
