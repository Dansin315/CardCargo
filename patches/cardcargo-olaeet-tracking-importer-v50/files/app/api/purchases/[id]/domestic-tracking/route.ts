import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const nullableText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullable()
    .default(null)
    .transform((value) => value || null)

const inputSchema = z.object({
  domesticCarrier: nullableText(120),
  domesticTrackingNumber: nullableText(200),
})

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { id } = await context.params
    const input = inputSchema.parse(await request.json())

    const { data, error } = await auth.supabase
      .from('purchases')
      .update({
        domestic_carrier: input.domesticCarrier,
        domestic_tracking_number: input.domesticTrackingNumber,
      })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id, domestic_carrier, domestic_tracking_number')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) {
      return NextResponse.json({ error: 'Einkauf nicht gefunden.' }, { status: 404 })
    }

    return NextResponse.json({ purchase: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Ungültige Trackingdaten.' },
        { status: 422 },
      )
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Trackingdaten konnten nicht gespeichert werden.',
      },
      { status: 400 },
    )
  }
}
