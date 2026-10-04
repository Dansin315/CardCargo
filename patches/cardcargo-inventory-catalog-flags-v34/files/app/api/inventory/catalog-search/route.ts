import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { searchCardCatalog } from '@/lib/card-catalog-server'
import { catalogItemLanguage } from '@/lib/inventory-language-flags'

export const dynamic = 'force-dynamic'

function queryValue(url: URL, key: string, max: number) {
  return (url.searchParams.get(key) ?? '').trim().slice(0, max)
}

export async function GET(request: Request) {
  await requireUser()
  const url = new URL(request.url)
  const name = queryValue(url, 'name', 200)
  const cardNumber = queryValue(url, 'cardNumber', 80)
  const setCode = queryValue(url, 'setCode', 80)
  const itemLanguage = catalogItemLanguage(queryValue(url, 'itemLanguage', 80) || 'Korean')

  if (!name && !cardNumber && !setCode) {
    return NextResponse.json(
      { error: 'Gib mindestens Kartenname, Kartennummer oder Setcode an.' },
      { status: 400 },
    )
  }

  try {
    const result = await searchCardCatalog({
      name: name || undefined,
      cardNumber: cardNumber || undefined,
      setCode: setCode || undefined,
      itemLanguage,
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kartenkatalog konnte nicht durchsucht werden.' },
      { status: 502 },
    )
  }
}
