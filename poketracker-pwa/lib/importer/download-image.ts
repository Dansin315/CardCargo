import { createHash } from 'node:crypto'
import { safeGet, SafeFetchError } from '@/lib/importer/safe-fetch'

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024

export function inspectImageBytes(bytes: Buffer) {
  if (!bytes.length) throw new SafeFetchError('Das Bild ist leer.')
  if (bytes.length > MAX_IMAGE_BYTES) throw new SafeFetchError('Das Bild ist größer als 6 MB.')

  let detected: { mimeType: string; extension: string } | null = null

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    detected = { mimeType: 'image/jpeg', extension: 'jpg' }
  } else if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    detected = { mimeType: 'image/png', extension: 'png' }
  } else if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    detected = { mimeType: 'image/webp', extension: 'webp' }
  } else {
    const gifHeader = bytes.subarray(0, 6).toString('ascii')
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      detected = { mimeType: 'image/gif', extension: 'gif' }
    }
  }

  if (!detected) throw new SafeFetchError('Die Datei ist kein unterstütztes Bild.')

  return {
    bytes,
    byteSize: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...detected,
  }
}

export async function downloadListingImage(url: string) {
  const response = await safeGet(url, {
    maxBytes: MAX_IMAGE_BYTES,
    accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1',
  })

  if (response.status < 200 || response.status >= 300) {
    throw new SafeFetchError(`Bildabruf fehlgeschlagen (HTTP ${response.status}).`)
  }

  return {
    originalUrl: response.url,
    ...inspectImageBytes(response.body),
  }
}
