import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { searchCardCatalog } from '@/lib/card-catalog-server'

export async function GET(request: Request) {
  await requireUser()
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')?.trim() || ''
  const cardNumber = searchParams.get('cardNumber')?.trim() || ''
  const setCode = searchParams.get('setCode')?.trim() || ''
  const language = searchParams.get('language')?.trim() || 'Korean'

  if (!name && !cardNumber && !setCode) {
    return NextResponse.json(
      { error: 'Für die Katalogsuche mindestens Kartenname, Kartennummer oder Setcode angeben.' },
      { status: 400 },
    )
  }

  const result = await searchCardCatalog({
    name,
    cardNumber,
    setCode,
    itemLanguage: language,
    includeFallback: searchParams.get('includeFallback') !== '0',
  })
  return NextResponse.json(result)
}
