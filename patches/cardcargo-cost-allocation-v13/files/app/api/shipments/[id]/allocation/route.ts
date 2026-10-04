import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { shipmentCostAllocationInputSchema } from '@/lib/shipment-cost-allocation-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const shipmentIdSchema = z.string().uuid('Ungültige Sendungs-ID.')
type RouteContext = { params: Promise<{ id: string }> }

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message || 'Ungültige Kostenallokation.' },
      { status: 422 },
    )
  }

  const message = error instanceof Error ? error.message : 'Speichern fehlgeschlagen.'
  const migrationMissing = /save_shipment_cost_allocation|shipment_purchase_cost_allocations|shipment_cost_allocation_settings/i.test(
    message,
  )

  return NextResponse.json(
    {
      error: migrationMissing
        ? 'Die Kostenallokation ist in Supabase noch nicht eingerichtet. Führe 0010_shipment_cost_allocation.sql aus.'
        : message,
    },
    { status: 400 },
  )
}

export async function PUT(request: Request, context: RouteContext) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { id: rawId } = await context.params
    const shipmentId = shipmentIdSchema.parse(rawId)
    const input = shipmentCostAllocationInputSchema.parse(await request.json())

    const { error } = await auth.supabase.rpc('save_shipment_cost_allocation', {
      p_shipment_id: shipmentId,
      p_shipping_method: input.shippingMethod,
      p_forwarding_method: input.forwardingMethod,
      p_import_method: input.importMethod,
      p_allocations: input.allocations,
    })

    if (error) throw new Error(error.message)

    revalidatePath(`/shipments/${shipmentId}`)
    revalidatePath(`/shipments/${shipmentId}/allocation`)
    for (const allocation of input.allocations) {
      revalidatePath(`/purchases/${allocation.purchaseId}`)
      revalidatePath(`/warehouse-packages/${allocation.warehousePackageId}`)
    }

    return NextResponse.json({ id: shipmentId })
  } catch (error) {
    return errorResponse(error)
  }
}
