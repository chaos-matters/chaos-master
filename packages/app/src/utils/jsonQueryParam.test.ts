import { describe, expect, it } from 'vitest'
import { example1 } from '@/flame/examples/example1'
import { decodeSharePayload, encodeSharePayload } from './jsonQueryParam'

describe('jsonQueryParam share payload encoding/decoding', () => {
  it('round-trips a valid flame payload through encodeSharePayload and decodeSharePayload', async () => {
    const encoded = await encodeSharePayload(example1)
    expect(typeof encoded).toBe('string')
    expect(encoded.length).toBeGreaterThan(0)

    const decoded = await decodeSharePayload(encoded)
    expect(decoded.flame).toBeDefined()
    expect(Object.keys(decoded.flame.transforms).length).toBe(
      Object.keys(example1.transforms).length,
    )
  })

  it('rejects completely corrupted or malformed base64 strings', async () => {
    await expect(
      decodeSharePayload('not-a-valid-payload-###'),
    ).rejects.toThrow()
  })

  it('rejects an empty or non-flame payload', async () => {
    await expect(decodeSharePayload('')).rejects.toThrow()
  })
})
