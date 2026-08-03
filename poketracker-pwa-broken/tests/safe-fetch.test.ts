import { describe, expect, it } from 'vitest'
import {
  isAllowedListingHostname,
  normalizeListingUrl,
  safeGet,
  SafeFetchError,
} from '@/lib/importer/safe-fetch'

describe('Bunjang URL allowlist', () => {
  it('accepts official Bunjang hosts and subdomains', () => {
    expect(isAllowedListingHostname('bunjang.co.kr')).toBe(true)
    expect(isAllowedListingHostname('m.bunjang.co.kr')).toBe(true)
    expect(isAllowedListingHostname('globalbunjang.com')).toBe(true)
    expect(isAllowedListingHostname('www.globalbunjang.com')).toBe(true)
  })

  it('rejects lookalike domains', () => {
    expect(isAllowedListingHostname('bunjang.co.kr.evil.example')).toBe(false)
    expect(isAllowedListingHostname('notbunjang.co.kr')).toBe(false)
  })
})

describe('normalizeListingUrl', () => {
  it('adds HTTPS and removes fragments', () => {
    expect(normalizeListingUrl('m.bunjang.co.kr/products/123#gallery')).toBe(
      'https://m.bunjang.co.kr/products/123',
    )
  })

  it('upgrades HTTP to HTTPS', () => {
    expect(normalizeListingUrl('http://globalbunjang.com/product/abc')).toBe(
      'https://globalbunjang.com/product/abc',
    )
  })

  it.each([
    'https://bunjang.co.kr.evil.example/products/1',
    'https://user:password@bunjang.co.kr/products/1',
    'https://bunjang.co.kr:8443/products/1',
    'javascript:alert(1)',
  ])('rejects unsafe input %s', (input) => {
    expect(() => normalizeListingUrl(input)).toThrow(SafeFetchError)
  })
})


describe('safeGet SSRF boundary', () => {
  it.each(['https://127.0.0.1/private', 'https://[::1]/private'])(
    'blocks a direct IP target %s before connecting',
    async (url) => {
      await expect(
        safeGet(url, { maxBytes: 1_024, accept: 'text/plain', maxRedirects: 0 }),
      ).rejects.toThrow('Direkte IP-Adressen')
    },
  )
})
