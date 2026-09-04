import { describe, expect, it } from 'vitest'
import { generateSeededRandomFlame } from '@/flame/randomize'
import { categoryOf, variationTypesFor } from '@/flame/variationRegistry'
import { generateDefaults } from './generate'

describe('generateDefaults', () => {
  it('draws 2D flames from General and Blur only', () => {
    const pool = generateDefaults(2).allowedVariations

    expect(pool.length).toBeGreaterThan(300)
    expect(pool.length).toBeLessThan(variationTypesFor(2).length)
    for (const type of pool) {
      expect(['general', 'blur']).toContain(categoryOf(2, type))
    }
    // The ones a duel kept opening on: black until tuned.
    expect(pool.some((type) => /^sym(Band|Net)/.test(type))).toBe(false)
  })

  it('keeps the whole 3D registry, which has no such groups', () => {
    expect(generateDefaults(3).allowedVariations).toEqual([
      ...variationTypesFor(3),
    ])
  })

  it('generates only from that pool', () => {
    const config = generateDefaults(2)
    const allowed = new Set<string>(config.allowedVariations)
    for (const seed of [1, 2, 3, 4, 5]) {
      const flame = generateSeededRandomFlame(config, seed)
      for (const transform of Object.values(flame.transforms)) {
        for (const variation of Object.values(transform.variations)) {
          expect(allowed.has(variation.type)).toBe(true)
        }
      }
    }
  })
})
