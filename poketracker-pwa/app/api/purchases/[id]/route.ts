import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { updatePurchaseSchema } from '@/lib/importer/schema'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'listing-images'
const purchaseIdSchema = z.string().uuid('Ungültige Einkaufs-ID.')

type RouteContext = { params: Promise<{ id: string }> }

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message || fallback },
      { status: 422 },
    )
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 400 },
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
    const id = purchaseIdSchema.parse(rawId)
    const input = updatePurchaseSchema.parse(await request.json())
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('purchases')
      .update({
        title: input.title,
        description: input.description || null,
        seller_name: input.sellerName || null,
        price_amount: input.priceAmount,
        domestic_shipping_amount: input.domesticShippingAmount,
        service_fee_amount: input.serviceFeeAmount,
        price_currency: input.priceCurrency,
        purchased_at: input.purchasedAt || null,
        status: input.status,
      })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'Einkauf nicht gefunden.' }, { status: 404 })

    revalidatePath('/purchases')
    revalidatePath(`/purchases/${id}`)
    revalidatePath(`/purchases/${id}/edit`)

    return NextResponse.json({ id })
  } catch (error) {
    return errorResponse(error, 'Der Einkauf konnte nicht aktualisiert werden.')
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
    const id = purchaseIdSchema.parse(rawId)
    const admin = createAdminClient()

    const { data: purchase, error: readError } = await admin
      .from('purchases')
      .select('id, purchase_images(storage_path)')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (readError) throw new Error(readError.message)
    if (!purchase) return NextResponse.json({ error: 'Einkauf nicht gefunden.' }, { status: 404 })

    const images = (purchase.purchase_images ?? []) as Array<{ storage_path: string }>
    const storagePaths = images
      .map((image) => image.storage_path)
      .filter((path) => path.startsWith(`${auth.user.id}/purchases/${id}/`))

    const { data: deleted, error: deleteError } = await admin
      .from('purchases')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id')
      .maybeSingle()

    if (deleteError) throw new Error(deleteError.message)
    if (!deleted) return NextResponse.json({ error: 'Einkauf nicht gefunden.' }, { status: 404 })

    const warnings: string[] = []
    if (storagePaths.length) {
      const { error: storageError } = await admin.storage.from(BUCKET).remove(storagePaths)
      if (storageError) {
        warnings.push(
          'Der Einkauf wurde gelöscht, aber mindestens eine archivierte Bilddatei konnte nicht automatisch bereinigt werden.',
        )
      }
    }

    revalidatePath('/purchases')
    revalidatePath(`/purchases/${id}`)

    return NextResponse.json({ id, warnings })
  } catch (error) {
    return errorResponse(error, 'Der Einkauf konnte nicht gelöscht werden.')
  }
}
