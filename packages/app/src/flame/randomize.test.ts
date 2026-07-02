import { describe, expect, it } from 'vitest'
import { randomizeVariationParams, smartMutateAffine2D, smartMutateAffine3D, } from './randomize'

const identity2D = () => ({ a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 })
const identity3D = () => ({
  a: 1,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  f: 1,
  g: 0,
  h: 0,
  i: 0,
  j: 0,
  k: 1,
  l: 0,
})

describe('smartMutateAffine2D', () => {
  it('is a no-op at strength 0', () => {
    const af = identity2D()
    smartMutateAffine2D(af, 0)
    expect(af).toEqual(identity2D())
  })

  it('keeps every coefficient finite across strengths', () => {
    for (let trial = 0; trial < 200; trial++) {
      const af = { a: 0.7, b: -0.2, c: 0.4, d: 0.1, e: 0.9, f: -0.3 }
      smartMutateAffine2D(af, Math.random())
      for (const v of Object.values(af)) {
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('actually changes the affine at full strength', () => {
    let changed = 0
    for (let trial = 0; trial < 50; trial++) {
      const af = identity2D()
      smartMutateAffine2D(af, 1)
      if (
        af.a !== 1 ||
        af.b !== 0 ||
        af.c !== 0 ||
        af.d !== 0 ||
        af.e !== 1 ||
        af.f !== 0
      ) {
        changed++
      }
    }
    expect(changed).toBeGreaterThan(45)
  })
})

describe('randomizeVariationParams', () => {
  it('perturbs parameters whose default value is 0', () => {
    // augerVar's `sym` param defaults to 0 — sigma used to be computed as
    // Math.abs(0) * ... = 0, permanently excluding zero-default params like
    // this from randomization regardless of strength.
    let changed = 0
    for (let trial = 0; trial < 50; trial++) {
      const result = randomizeVariationParams('augerVar', 1)
      if (result?.sym !== 0) changed++
    }
    expect(changed).toBeGreaterThan(45)
  })

  it('returns undefined for non-parametric variation types', () => {
    expect(randomizeVariationParams('linearVar', 1)).toBeUndefined()
  })
})

describe('smartMutateAffine3D', () => {
  it('is a no-op at strength 0', () => {
    const af = identity3D()
    smartMutateAffine3D(af, 0)
    expect(af).toEqual(identity3D())
  })

  it('keeps every coefficient finite across strengths', () => {
    for (let trial = 0; trial < 200; trial++) {
      const af = identity3D()
      smartMutateAffine3D(af, Math.random())
      for (const v of Object.values(af)) {
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('preserves the 12-coefficient shape', () => {
    const af = identity3D()
    smartMutateAffine3D(af, 0.8)
    expect(Object.keys(af).sort()).toEqual(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].sort(),
    )
  })
})
