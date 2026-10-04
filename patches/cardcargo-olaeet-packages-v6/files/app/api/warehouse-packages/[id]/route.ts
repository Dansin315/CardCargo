import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { warehousePackageInputSchema } from '@/lib/warehouse-package-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const packageIdSchema = z.string().uuid('Ungültige Paket-ID.')
type RouteContext = { params: Promise<{ id: string }> }

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message || fallback },
      { status: 422 },
    )
  }

  const message = error instanceof Error ? error.message : fallback
  const duplicate = /duplicate key|warehouse_packages_external_unique/i.test(message)
  return NextResponse.json(
    {
      error: duplicate
        ? 'Diese OLAEET-Paket-ID wurde bereits erfasst.'
        : message,
    },
    { status: duplicate ? 409 : 400 },
  )
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id: rawId } = await context.params
    const id = packageIdSchema.parse(rawId)
    const input = warehousePackageInputSchema.parse(await request.json())

    const { data, error } = await auth.supabase
      .from('warehouse_packages')
      .update({
        external_package_id: input.externalPackageId,
        customer_code: input.customerCode,
        domestic_tracking_number: input.domesticTrackingNumber,
        domestic_carrier: input.domesticCarrier,
        sender_name: input.senderName,
        package_description: input.packageDescription,
        provider_status: input.providerStatus,
        status: input.status,
        arrived_at: input.arrivedAt,
        inspected_at: input.inspectedAt,
        storage_started_at: input.storageStartedAt,
        storage_deadline_at: input.storageDeadlineAt,
        weight_grams: input.weightGrams,
        length_cm: input.lengthCm,
        width_cm: input.widthCm,
        height_cm: input.heightCm,
        notes: input.notes,
      })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'OLAEET-Paket nicht gefunden.' }, { status: 404 })

    const { error: linkError } = await auth.supabase.rpc(
      'replace_warehouse_package_purchases',
      {
        p_package_id: id,
        p_purchase_ids: input.purchaseIds,
      },
    )
    if (linkError) throw new Error(linkError.message)

    revalidatePath('/warehouse-packages')
    revalidatePath(`/warehouse-packages/${id}`)
    revalidatePath(`/warehouse-packages/${id}/edit`)
    revalidatePath('/purchases')
    for (const purchaseId of input.purchaseIds) revalidatePath(`/purchases/${purchaseId}`)

    return NextResponse.json({ id })
  } catch (error) {
    return errorResponse(error, 'Das OLAEET-Paket konnte nicht aktualisiert werden.')
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id: rawId } = await context.params
    const id = packageIdSchema.parse(rawId)

    const { data: shipmentLink, error: shipmentError } = await auth.supabase
      .from('shipment_packages')
      .select('shipment_id')
      .eq('warehouse_package_id', id)
      .eq('user_id', auth.user.id)
      .limit(1)
      .maybeSingle()

    if (shipmentError) throw new Error(shipmentError.message)
    if (shipmentLink) {
      return NextResponse.json(
        {
          error:
            'Dieses Paket ist bereits einer internationalen Sendung zugeordnet. Entferne zuerst die Sendungszuordnung.',
        },
        { status: 409 },
      )
    }

    const { data: purchaseLinks, error: linkReadError } = await auth.supabase
      .from('warehouse_package_purchases')
      .select('purchase_id')
      .eq('warehouse_package_id', id)
      .eq('user_id', auth.user.id)

    if (linkReadError) throw new Error(linkReadError.message)

    const { data: deleted, error } = await auth.supabase
      .from('warehouse_packages')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!deleted) return NextResponse.json({ error: 'OLAEET-Paket nicht gefunden.' }, { status: 404 })

    revalidatePath('/warehouse-packages')
    revalidatePath('/purchases')
    for (const link of purchaseLinks ?? []) revalidatePath(`/purchases/${link.purchase_id}`)

    return NextResponse.json({ id })
  } catch (error) {
    return errorResponse(error, 'Das OLAEET-Paket konnte nicht gelöscht werden.')
  }
}
