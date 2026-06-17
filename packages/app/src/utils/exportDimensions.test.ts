import { describe, expect, it } from 'vitest'
import { computeExportDimensions, resolveAspectRatio } from './exportDimensions'

describe('resolveAspectRatio', () => {
  it('uses the viewport aspect for "auto"', () => {
    expect(resolveAspectRatio('auto', 16 / 9)).toBeCloseTo(16 / 9)
  })

  it('falls back to 1 when the viewport aspect is unusable', () => {
    expect(resolveAspectRatio('auto', NaN)).toBe(1)
    expect(resolveAspectRatio('auto', 0)).toBe(1)
    expect(resolveAspectRatio('auto', -2)).toBe(1)
  })

  it('returns the fixed ratio for named aspects (ignores viewport)', () => {
    expect(resolveAspectRatio('1:1', 16 / 9)).toBe(1)
    expect(resolveAspectRatio('16:9', 1)).toBeCloseTo(16 / 9)
    expect(resolveAspectRatio('9:16', 5)).toBeCloseTo(9 / 16)
    expect(resolveAspectRatio('4:3', 0.1)).toBeCloseTo(4 / 3)
  })
})

describe('computeExportDimensions', () => {
  it('applies the resolution to the longest edge (landscape)', () => {
    expect(computeExportDimensions(2048, '16:9', 1)).toEqual({
      width: 2048,
      height: 1152,
    })
  })

  it('applies the resolution to the longest edge (portrait)', () => {
    expect(computeExportDimensions(2048, '9:16', 1)).toEqual({
      width: 1152,
      height: 2048,
    })
  })

  it('produces a square for 1:1', () => {
    expect(computeExportDimensions(1024, '1:1', 2.5)).toEqual({
      width: 1024,
      height: 1024,
    })
  })

  it('resolves "auto" from the viewport aspect', () => {
    expect(computeExportDimensions(4096, 'auto', 4 / 3)).toEqual({
      width: 4096,
      height: 3072,
    })
  })

  it('always returns even dimensions (video-encoder safe)', () => {
    const { width, height } = computeExportDimensions(1025, '16:9', 1)
    expect(width % 2).toBe(0)
    expect(height % 2).toBe(0)
  })
})
