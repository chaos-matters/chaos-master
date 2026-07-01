import { describe, expect, it } from 'vitest'
import { decodeBase64, encodeBase64 } from './base64'

describe('base64', () => {
  it('round-trips arbitrary bytes with default padding', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252])
    const decoded = decodeBase64(encodeBase64(original))
    expect(Array.from(decoded)).toEqual(Array.from(original))
  })

  it('round-trips with unpadded (url-safe) output', () => {
    for (const bytes of [
      new Uint8Array([1]),
      new Uint8Array([1, 2]),
      new Uint8Array([1, 2, 3]),
      new Uint8Array([1, 2, 3, 4]),
    ]) {
      const encoded = encodeBase64(bytes, { pad: '' })
      expect(decodeBase64(encoded)).toEqual(bytes)
    }
  })

  it('throws on a length that no valid base64 encoding can produce', () => {
    // 4n+1 characters can never come from a real encoder.
    expect(() => decodeBase64('AAAAA')).toThrow()
  })

  it('throws on characters outside the base64url alphabet', () => {
    expect(() => decodeBase64('not valid!!')).toThrow()
    expect(() => decodeBase64('<script>')).toThrow()
  })
})
