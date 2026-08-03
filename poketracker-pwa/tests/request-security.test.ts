import { describe, expect, it } from 'vitest'
import { hasTrustedRequestOrigin } from '@/lib/request-security'

function postRequest(headers: Record<string, string>) {
  return new Request('https://cardcargo.example/api/purchases', {
    method: 'POST',
    headers,
  })
}

describe('hasTrustedRequestOrigin', () => {
  it('accepts a same-origin browser request', () => {
    expect(
      hasTrustedRequestOrigin(
        postRequest({
          origin: 'https://cardcargo.example',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(true)
  })

  it('rejects a foreign origin', () => {
    expect(
      hasTrustedRequestOrigin(
        postRequest({
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
        }),
      ),
    ).toBe(false)
  })

  it('accepts a missing Origin only with same-origin fetch metadata', () => {
    expect(hasTrustedRequestOrigin(postRequest({ 'sec-fetch-site': 'same-origin' }))).toBe(true)
    expect(hasTrustedRequestOrigin(postRequest({}))).toBe(false)
  })
})
