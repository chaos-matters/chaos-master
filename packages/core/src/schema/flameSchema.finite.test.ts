import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { finiteNumber } from './flameSchema'

describe('what plain v.number() actually does', () => {
  it('rejects NaN but ACCEPTS Infinity', () => {
    // Measured against valibot 1.2.0. NaN is caught by the type check, but
    // Infinity is a perfectly good `number` as far as v.number() is concerned,
    // so an infinite camera value validates and is persisted.
    expect(v.safeParse(v.number(), NaN).success).toBe(false)
    expect(v.safeParse(v.number(), Infinity).success).toBe(true)
    expect(v.safeParse(v.number(), -Infinity).success).toBe(true)
  })
})

describe('finiteNumber', () => {
  it('rejects Infinity and -Infinity, which is the gap v.number() leaves', () => {
    expect(v.safeParse(finiteNumber, Infinity).success).toBe(false)
    expect(v.safeParse(finiteNumber, -Infinity).success).toBe(false)
  })

  it('still rejects NaN', () => {
    expect(v.safeParse(finiteNumber, NaN).success).toBe(false)
  })

  it('accepts ordinary finite numbers including zero and negatives', () => {
    for (const n of [0, -0, 1, -7.5, 1e-9, 1e9]) {
      expect(v.safeParse(finiteNumber, n).success).toBe(true)
    }
  })
})
