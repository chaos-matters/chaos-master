import { describe, expect, it } from 'vitest'
import { example1 } from './examples/example1'
import { example3 } from './examples/example3'
import { example5 } from './examples/example5'
import { FITNESS_WEIGHTS, scoreFlame } from './fitness'
import { validateFlame } from './schema/flameSchema'
import type { FlameDescriptor } from './schema/flameSchema'

interface VariationSpec {
  type: string
  weight: number
  params?: Record<string, number>
}

interface TransformSpec {
  probability: number
  color?: { x: number; y: number }
  /** Defaults to a single full-weight linearVar. Pass [] for no variations. */
  variations?: VariationSpec[]
}

let nextId = 0

function makeFlame(specs: TransformSpec[]): FlameDescriptor {
  const transforms: Record<string, unknown> = {}
  for (const spec of specs) {
    const variations: Record<string, unknown> = {}
    for (const variation of spec.variations ?? [
      { type: 'linearVar', weight: 1 },
    ]) {
      variations[`v${nextId++}`] = variation
    }
    transforms[`t${nextId++}`] = {
      probability: spec.probability,
      preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: spec.color ?? { x: 0.5, y: 0.5 },
      variations,
    }
  }
  return validateFlame({ version: '1.0', transforms })
}

const TYPES = ['linearVar', 'swirlVar', 'sinusoidalVar', 'gaussianVar']

describe('scoreFlame', () => {
  it('returns all scores within [0, 1] for example flames', () => {
    for (const flame of [example1, example3, example5]) {
      const scores = scoreFlame(flame)
      for (const value of Object.values(scores)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it('computes the composite as the weighted sum of the four heuristics', () => {
    const scores = scoreFlame(example1)
    expect(scores.composite).toBeCloseTo(
      FITNESS_WEIGHTS.variationDiversity * scores.variationDiversity +
        FITNESS_WEIGHTS.transformBalance * scores.transformBalance +
        FITNESS_WEIGHTS.colorSpread * scores.colorSpread +
        FITNESS_WEIGHTS.structuralComplexity * scores.structuralComplexity,
      12,
    )
  })

  it('has weights that sum to 1', () => {
    const total = Object.values(FITNESS_WEIGHTS).reduce((s, w) => s + w, 0)
    expect(total).toBeCloseTo(1, 12)
  })

  it('scores a flame with no transforms at the floor', () => {
    const empty = validateFlame({ version: '1.0', transforms: {} })
    const scores = scoreFlame(empty)
    expect(scores.variationDiversity).toBe(0)
    expect(scores.colorSpread).toBe(0)
    expect(scores.structuralComplexity).toBe(0)
    expect(scores.transformBalance).toBe(0.5)
    expect(scores.composite).toBeCloseTo(
      FITNESS_WEIGHTS.transformBalance * 0.5,
      12,
    )
  })

  it('ranks a diverse, balanced flame above a trivial one', () => {
    const rich = makeFlame(
      TYPES.map((type, i) => ({
        probability: 0.25,
        color: { x: i / TYPES.length, y: 0.5 },
        variations: [
          { type, weight: 0.7 },
          { type: TYPES[(i + 1) % TYPES.length]!, weight: 0.3 },
        ],
      })),
    )
    const poor = makeFlame([{ probability: 1 }])
    expect(scoreFlame(rich).composite).toBeGreaterThan(
      scoreFlame(poor).composite,
    )
  })

  describe('variation diversity', () => {
    it('scores mixed variation types above a single repeated type', () => {
      const mixed = makeFlame(
        TYPES.map((type) => ({
          probability: 0.25,
          variations: [{ type, weight: 1 }],
        })),
      )
      const uniform = makeFlame(
        TYPES.map(() => ({
          probability: 0.25,
          variations: [{ type: 'linearVar', weight: 1 }],
        })),
      )
      expect(scoreFlame(mixed).variationDiversity).toBeGreaterThan(
        scoreFlame(uniform).variationDiversity,
      )
    })

    it('is 0 when transforms have no variations', () => {
      const bare = makeFlame([
        { probability: 0.5, variations: [] },
        { probability: 0.5, variations: [] },
      ])
      expect(scoreFlame(bare).variationDiversity).toBe(0)
    })
  })

  describe('transform balance', () => {
    it('gives equal probabilities a perfect score', () => {
      const balanced = makeFlame([
        { probability: 0.25 },
        { probability: 0.25 },
        { probability: 0.25 },
        { probability: 0.25 },
      ])
      expect(scoreFlame(balanced).transformBalance).toBe(1)
    })

    it('penalizes skewed probabilities', () => {
      const skewed = makeFlame([
        { probability: 0.97 },
        { probability: 0.01 },
        { probability: 0.01 },
        { probability: 0.01 },
      ])
      expect(scoreFlame(skewed).transformBalance).toBeLessThan(0.2)
    })

    it('treats a single transform as neutral', () => {
      const single = makeFlame([{ probability: 1 }])
      expect(scoreFlame(single).transformBalance).toBe(0.5)
    })
  })

  describe('color spread', () => {
    it('is 0 when every transform shares one color', () => {
      const flat = makeFlame([
        { probability: 0.5, color: { x: 0.2, y: 0.5 } },
        { probability: 0.5, color: { x: 0.2, y: 0.5 } },
      ])
      expect(scoreFlame(flat).colorSpread).toBe(0)
    })

    it('rewards distant hues over neighbouring ones', () => {
      const near = makeFlame([
        { probability: 0.5, color: { x: 0, y: 0.5 } },
        { probability: 0.5, color: { x: 0.05, y: 0.5 } },
      ])
      const far = makeFlame([
        { probability: 0.5, color: { x: 0, y: 0.5 } },
        { probability: 0.5, color: { x: 0.5, y: 0.5 } },
      ])
      expect(scoreFlame(far).colorSpread).toBeGreaterThan(
        scoreFlame(near).colorSpread,
      )
      expect(scoreFlame(far).colorSpread).toBeGreaterThan(0.5)
    })

    it('is 0 for a single transform', () => {
      const single = makeFlame([{ probability: 1, color: { x: 0, y: 0.5 } }])
      expect(scoreFlame(single).colorSpread).toBe(0)
    })
  })

  describe('structural complexity', () => {
    it('scores multi-transform flames above single-transform ones', () => {
      const rich = makeFlame(
        Array.from({ length: 5 }, () => ({
          probability: 0.2,
          variations: [
            { type: 'linearVar', weight: 0.5 },
            { type: 'swirlVar', weight: 0.5 },
          ],
        })),
      )
      const poor = makeFlame([{ probability: 1 }])
      expect(scoreFlame(rich).structuralComplexity).toBeGreaterThan(
        scoreFlame(poor).structuralComplexity,
      )
    })

    it('rewards parametric variations', () => {
      const parametric = makeFlame(
        Array.from({ length: 4 }, () => ({
          probability: 0.25,
          variations: [
            {
              type: 'pieVar',
              weight: 1,
              params: { rotation: 0, slices: 5, thickness: 0.5 },
            },
          ],
        })),
      )
      const plain = makeFlame(
        Array.from({ length: 4 }, () => ({
          probability: 0.25,
          variations: [{ type: 'linearVar', weight: 1 }],
        })),
      )
      expect(scoreFlame(parametric).structuralComplexity).toBeGreaterThan(
        scoreFlame(plain).structuralComplexity,
      )
    })
  })
})
