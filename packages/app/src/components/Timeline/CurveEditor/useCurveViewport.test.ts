import { describe, expect, it } from 'vitest'
import { autoValueRange, createCurveViewport } from './useCurveViewport'

describe('createCurveViewport', () => {
  const vp = createCurveViewport({
    frameWidth: 8,
    startFrame: 0,
    height: 120,
    minValue: 0,
    maxValue: 10,
    padY: 10,
  })

  it('maps frame to x exactly like the dope sheet (frame*frameWidth, no inset)', () => {
    expect(vp.frameToX(0)).toBeCloseTo(0)
    expect(vp.frameToX(10)).toBeCloseTo(80) // 10 * 8
    expect(vp.frameToX(25)).toBeCloseTo(200)
  })

  it('respects a non-zero startFrame origin', () => {
    const vp2 = createCurveViewport({
      frameWidth: 8,
      startFrame: 5,
      height: 100,
      minValue: 0,
      maxValue: 1,
    })
    expect(vp2.frameToX(5)).toBeCloseTo(0)
    expect(vp2.frameToX(15)).toBeCloseTo(80)
  })

  it('maps value to the padded box (max → top, min → bottom)', () => {
    expect(vp.valueToY(10)).toBeCloseTo(10) // top inset
    expect(vp.valueToY(0)).toBeCloseTo(110) // height - inset
  })

  it('round-trips frame<->x and value<->y', () => {
    for (const f of [0, 17, 50, 99]) {
      expect(vp.xToFrame(vp.frameToX(f))).toBeCloseTo(f)
    }
    for (const v of [0, 2.5, 7, 10]) {
      expect(vp.yToValue(vp.valueToY(v))).toBeCloseTo(v)
    }
  })

  it('does not divide by zero on a flat value range or zero frameWidth', () => {
    const flat = createCurveViewport({
      frameWidth: 0,
      startFrame: 0,
      height: 100,
      minValue: 3,
      maxValue: 3,
    })
    expect(Number.isFinite(flat.valueToY(3))).toBe(true)
    expect(Number.isFinite(flat.xToFrame(0))).toBe(true)
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
    expect(r.min).toBeCloseTo(-1.5)
    expect(r.max).toBeCloseTo(11.5)
  })
})
