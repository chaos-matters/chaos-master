import { describe, expect, it } from 'vitest'
import { calculateCRC32 } from './crc32'

describe('crc32', () => {
  it('0xFF gives proper CRC32', () => {
    expect(calculateCRC32(new Uint8Array([0xff]))).toEqual(0xff000000)
  })

  it('0x00 gives proper CRC32', () => {
    expect(calculateCRC32(new Uint8Array([0x00]))).toEqual(0xd202ef8d)
  })
  it('TEST in ASCII gives proper CRC32', () => {
    expect(calculateCRC32(new Uint8Array([0x54, 0x45, 0x53, 0x54]))).toEqual(
      0xeeea93b8,
    )
  })

  it('empty input gives 0', () => {
    expect(calculateCRC32(new Uint8Array([]))).toEqual(0x00000000)
  })

  it('matches the canonical CRC-32 check vector for "123456789"', () => {
    // "123456789" is the standard CRC-32/ISO-HDLC check value.
    const bytes = new TextEncoder().encode('123456789')
    expect(calculateCRC32(bytes) >>> 0).toEqual(0xcbf43926)
  })
})
