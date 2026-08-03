import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import net from 'node:net'

const DEFAULT_TIMEOUT_MS = 12_000
const DNS_TIMEOUT_MS = 5_000
const DEFAULT_MAX_REDIRECTS = 4

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SafeFetchError'
  }
}

export interface SafeFetchResult {
  url: string
  status: number
  headers: Record<string, string>
  body: Buffer
}

export function isAllowedListingHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return (
    host === 'bunjang.co.kr' ||
    host.endsWith('.bunjang.co.kr') ||
    host === 'globalbunjang.com' ||
    host.endsWith('.globalbunjang.com')
  )
}

export function normalizeListingUrl(input: string) {
  let candidate = input.trim()
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new SafeFetchError('Die Angebots-URL ist ungültig.')
  }

  if (url.protocol === 'http:') url.protocol = 'https:'
  if (url.protocol !== 'https:') throw new SafeFetchError('Nur HTTPS-URLs sind erlaubt.')
  url.hostname = url.hostname.replace(/\.$/, '')
  if (url.username || url.password) throw new SafeFetchError('URLs mit Zugangsdaten sind nicht erlaubt.')
  if (url.port && url.port !== '443') throw new SafeFetchError('Nicht standardmäßige Ports sind nicht erlaubt.')
  if (!isAllowedListingHostname(url.hostname)) {
    throw new SafeFetchError('Version 1 akzeptiert nur Bunjang- und Global-Bunjang-URLs.')
  }

  url.hash = ''
  return url.toString()
}

function isPublicIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a >= 224) return false
  return true
}

function parseIpv6(address: string): bigint | null {
  let normalized = address.toLowerCase().split('%')[0]
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1)
  }

  const ipv4Match = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (ipv4Match) {
    const ipv4 = ipv4Match[1].split('.').map(Number)
    if (ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
    const first = ((ipv4[0] << 8) | ipv4[1]).toString(16)
    const second = ((ipv4[2] << 8) | ipv4[3]).toString(16)
    normalized = `${normalized.slice(0, -ipv4Match[1].length)}${first}:${second}`
  }

  if ((normalized.match(/::/g) ?? []).length > 1) return null
  const [leftRaw, rightRaw] = normalized.split('::')
  const left = leftRaw ? leftRaw.split(':') : []
  const right = rightRaw ? rightRaw.split(':') : []

  if (normalized.includes('::')) {
    const missing = 8 - left.length - right.length
    if (missing < 1) return null
    left.push(...Array.from({ length: missing }, () => '0'))
  }

  const parts = [...left, ...right]
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null

  return parts.reduce((value, part) => (value << 16n) | BigInt(`0x${part}`), 0n)
}

function ipv6InPrefix(value: bigint, prefixAddress: string, prefixLength: number) {
  const prefix = parseIpv6(prefixAddress)
  if (prefix === null) return false
  const shift = BigInt(128 - prefixLength)
  return value >> shift === prefix >> shift
}

function ipv4FromLow32Bits(value: bigint) {
  const raw = Number(value & 0xffff_ffffn)
  return [raw >>> 24, (raw >>> 16) & 255, (raw >>> 8) & 255, raw & 255].join('.')
}

function isPublicIpv6(address: string) {
  const value = parseIpv6(address)
  if (value === null) return false

  if (value === 0n || value === 1n) return false
  if (ipv6InPrefix(value, '::', 96)) return false
  if (ipv6InPrefix(value, '::ffff:0:0', 96)) return isPublicIpv4(ipv4FromLow32Bits(value))
  if (ipv6InPrefix(value, '64:ff9b::', 96) || ipv6InPrefix(value, '64:ff9b:1::', 48)) return false
  if (ipv6InPrefix(value, '100::', 64)) return false
  if (ipv6InPrefix(value, '2001::', 23)) return false
  if (ipv6InPrefix(value, '2001:2::', 48)) return false
  if (ipv6InPrefix(value, '2001:10::', 28)) return false
  if (ipv6InPrefix(value, '2001:db8::', 32)) return false
  if (ipv6InPrefix(value, '2002::', 16)) return false
  if (ipv6InPrefix(value, '3fff::', 20)) return false
  if (ipv6InPrefix(value, 'fc00::', 7)) return false
  if (ipv6InPrefix(value, 'fe80::', 10)) return false
  if (ipv6InPrefix(value, 'fec0::', 10)) return false
  if (ipv6InPrefix(value, 'ff00::', 8)) return false
  return true
}

function isPublicAddress(address: string) {
  const family = net.isIP(address)
  if (family === 4) return isPublicIpv4(address)
  if (family === 6) return isPublicIpv6(address)
  return false
}

