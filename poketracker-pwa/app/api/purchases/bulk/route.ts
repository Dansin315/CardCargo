import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const purchaseStatusSchema = z.enum([
  'planned',
  'ordered',
  'paid',
  'shipped_domestic',
  'warehouse_received',
  'consolidated',
  'international_transit',
  'delivered',
  'cancelled',
])

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Kaufdatum.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  }, 'Das Kaufdatum existiert nicht.')

const bulkPurchaseSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Wähle mindestens einen Einkauf aus.').max(200),
  changes: z
    .object({
      status: purchaseStatusSchema.optional(),
      purchasedAt: dateOnlySchema.nullable().optional(),
    })
    .refine((changes) => changes.status !== undefined || changes.purchasedAt !== undefined, {
      message: 'Wähle mindestens ein Feld für die Massenbearbeitung aus.',
    }),
})

export async function PATCH(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const input = bulkPurchaseSchema.parse(await request.json())
    const ids = [...new Set(input.ids)]
    const admin = createAdminClient()

    const { data: existing, error: existingError } = await admin
      .from('purchases')
      .select('id')
      .eq('user_id', auth.user.id)
      .in('id', ids)

    if (existingError) throw new Error(existingError.message)
    if ((existing ?? []).length !== ids.length) {
      return NextResponse.json({ error: 'Mindestens ein ausgewählter Einkauf wurde nicht gefunden.' }, { status: 404 })
    }

    const update: Record<string, string | null> = {}
    if (input.changes.status !== undefined) update.status = input.changes.status
    if (input.changes.purchasedAt !== undefined) update.purchased_at = input.changes.purchasedAt

    const { data, error } = await admin
      .from('purchases')
      .update(update)
      .eq('user_id', auth.user.id)
      .in('id', ids)
      .select('id')

    if (error) throw new Error(error.message)

    revalidatePath('/')
    revalidatePath('/purchases')
    revalidatePath('/warehouse-packages')

    return NextResponse.json({ updated: data?.length ?? 0 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Ungültige Eingabe.' }, { status: 422 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Massenbearbeitung fehlgeschlagen.' }, { status: 400 })
  }
}
