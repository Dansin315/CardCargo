import { describe, expect, it } from 'vitest'
import {
  cardNumberNumerator,
  catalogMatchType,
  comparableCardNumber,
  displayCardNumber,
  tcgdexCatalogLanguage,
  tcgdexImageUrl,
  variantLabels,
} from '@/lib/card-catalog-types'

describe('Inventory v1 card catalog helpers', () => {
  it('extracts the printed numerator', () => {
    expect(cardNumberNumerator('025/165')).toBe('025')
    expect(comparableCardNumber('025/165')).toBe('25')
    expect(comparableCardNumber('25')).toBe('25')
  })

  it('uses English TCGdex data as a Korean reference fallback', () => {
    expect(tcgdexCatalogLanguage('Korean')).toBe('en')
    expect(catalogMatchType('Korean', 'en')).toBe('equivalent_language')
    expect(tcgdexCatalogLanguage('Japanese')).toBe('ja')
    expect(catalogMatchType('Japanese', 'ja')).toBe('exact_language')
  })

  it('builds TCGdex card asset URLs and display numbers', () => {
    expect(tcgdexImageUrl('https://assets.tcgdex.net/en/swsh/swsh3/136', 'low')).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh3/136/low.webp',
    )
    expect(displayCardNumber('136', 189)).toBe('136/189')
  })

  it('normalizes available variants', () => {
    expect(variantLabels({ normal: true, reverse: true, holo: false })).toEqual([
      'Normal',
      'Reverse Holo',
    ])
  })
})
