import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { shipmentInputSchema } from '@/lib/shipment-schema'
import { carrierForShippingService } from '@/lib/shipments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const shipmentIdSchema = z.string().uuid('Ungültige Sendungs-ID.')
type RouteContext = { params: Promise<{ id: string }> }

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message || fallback },
      { status: 422 },
    )
  }

  const message = error instanceof Error ? error.message : fallback
  const duplicate = /duplicate key|shipments_external_unique|shipment_packages_user_package_unique/i.test(
    message,
  )
  const schemaMissing = /replace_shipment_packages|shipping_service|total_weight_grams/i.test(
    message,
  )

  return NextResponse.json(
    {
      error: schemaMissing
        ? 'Die Sendungsdatenbank ist noch nicht vollständig eingerichtet. Führe die Migration 0007_international_shipments.sql in Supabase aus.'
        : duplicate
          ? 'Diese Sendung oder mindestens eines der ausgewählten OLAEET-Pakete ist bereits zugeordnet.'
          : message,
    },
    { status: duplicate ? 409 : 400 },
  )
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json(
      { error: 'Anfrage von fremder Origin blockiert.' },
      { status: 403 },
    )
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { id: rawId } = await context.params
    const id = shipmentIdSchema.parse(rawId)
    const input = shipmentInputSchema.parse(await request.json())

    const { data: currentShipment, error: currentShipmentError } = await auth.supabase
      .from('shipments')
      .select('id')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (currentShipmentError) throw new Error(currentShipmentError.message)
    if (!currentShipment) {
      return NextResponse.json({ error: 'Sendung nicht gefunden.' }, { status: 404 })
    }

    const { data: oldLinks, error: oldLinksError } = await auth.supabase
      .from('shipment_packages')
      .select('warehouse_package_id')
      .eq('shipment_id', id)
      .eq('user_id', auth.user.id)
    if (oldLinksError) throw new Error(oldLinksError.message)

    const { data, error } = await auth.supabase
      .from('shipments')
      .update({
        external_shipment_id: input.externalShipmentId,
        carrier: carrierForShippingService(input.shippingService),
        shipping_service: input.shippingService,
        tracking_number: input.trackingNumber,
        status: input.status,
        shipped_at: input.shippedAt,
        estimated_delivery_at: input.estimatedDeliveryAt,
        delivered_at: input.deliveredAt,
        total_weight_grams: input.totalWeightGrams,
        international_shipping_amount: input.internationalShippingAmount,
        forwarding_fee_amount: input.forwardingFeeAmount,
        import_tax_amount: input.importTaxAmount,
        currency: input.currency,
        notes: input.notes,
      })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) {
      return NextResponse.json({ error: 'Sendung nicht gefunden.' }, { status: 404 })
    }

    const { error: linkError } = await auth.supabase.rpc('replace_shipment_packages', {
      p_shipment_id: id,
      p_warehouse_package_ids: input.warehousePackageIds,
    })
    if (linkError) throw new Error(linkError.message)

    revalidatePath('/shipments')
    revalidatePath(`/shipments/${id}`)
    revalidatePath(`/shipments/${id}/edit`)
    revalidatePath('/warehouse-packages')
    const affectedPackageIds = new Set([
      ...(oldLinks ?? []).map((link) => link.warehouse_package_id),
      ...input.warehousePackageIds,
    ])
    for (const packageId of affectedPackageIds) {
      revalidatePath(`/warehouse-packages/${packageId}`)
    }

    return NextResponse.json({ id })
  } catch (error) {
    return errorResponse(error, 'Die internationale Sendung konnte nicht aktualisiert werden.')
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json(
      { error: 'Anfrage von fremder Origin blockiert.' },
      { status: 403 },
    )
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { id: rawId } = await context.params
    const id = shipmentIdSchema.parse(rawId)
    const { data: links, error: linksError } = await auth.supabase
      .from('shipment_packages')
      .select('warehouse_package_id')
      .eq('shipment_id', id)
      .eq('user_id', auth.user.id)
    if (linksError) throw new Error(linksError.message)

    const { data: deleted, error } = await auth.supabase
      .from('shipments')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!deleted) {
      return NextResponse.json({ error: 'Sendung nicht gefunden.' }, { status: 404 })
    }

    revalidatePath('/shipments')
    revalidatePath('/warehouse-packages')
    for (const link of links ?? []) {
      revalidatePath(`/warehouse-packages/${link.warehouse_package_id}`)
    }

    return NextResponse.json({ id })
  } catch (error) {
    return errorResponse(error, 'Die internationale Sendung konnte nicht gelöscht werden.')
  }
}
