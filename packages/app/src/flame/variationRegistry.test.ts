import { describe, expect, it } from 'vitest'
import { isVariationTypeFor } from './variationRegistry'

describe('variation registry membership', () => {
  it('accepts own entries in the matching dimensional registry', () => {
    expect(isVariationTypeFor(2, 'linearVar')).toBe(true)
    expect(isVariationTypeFor(3, 'linear3D')).toBe(true)
    expect(isVariationTypeFor(2, 'linear3D')).toBe(false)
    expect(isVariationTypeFor(3, 'linearVar')).toBe(false)
  })

  it('never treats Object prototype properties as variation types', () => {
    expect(isVariationTypeFor(2, '__proto__')).toBe(false)
    expect(isVariationTypeFor(2, 'constructor')).toBe(false)
    expect(isVariationTypeFor(3, 'prototype')).toBe(false)
  })
})
