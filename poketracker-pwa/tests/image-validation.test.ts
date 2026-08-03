import { describe, expect, it } from 'vitest'
import { inspectImageBytes, MAX_IMAGE_BYTES } from '@/lib/importer/download-image'

describe('inspectImageBytes', () => {
  it('recognizes a JPEG from its file signature', () => {
    const result = inspectImageBytes(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]))
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.extension).toBe('jpg')
    expect(result.byteSize).toBe(5)
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('recognizes a PNG from its file signature', () => {
    const result = inspectImageBytes(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
    )
    expect(result.mimeType).toBe('image/png')
    expect(result.extension).toBe('png')
  })

  it('rejects files that only claim to be images', () => {
    expect(() => inspectImageBytes(Buffer.from('<html>not an image</html>'))).toThrow(
      'kein unterstütztes Bild',
    )
  })

  it('rejects files above the configured limit', () => {
    expect(() => inspectImageBytes(Buffer.alloc(MAX_IMAGE_BYTES + 1))).toThrow('größer als 6 MB')
  })
})
