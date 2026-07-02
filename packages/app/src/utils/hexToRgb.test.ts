import { describe, expect, it } from 'vitest'
import { hexToRgbNorm, rgbNormToHex } from './hexToRgb'

describe('hexToRgbNorm', () => {
  it('parses a 6-digit hex color', () => {
    const rgb = hexToRgbNorm('#ff0000')
    expect(rgb.x).toBeCloseTo(1)
    expect(rgb.y).toBeCloseTo(0)
    expect(rgb.z).toBeCloseTo(0)
  })

  it('expands 3-digit shorthand hex instead of misparsing it', () => {
    // '#f00' used to parse as the 6-digit value 0x000f00 (green), not red.
    const rgb = hexToRgbNorm('#f00')
    expect(rgb.x).toBeCloseTo(1)
    expect(rgb.y).toBeCloseTo(0)
    expect(rgb.z).toBeCloseTo(0)
  })

  it('round-trips through rgbNormToHex', () => {
    const hex = rgbNormToHex(hexToRgbNorm('#336699'))
    expect(hex).toBe('#336699')
  })
})
