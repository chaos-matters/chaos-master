import { describe, expect, it } from 'vitest'
import { encodeIco } from './icoEncoder'
import type { IcoFrame } from './icoEncoder'

function frame(width: number, height: number): IcoFrame {
  return { width, height, png: new Uint8Array([1, 2, 3, 4]) }
}

describe('encodeIco', () => {
  it('encodes a standard-size frame', () => {
    const blob = encodeIco([frame(32, 32)])
    expect(blob.size).toBeGreaterThan(0)
  })

  it('encodes the 256 sentinel size without throwing', () => {
    const blob = encodeIco([frame(256, 256)])
    expect(blob.size).toBeGreaterThan(0)
  })

  it('rejects a frame wider than the ICO 1-byte field can represent', () => {
    // Used to silently truncate to the "256" sentinel instead of rejecting.
    expect(() => encodeIco([frame(512, 512)])).toThrow()
  })

  it('rejects a zero-sized frame', () => {
    expect(() => encodeIco([frame(0, 32)])).toThrow()
  })
})
