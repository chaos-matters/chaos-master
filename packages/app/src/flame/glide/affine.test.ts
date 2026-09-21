import { describe, expect, it } from 'vitest'
import { AFFINE_COMPONENTS, composeAffine2D, decomposeAffine2D, decomposedDeviation, interpolateAffine, isNearSingular, isReflection, lerpAngleShortest, lerpScaleLog, shortestAngleDelta, } from './affine'
import type { GlideAffine } from './types'

const IDENTITY: GlideAffine = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
const HALF_TURN: GlideAffine = { a: -1, b: 0, c: 0, d: 0, e: -1, f: 0 }

function rotation(radians: number, scale = 1): GlideAffine {
  return {
    a: Math.cos(radians) * scale,
    b: -Math.sin(radians) * scale,
    c: 0,
    d: Math.sin(radians) * scale,
    e: Math.cos(radians) * scale,
    f: 0,
  }
}

function determinant(m: GlideAffine): number {
  return m.a * m.e - m.b * m.d
}

describe('decomposeAffine2D / composeAffine2D', () => {
  it('round-trips an arbitrary affine', () => {
    const cases: GlideAffine[] = [
      IDENTITY,
      { a: 0.8, b: -0.3, c: 1.5, d: 0.4, e: 1.2, f: -2 },
      rotation(0.7, 2.5),
      { a: -1.3, b: 0.2, c: 0, d: 0.9, e: 0.6, f: 0 },
    ]
    for (const affine of cases) {
      const restored = composeAffine2D(decomposeAffine2D(affine))
      for (const key of AFFINE_COMPONENTS) {
        expect(restored[key]).toBeCloseTo(affine[key], 12)
      }
    }
  })

  it('puts a reflection in the second scale, never in the rotation', () => {
    const mirrored: GlideAffine = { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 }
    const parts = decomposeAffine2D(mirrored)
    expect(parts.scaleX).toBeGreaterThan(0)
    expect(parts.scaleY).toBeLessThan(0)
    expect(parts.rotation).toBeCloseTo(0, 12)
  })

  it('reports a collapsed matrix rather than inventing an angle', () => {
    const collapsed: GlideAffine = { a: 0, b: 0, c: 3, d: 0, e: 0, f: 4 }
    const parts = decomposeAffine2D(collapsed)
    expect(parts.scaleX).toBe(0)
    expect(parts.rotation).toBe(0)
    expect(parts.translateX).toBe(3)
    expect(parts.translateY).toBe(4)
    expect(isNearSingular(collapsed)).toBe(true)
  })
})

describe('shortestAngleDelta', () => {
  it('travels 2 degrees from 359 to 1, not 358', () => {
    const from = (359 * Math.PI) / 180
    const to = (1 * Math.PI) / 180
    const delta = shortestAngleDelta(from, to)
    expect((delta * 180) / Math.PI).toBeCloseTo(2, 9)
  })

  it('stays within half a turn for every pair', () => {
    for (let i = 0; i < 40; i++) {
      const from = -10 + i * 0.5
      for (let j = 0; j < 40; j++) {
        const to = -10 + j * 0.5
        expect(Math.abs(shortestAngleDelta(from, to))).toBeLessThanOrEqual(
          Math.PI + 1e-12,
        )
      }
    }
  })

  it('lands exactly on the target', () => {
    const value = lerpAngleShortest(3, -3, 1)
    expect(Math.cos(value)).toBeCloseTo(Math.cos(-3), 12)
    expect(Math.sin(value)).toBeCloseTo(Math.sin(-3), 12)
  })
})

describe('lerpScaleLog', () => {
  it('passes 1 to 4 through 2, not 2.5', () => {
    expect(lerpScaleLog(1, 4, 0.5)).toBeCloseTo(2, 12)
  })

  it('never reaches zero between two positive scales', () => {
    for (let i = 0; i <= 20; i++) {
      expect(lerpScaleLog(0.01, 100, i / 20)).toBeGreaterThan(0)
    }
  })

  it('is linear across a sign change, which is a genuine flip', () => {
    expect(lerpScaleLog(1, -1, 0.5)).toBe(0)
  })
})

describe('interpolateAffine', () => {
  it('returns the endpoints bit-for-bit', () => {
    const from: GlideAffine = { a: 0.3, b: 1.7, c: -2, d: 0.9, e: 0.4, f: 5 }
    const to: GlideAffine = { a: -1.1, b: 0.2, c: 3, d: 0.6, e: 2.4, f: -1 }
    expect(interpolateAffine(from, to, 0)).toEqual(from)
    expect(interpolateAffine(from, to, 1)).toEqual(to)
  })

  it('never collapses the plane on a half turn — the prior art regression', () => {
    // Component-wise lerp takes I to -I through the ZERO matrix at t = 0.5,
    // which implodes the flame to a point and re-expands it. The decomposed
    // path is a rotation, so |det| stays at 1 the whole way.
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const mid = interpolateAffine(IDENTITY, HALF_TURN, t)
      expect(Math.abs(determinant(mid))).toBeGreaterThan(0.99)
    }
  })

  it('rotates a quarter turn through the quarter turn', () => {
    const mid = interpolateAffine(IDENTITY, rotation(Math.PI / 2), 0.5)
    const expected = rotation(Math.PI / 4)
    for (const key of AFFINE_COMPONENTS) {
      expect(mid[key]).toBeCloseTo(expected[key], 9)
    }
  })

  it('scales through the geometric mean, not the arithmetic one', () => {
    const from: GlideAffine = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
    const to: GlideAffine = { a: 9, b: 0, c: 0, d: 0, e: 9, f: 0 }
    const mid = interpolateAffine(from, to, 0.5)
    expect(mid.a).toBeCloseTo(3, 9)
    expect(mid.e).toBeCloseTo(3, 9)
  })

  it('falls back to a component lerp when either side is near singular', () => {
    const collapsed: GlideAffine = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }
    expect(isNearSingular(collapsed)).toBe(true)
    const mid = interpolateAffine(collapsed, IDENTITY, 0.5)
    expect(mid.a).toBeCloseTo(0.5, 12)
    expect(mid.e).toBeCloseTo(0.5, 12)
  })

  it('lets one scale cross zero for a reflection', () => {
    const mirrored: GlideAffine = { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 }
    expect(isReflection(IDENTITY, mirrored)).toBe(true)
    expect(interpolateAffine(IDENTITY, mirrored, 0.5).e).toBeCloseTo(0, 12)
  })
})

describe('decomposedDeviation', () => {
  it('is zero for a pure translation', () => {
    const from: GlideAffine = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
    const to: GlideAffine = { a: 1, b: 0, c: 4, d: 0, e: 1, f: -2 }
    expect(decomposedDeviation(from, to)).toBeLessThan(1e-9)
  })

  it('is large for a half turn', () => {
    expect(decomposedDeviation(IDENTITY, HALF_TURN)).toBeGreaterThan(0.5)
  })
})
