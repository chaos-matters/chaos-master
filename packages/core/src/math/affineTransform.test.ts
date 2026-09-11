// Value-pinned: distinct coefficients, so a swapped term changes the answer.
// A bound check such as toBeGreaterThan(0) survives almost any mutation.
import { vec2f } from 'typegpu/data'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { AffineParamsSchema, transformAffine } from './affineTransform'

describe('transformAffine', () => {
  it('computes x = a*x + b*y + c and y = d*x + e*y + f', () => {
    const p = transformAffine(
      { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 },
      vec2f(1, 2),
    )
    expect([p.x, p.y]).toEqual([8, 20])
  })
})

describe('AffineParamsSchema', () => {
  it('accepts six coefficients, with the 3D ones optional', () => {
    const six = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
    expect(v.safeParse(AffineParamsSchema, six).success).toBe(true)
    expect(
      v.safeParse(AffineParamsSchema, { ...six, g: 0, l: 1 }).success,
    ).toBe(true)
  })

  it('rejects a missing 2D coefficient', () => {
    expect(
      v.safeParse(AffineParamsSchema, { a: 1, b: 0, c: 0, d: 0, e: 1 }).success,
    ).toBe(false)
  })
})
