import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { warehousePackageInputSchema } from '@/lib/warehouse-package-schema'

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

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const input = warehousePackageInputSchema.parse(await request.json())
    const { data, error } = await auth.supabase
      .from('warehouse_packages')
      .insert({
        user_id: auth.user.id,
        provider: 'OLAEET',
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
        record_source: 'manual',
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)

    const { error: linkError } = await auth.supabase.rpc(
      'replace_warehouse_package_purchases',
      {
        p_package_id: data.id,
        p_purchase_ids: input.purchaseIds,
      },
    )

    if (linkError) {
      await auth.supabase.from('warehouse_packages').delete().eq('id', data.id)
      throw new Error(linkError.message)
    }

    revalidatePath('/warehouse-packages')
    revalidatePath('/purchases')
    for (const purchaseId of input.purchaseIds) revalidatePath(`/purchases/${purchaseId}`)

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error) {
    return errorResponse(error, 'Das OLAEET-Paket konnte nicht gespeichert werden.')
  }
}