async function resolvePinnedAddress(hostname: string) {
  const normalizedHost = hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(normalizedHost)) {
    throw new SafeFetchError('Direkte IP-Adressen sind als Abrufziel nicht erlaubt.')
  }

  let records: Array<{ address: string; family: number }>
  let dnsTimer: ReturnType<typeof setTimeout> | undefined
  try {
    records = await Promise.race([
      lookup(normalizedHost, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        dnsTimer = setTimeout(
          () => reject(new SafeFetchError('Zeitüberschreitung bei der DNS-Auflösung.')),
          DNS_TIMEOUT_MS,
        )
      }),
    ])
  } catch (error) {
    if (error instanceof SafeFetchError) throw error
    throw new SafeFetchError('Hostname konnte nicht sicher aufgelöst werden.')
  } finally {
    if (dnsTimer) clearTimeout(dnsTimer)
  }

  if (!records.length) throw new SafeFetchError('Hostname konnte nicht aufgelöst werden.')
  if (records.some((record) => !isPublicAddress(record.address))) {
    throw new SafeFetchError('Hostname verweist auf eine private oder reservierte Adresse.')
  }
  return records[0]
}

function headersToRecord(headers: Record<string, string | string[] | undefined>) {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) result[key.toLowerCase()] = value.join(', ')
    else if (value !== undefined) result[key.toLowerCase()] = value
  }
  return result
}

async function requestOnce(
  url: URL,
  options: { maxBytes: number; timeoutMs: number; accept: string },
): Promise<SafeFetchResult> {
  const pinned = await resolvePinnedAddress(url.hostname)

  return new Promise((resolve, reject) => {
    let settled = false

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      reject(error)
    }

    const succeed = (value: SafeFetchResult) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(value)
    }

    const request = httpsRequest(
      {
        protocol: 'https:',
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        servername: url.hostname,
        lookup: ((
          _hostname: string,
          lookupOptions: { all?: boolean },
          callback: (
            error: Error | null,
            result:
              | string
              | Array<{
                  address: string
                  family: number
                }>,
            family?: number,
          ) => void,
        ) => {
          if (lookupOptions?.all) {
            callback(null, [
              {
                address: pinned.address,
                family: pinned.family,
              },
            ])
            return
          }

          callback(null, pinned.address, pinned.family)
        }) as never,
        headers: {
          accept: options.accept,
          'accept-language': 'de-DE,de;q=0.9,en;q=0.7,ko;q=0.5',
          'accept-encoding': 'identity',
          'user-agent': 'CardCargo/0.1 (private user-initiated listing archive)',
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        let total = 0

        response.on('data', (chunk: Buffer) => {
          total += chunk.length
          if (total > options.maxBytes) {
            request.destroy(new SafeFetchError(`Antwort ist größer als ${options.maxBytes} Bytes.`))
            return
          }
          chunks.push(Buffer.from(chunk))
        })

        response.on('aborted', () => fail(new SafeFetchError('Der Abruf wurde vorzeitig beendet.')))
        response.on('error', (error) => fail(error))
        response.on('end', () => {
          succeed({
            url: url.toString(),
            status: response.statusCode ?? 0,
            headers: headersToRecord(response.headers),
            body: Buffer.concat(chunks),
          })
        })
      },
    )

    const timer = setTimeout(() => {
      request.destroy(new SafeFetchError('Zeitüberschreitung beim Abruf.'))
    }, options.timeoutMs)

    request.on('error', (error) => fail(error))
    request.end()
  })
}

export async function safeGet(
  input: string,
  options: {
    maxBytes: number
    accept: string
    listingOnly?: boolean
    timeoutMs?: number
    maxRedirects?: number
  },
) {
  let current = new URL(input)
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (current.protocol !== 'https:') throw new SafeFetchError('Nur HTTPS-Ziele sind erlaubt.')
    if (current.username || current.password) throw new SafeFetchError('URL-Zugangsdaten sind nicht erlaubt.')
    if (current.port && current.port !== '443') throw new SafeFetchError('Nicht standardmäßige Ports sind blockiert.')
    if (options.listingOnly && !isAllowedListingHostname(current.hostname)) {
      throw new SafeFetchError('Weiterleitung auf eine nicht erlaubte Angebotsdomain blockiert.')
    }

    const response = await requestOnce(current, {
      maxBytes: options.maxBytes,
      accept: options.accept,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    })

    const location = response.headers.location
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      if (redirectCount === maxRedirects) throw new SafeFetchError('Zu viele Weiterleitungen.')
      try {
        current = new URL(location, current)
      } catch {
        throw new SafeFetchError('Die Zielseite lieferte eine ungültige Weiterleitung.')
      }
      continue
    }

    return { ...response, url: current.toString() }
  }

  throw new SafeFetchError('Abruf fehlgeschlagen.')
}
