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
})
