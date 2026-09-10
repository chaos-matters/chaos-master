import { describe, expect, it } from 'vitest'
import { crossBreedAffineCoefficients, crossBreedMatchedTypePairs, crossBreedMatchedVariations, crossBreedTransformPair, crossVariationParams, fillRemainingFromUnmatched, getDominantVariationType, groupTransformsByDominantType, } from './crossoverUtils'
import type { LooseTransform, LooseVariation } from './crossoverUtils'

describe('crossoverUtils', () => {
  describe('crossVariationParams', () => {
    it('returns undefined when neither variation has params', () => {
      const vA: LooseVariation = { type: 'linear', weight: 1 }
      const vB: LooseVariation = { type: 'linear', weight: 1 }
      expect(crossVariationParams(vA, vB)).toBeUndefined()
    })

    it('returns undefined when params objects are empty', () => {
      const vA: LooseVariation = { type: 'linear', weight: 1, params: {} }
      const vB: LooseVariation = { type: 'linear', weight: 1, params: {} }
      expect(crossVariationParams(vA, vB)).toBeUndefined()
    })

    it('inherits params from either parent when present', () => {
      const vA: LooseVariation = {
        type: 'blob',
        weight: 1,
        params: { high: 2, low: 0.5, waves: 4 },
      }
      const vB: LooseVariation = {
        type: 'blob',
        weight: 1,
        params: { high: 10, low: 0.1, waves: 8 },
      }
      const crossed = crossVariationParams(vA, vB)
      expect(crossed).toBeDefined()
      expect([2, 10]).toContain(crossed!.high)
      expect([0.5, 0.1]).toContain(crossed!.low)
      expect([4, 8]).toContain(crossed!.waves)
    })
  })

  describe('getDominantVariationType', () => {
    it('returns null when no variations are present', () => {
      expect(getDominantVariationType({ variations: {} })).toBeNull()
    })

    it('returns the variation type with the highest weight', () => {
      const t = {
        variations: {
          v1: { type: 'linear', weight: 0.2 },
          v2: { type: 'spherical', weight: 0.8 },
          v3: { type: 'swirl', weight: 0.5 },
        },
      }
      expect(getDominantVariationType(t)).toBe('spherical')
    })
  })

  describe('groupTransformsByDominantType', () => {
    it('groups transforms by their dominant variation type', () => {
      const t1: LooseTransform = {
        probability: 0.5,
        preAffine: {},
        postAffine: {},
        color: { x: 0, y: 0 },
        variations: { v1: { type: 'swirl', weight: 1 } },
      }
      const t2: LooseTransform = {
        probability: 0.5,
        preAffine: {},
        postAffine: {},
        color: { x: 0, y: 0 },
        variations: { v1: { type: 'swirl', weight: 0.9 } },
      }
      const t3: LooseTransform = {
        probability: 0.5,
        preAffine: {},
        postAffine: {},
        color: { x: 0, y: 0 },
        variations: { v1: { type: 'linear', weight: 1 } },
      }
      const t4: LooseTransform = {
        probability: 0.5,
        preAffine: {},
        postAffine: {},
        color: { x: 0, y: 0 },
        variations: {},
      }

      const grouped = groupTransformsByDominantType([t1, t2, t3, t4])
      expect(grouped.byType.get('swirl')).toEqual([t1, t2])
      expect(grouped.byType.get('linear')).toEqual([t3])
      expect(grouped.unmatched).toEqual([t4])
    })
  })

  describe('crossBreedAffineCoefficients', () => {
    it('mutates target keys with values from source or target', () => {
      const target: Record<string, number> = { a: 1, b: 2, c: 3 }
      const source: Record<string, number> = { a: 10, b: 20, c: 30 }
      crossBreedAffineCoefficients(target, source)
      expect([1, 10]).toContain(target.a)
      expect([2, 20]).toContain(target.b)
      expect([3, 30]).toContain(target.c)
    })
  })

  describe('crossBreedMatchedVariations', () => {
    it('averages weights and crosses params for matched types, preserving unmatched types', () => {
      const varsA: Record<string, LooseVariation> = {
        v1: { type: 'swirl', weight: 0.4 },
        v2: { type: 'spherical', weight: 0.6 },
      }
      const varsB: Record<string, LooseVariation> = {
        v3: { type: 'swirl', weight: 0.8 },
        v4: { type: 'horseshoe', weight: 0.5 },
      }

      const result = crossBreedMatchedVariations(varsA, varsB)
      const values = Object.values(result)

      // Should have swirl (averaged 0.6), spherical (0.6), and horseshoe (0.5)
      const swirl = values.find((v) => v.type === 'swirl')
      const spherical = values.find((v) => v.type === 'spherical')
      const horseshoe = values.find((v) => v.type === 'horseshoe')

      expect(swirl).toBeDefined()
      expect(swirl!.weight).toBeCloseTo(0.6)
      expect(spherical).toBeDefined()
      expect(spherical!.weight).toBe(0.6)
      expect(horseshoe).toBeDefined()
      expect(horseshoe!.weight).toBe(0.5)
    })
  })

  describe('crossBreedTransformPair', () => {
    it('creates a combined transform from two parents', () => {
      const ta: LooseTransform = {
        probability: 0.4,
        preAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        color: { x: 0.2, y: 0.2 },
        variations: { v1: { type: 'linear', weight: 1 } },
      }
      const tb: LooseTransform = {
        probability: 0.6,
        preAffine: { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 },
        postAffine: { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 },
        color: { x: -0.2, y: -0.2 },
        variations: { v2: { type: 'linear', weight: 0.5 } },
      }

      const child = crossBreedTransformPair(ta, tb)
      expect(child.probability).toBeCloseTo(0.5)
      expect(child.color.x).toBeGreaterThanOrEqual(-0.4)
      expect(child.color.x).toBeLessThanOrEqual(0.4)
      const childVars = Object.values(child.variations)
      expect(childVars.length).toBe(1)
      expect(childVars[0]!.type).toBe('linear')
      expect(childVars[0]!.weight).toBeCloseTo(0.75)
    })
  })

  describe('crossBreedMatchedTypePairs', () => {
    it('pairs transforms sorted by probability descending and splits excess', () => {
      const tA1: LooseTransform = {
        probability: 0.8,
        preAffine: {},
        postAffine: {},
        color: { x: 0, y: 0 },
        variations: { v: { type: 'swirl', weight: 1 } },
      }
      const tA2: LooseTransform = {
        probability: 0.2,
        preAffine: {},
        postAffine: {},
        color: { x: 0, y: 0 },
        variations: { v: { type: 'swirl', weight: 1 } },
      }
      const tB1: LooseTransform = {
        probability: 0.9,
        preAffine: {},
        postAffine: {},
        color: { x: 0, y: 0 },
        variations: { v: { type: 'swirl', weight: 1 } },
      }

      const { crossBred, excessA, excessB } = crossBreedMatchedTypePairs(
        [tA2, tA1],
        [tB1],
      )

      expect(crossBred.length).toBe(1)
      expect(excessA.length).toBe(1)
      expect(excessA[0]).toBe(tA2) // lower probability becomes excess
      expect(excessB.length).toBe(0)
    })
  })

  describe('fillRemainingFromUnmatched', () => {
    it('fills result up to count using fresh variation ids', () => {
      const result: LooseTransform[] = []
      const unmatched: LooseTransform[] = [
        {
          probability: 0.5,
          preAffine: {},
          postAffine: {},
          color: { x: 0, y: 0 },
          variations: { orig_var: { type: 'bubble', weight: 1 } },
        },
      ]

      const filled = fillRemainingFromUnmatched(result, unmatched, 1)
      expect(filled.length).toBe(1)
      const varKeys = Object.keys(filled[0]!.variations)
      expect(varKeys.length).toBe(1)
      expect(varKeys[0]).not.toBe('orig_var')
      expect(filled[0]!.variations[varKeys[0]!]!.type).toBe('bubble')
    })
  })
})
