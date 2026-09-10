import { describe, expect, it } from 'vitest'
import { applyStructuralRemoval, countStructuralAdditions, createRandomMutatedTransform, maybeSwapVariationType, mutateTransformAffine, mutateTransformColor, mutateTransformVariations, normalizeTransformProbabilities, resolveEffectiveMutationRates, } from './mutationOperators'
import { createSeededRandomSource, withRandomSource } from './randomize'
import type { GenerateRandomFlameConfig, MutateFlameOptions, RandomVariationLike, } from './randomize'

describe('mutationOperators', () => {
  const baseConfig: GenerateRandomFlameConfig = {
    strength: 0.5,
    minTransforms: 2,
    maxTransforms: 4,
    minVariations: 1,
    maxVariations: 3,
    allowedVariations: [],
    dimensions: 2,
  }

  const baseOptions: MutateFlameOptions = {
    mutateAffine: true,
    mutateColors: true,
    mutateVariations: 'modify',
    affineMode: 'smart',
  }

  describe('resolveEffectiveMutationRates', () => {
    it('falls back to default rates when not explicitly provided', () => {
      const rates = resolveEffectiveMutationRates(baseConfig, baseOptions)
      expect(rates.affineRate).toBe(0.5)
      expect(rates.weightRate).toBe(0.5)
      expect(rates.swapChance).toBe(0.1)
      expect(rates.colorRate).toBe(0.4)
      expect(rates.addChance).toBe(0)
      expect(rates.removeChance).toBe(0)
      expect(rates.affineStrength).toBeCloseTo(0.25)
      expect(rates.pool.length).toBeGreaterThan(0)
    })

    it('uses option overrides when specified', () => {
      const customOptions: MutateFlameOptions = {
        ...baseOptions,
        affineMutationRate: 0.8,
        variationWeightRate: 0.2,
        variationSwapChance: 0.4,
        colorMutationRate: 0.7,
        addTransformChance: 0.3,
        removeTransformChance: 0.1,
      }
      const rates = resolveEffectiveMutationRates(baseConfig, customOptions)
      expect(rates.affineRate).toBe(0.8)
      expect(rates.weightRate).toBe(0.2)
      expect(rates.swapChance).toBe(0.4)
      expect(rates.colorRate).toBe(0.7)
      expect(rates.addChance).toBe(0.3)
      expect(rates.removeChance).toBe(0.1)
      expect(rates.affineStrength).toBeCloseTo(0.4)
    })
  })

  describe('applyStructuralRemoval', () => {
    it('does not remove transforms if only 1 exists', () => {
      const entries: [string, unknown][] = [['t1', {}]]
      const remaining = applyStructuralRemoval(entries, undefined, 1.0)
      expect(remaining.length).toBe(1)
    })

    it('does not remove non-targeted transforms when targetIds are specified', () => {
      const entries: [string, unknown][] = [
        ['t1', {}],
        ['t2', {}],
      ]
      const remaining = applyStructuralRemoval(entries, ['t1'], 1.0)
      // t2 is not targeted, so it is preserved even with removeChance = 1.0
      expect(remaining.map(([id]) => id)).toContain('t2')
    })
  })

  describe('countStructuralAdditions', () => {
    it('returns 0 when addChance is 0', () => {
      expect(countStructuralAdditions(0)).toBe(0)
    })

    it('caps additions at 3 even with addChance 1', () => {
      expect(countStructuralAdditions(1.0)).toBe(3)
    })
  })

  describe('maybeSwapVariationType', () => {
    it('swaps variation type when swapChance is 1 and alternatives exist', () => {
      withRandomSource(createSeededRandomSource(42), () => {
        const v: RandomVariationLike = { type: 'linear', weight: 1.0 }
        maybeSwapVariationType(v, 1.0, ['linear', 'swirl', 'spherical'], 0.5)
        expect(v.type).not.toBe('linear')
      })
    })

    it('does not swap variation type when swapChance is 0', () => {
      const v: RandomVariationLike = { type: 'linear', weight: 1.0 }
      maybeSwapVariationType(v, 0, ['linear', 'swirl'], 0.5)
      expect(v.type).toBe('linear')
    })
  })

  describe('createRandomMutatedTransform', () => {
    it('creates a valid 2D transform descriptor', () => {
      withRandomSource(createSeededRandomSource(100), () => {
        const t = createRandomMutatedTransform(
          1,
          2,
          ['linear', 'swirl'],
          2,
          0.5,
        )
        expect(t.probability).toBeGreaterThanOrEqual(0.3)
        expect(t.probability).toBeLessThanOrEqual(1.0)
        expect(t.preAffine).toBeDefined()
        expect(t.postAffine).toBeDefined()
        expect(t.color).toBeDefined()
        expect(t.variations).toBeDefined()
      })
    })

    it('creates a valid 3D transform descriptor with 12 affine coefficients', () => {
      withRandomSource(createSeededRandomSource(200), () => {
        const t = createRandomMutatedTransform(
          1,
          2,
          ['linear', 'swirl'],
          3,
          0.5,
        )
        const pre = t.preAffine as Record<string, number>
        expect(Object.keys(pre).length).toBe(12)
        expect(pre.l).toBeDefined()
      })
    })
  })

  describe('mutateTransformAffine', () => {
    it('perturbs affine coefficients in smart mode', () => {
      const t = {
        preAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      }
      withRandomSource(createSeededRandomSource(300), () => {
        mutateTransformAffine(t, 2, 0.2, 'smart')
        expect(t.preAffine.a).not.toBe(1)
      })
    })

    it('perturbs affine coefficients in full mode', () => {
      const t = {
        preAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      }
      withRandomSource(createSeededRandomSource(400), () => {
        mutateTransformAffine(t, 2, 0.2, 'full')
        expect(t.preAffine.a).not.toBe(1)
      })
    })
  })

  describe('mutateTransformColor', () => {
    it('perturbs color coordinates within bounds', () => {
      const t = { color: { x: 0, y: 0 } }
      withRandomSource(createSeededRandomSource(500), () => {
        mutateTransformColor(t, 0.5, 0.5)
        expect(t.color.x).toBeGreaterThanOrEqual(-0.4)
        expect(t.color.x).toBeLessThanOrEqual(0.4)
        expect(t.color.x).not.toBe(0)
      })
    })
  })

  describe('mutateTransformVariations', () => {
    it('normalizes variation weights in modify mode', () => {
      const t = {
        variations: {
          v1: { type: 'linear', weight: 0.8 },
          v2: { type: 'swirl', weight: 0.8 },
        },
      }
      withRandomSource(createSeededRandomSource(600), () => {
        mutateTransformVariations(t, 'modify', {
          strength: 0.5,
          weightRate: 0.5,
          swapChance: 0,
          pool: ['linear', 'swirl'],
          minVariations: 1,
          maxVariations: 2,
        })
        const total = Object.values(t.variations).reduce(
          (sum, v) => sum + v.weight,
          0,
        )
        expect(total).toBeCloseTo(1.0)
      })
    })
  })

  describe('normalizeTransformProbabilities', () => {
    it('assigns equal probabilities across transforms', () => {
      const transforms = {
        t1: { probability: 0.1 },
        t2: { probability: 0.9 },
      }
      normalizeTransformProbabilities(transforms)
      expect(transforms.t1.probability).toBe(0.5)
      expect(transforms.t2.probability).toBe(0.5)
    })
  })
})
