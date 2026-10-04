import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { searchCardCatalog } from '@/lib/card-catalog-server'

export async function GET(request: Request) {
  await requireUser()
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')?.trim() || ''
  const cardNumber = searchParams.get('cardNumber')?.trim() || ''
  const setName = searchParams.get('setName')?.trim() || ''
  const language = searchParams.get('language')?.trim() || 'Korean'

  if (!name && !cardNumber && !setName) {
    return NextResponse.json(
      { error: 'Für die Katalogsuche mindestens Kartenname, Kartennummer oder Set angeben.' },
      { status: 400 },
    )
  }

  const result = await searchCardCatalog({
    name,
    cardNumber,
    setName,
    itemLanguage: language,
    includeFallback: searchParams.get('includeFallback') !== '0',
  })
  return NextResponse.json(result)
}
