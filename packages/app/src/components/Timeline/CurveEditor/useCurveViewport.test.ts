import { describe, expect, it } from 'vitest'
import { autoValueRange, createCurveViewport } from './useCurveViewport'

describe('createCurveViewport', () => {
  const vp = createCurveViewport({
    width: 220,
    height: 120,
    startFrame: 0,
    endFrame: 100,
    minValue: 0,
    maxValue: 10,
    padding: 10,
  })

  it('maps frame/value to the padded box corners', () => {
    expect(vp.frameToX(0)).toBeCloseTo(10) // left inset
    expect(vp.frameToX(100)).toBeCloseTo(210) // width - inset
    expect(vp.valueToY(10)).toBeCloseTo(10) // max value → top inset
    expect(vp.valueToY(0)).toBeCloseTo(110) // min value → bottom inset
  })

  it('round-trips frame<->x and value<->y', () => {
    for (const f of [0, 17, 50, 99, 100]) {
      expect(vp.xToFrame(vp.frameToX(f))).toBeCloseTo(f)
    }
    for (const v of [0, 2.5, 7, 10]) {
      expect(vp.yToValue(vp.valueToY(v))).toBeCloseTo(v)
    }
  })

  it('does not divide by zero on a flat range', () => {
    const flat = createCurveViewport({
      width: 100,
      height: 100,
      startFrame: 5,
      endFrame: 5,
      minValue: 3,
      maxValue: 3,
    })
    expect(Number.isFinite(flat.frameToX(5))).toBe(true)
    expect(Number.isFinite(flat.valueToY(3))).toBe(true)
  })
})

describe('autoValueRange', () => {
  it('returns [0,1] for no values', () => {
    expect(autoValueRange([])).toEqual({ min: 0, max: 1 })
  })

  it('pads a flat value by ±1', () => {
    expect(autoValueRange([4, 4, 4])).toEqual({ min: 3, max: 5 })
  })

  it('adds headroom around the data span', () => {
    const r = autoValueRange([0, 10])
    expect(r.min).toBeLessThan(0)
    expect(r.max).toBeGreaterThan(10)
    expect(r.min).toBeCloseTo(-1.5)
    expect(r.max).toBeCloseTo(11.5)
  })
})
