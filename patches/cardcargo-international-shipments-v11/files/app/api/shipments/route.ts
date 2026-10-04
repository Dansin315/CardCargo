import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { shipmentInputSchema } from '@/lib/shipment-schema'
import { carrierForShippingService } from '@/lib/shipments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function POST(request: Request) {
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

  let shipmentId: string | null = null

  try {
    const input = shipmentInputSchema.parse(await request.json())
    const { data, error } = await auth.supabase
      .from('shipments')
      .insert({
        user_id: auth.user.id,
        provider: 'OLAEET',
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
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    shipmentId = data.id

    const { error: linkError } = await auth.supabase.rpc('replace_shipment_packages', {
      p_shipment_id: data.id,
      p_warehouse_package_ids: input.warehousePackageIds,
    })
    if (linkError) throw new Error(linkError.message)

    revalidatePath('/shipments')
    revalidatePath(`/shipments/${data.id}`)
    revalidatePath('/warehouse-packages')
    for (const packageId of input.warehousePackageIds) {
      revalidatePath(`/warehouse-packages/${packageId}`)
    }

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error) {
    if (shipmentId) {
      await auth.supabase
        .from('shipments')
        .delete()
        .eq('id', shipmentId)
        .eq('user_id', auth.user.id)
    }
    return errorResponse(error, 'Die internationale Sendung konnte nicht gespeichert werden.')
  }
}
