import { describe, expect, it } from 'vitest'
import { asciiBytes, readAscii, readAsciiBytes, readUint32BE, writeUint32BE, } from './binaryReader'

describe('binaryReader', () => {
  describe('writeUint32BE / readUint32BE', () => {
    it('round-trips values big-endian', () => {
      for (const value of [0, 1, 255, 256, 0x01020304, 0xffffffff]) {
        const bytes = writeUint32BE(value)
        expect(bytes).toHaveLength(4)
        const view = new DataView(bytes.buffer)
        expect(readUint32BE(view, 0)).toBe(value)
      }
    })

    it('writes the most-significant byte first', () => {
      expect([...writeUint32BE(0x01020304)]).toEqual([1, 2, 3, 4])
    })

    it('reads from a non-zero offset', () => {
      const view = new DataView(new ArrayBuffer(8))
      view.setUint32(4, 0xdeadbeef)
      expect(readUint32BE(view, 4)).toBe(0xdeadbeef)
    })
  })

  describe('asciiBytes', () => {
    it('encodes ASCII characters to their byte values', () => {
      expect([...asciiBytes('IDAT')]).toEqual([0x49, 0x44, 0x41, 0x54])
    })

    it('encodes a trailing null separator', () => {
      expect([...asciiBytes('A\0')]).toEqual([0x41, 0x00])
    })
  })

  describe('readAscii (DataView)', () => {
    it('reads a fixed-length tag at an offset', () => {
      const view = new DataView(asciiBytes('....moov').buffer)
      expect(readAscii(view, 4, 4)).toBe('moov')
    })
  })

  describe('readAsciiBytes (Uint8Array)', () => {
    it('reads a fixed-length tag at an offset', () => {
      const bytes = asciiBytes('....zTXt')
      expect(readAsciiBytes(bytes, 4, 4)).toBe('zTXt')
    })

    it('respects the byteOffset of a subarray view', () => {
      const full = asciiBytes('xxIDATyy')
      const sub = full.subarray(2) // starts at 'IDAT'
      expect(readAsciiBytes(sub, 0, 4)).toBe('IDAT')
    })
  })
})
