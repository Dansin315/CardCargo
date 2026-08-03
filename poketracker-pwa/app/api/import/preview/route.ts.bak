import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import { previewBunjangListing } from '@/lib/importer/parse-listing'
import { previewRequestSchema } from '@/lib/importer/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Anfrage von fremder Origin blockiert.' }, { status: 403 })
  }

  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const input = previewRequestSchema.parse(await request.json())
    const preview = await previewBunjangListing(input.url)
    return NextResponse.json(preview)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Die Angebotsseite konnte nicht gelesen werden.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
