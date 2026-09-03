import { describe, expect, it } from 'vitest'
import { AFFINE_CONTROLS, composeAffine, decomposeAffine, } from './affineControls'
import type { AffineParams } from '@/flame/affineTranform'

const roundTrip = (affine: AffineParams) =>
  composeAffine(decomposeAffine(affine), affine)

describe('affine controls', () => {
  it('round-trips any transform someone might build', () => {
    const cases: AffineParams[] = [
      { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      { a: 0.5, b: -0.3, c: 0.2, d: 0.4, e: 0.9, f: -0.1 },
      { a: -1, b: 0.25, c: 1.5, d: 0.75, e: -0.5, f: 2 },
    ]
    for (const affine of cases) {
      const back = roundTrip(affine)
      for (const key of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        expect(back[key]).toBeCloseTo(affine[key], 10)
      }
    }
  })

  it('reads a plain scale-and-move the way a person would describe it', () => {
    const controls = decomposeAffine({
      a: 2,
      b: 0,
      c: 0.5,
      d: 0,
      e: 3,
      f: -0.25,
    })
    expect(controls.scaleX).toBeCloseTo(2)
    expect(controls.scaleY).toBeCloseTo(3)
    expect(controls.rotation).toBeCloseTo(0)
    expect(controls.shear).toBeCloseTo(0)
    expect(controls.offsetX).toBeCloseTo(0.5)
    expect(controls.offsetY).toBeCloseTo(-0.25)
  })

  it('reads a quarter turn as a quarter turn', () => {
    const controls = decomposeAffine({ a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 })
    expect(controls.rotation).toBeCloseTo(Math.PI / 2)
    expect(controls.scaleX).toBeCloseTo(1)
    expect(controls.scaleY).toBeCloseTo(1)
    expect(controls.shear).toBeCloseTo(0)
  })

  it('survives a flattened transform instead of producing NaN', () => {
    // A duel is ninety seconds of fast edits; one of them will collapse a
    // transform, and the panel has to stay usable when it does.
    const controls = decomposeAffine({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 })
    for (const value of Object.values(controls)) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('leaves 3D coefficients alone', () => {
    const affine = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0, g: 0.5, l: -2 }
    const back = roundTrip(affine)
    expect(back.g).toBe(0.5)
    expect(back.l).toBe(-2)
  })

  it('offers rotation in degrees, because radians are not a scrub unit', () => {
    const rotate = AFFINE_CONTROLS.find((c) => c.key === 'rotation')
    expect(rotate?.toDisplay(Math.PI)).toBeCloseTo(180)
    expect(rotate?.fromDisplay(90)).toBeCloseTo(Math.PI / 2)
  })
})
