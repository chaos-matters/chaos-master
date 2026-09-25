// Mutate evens out the user's transforms only, and gives every symmetry copy the weight applySymmetryToFlame would write.
import { describe, expect, it } from 'vitest'
import { deepClone } from '@/utils/clone'
import { mutateFlame, mutateFlameSeeded } from './randomize'
import { applySymmetryToFlame, symmetryWeight } from './symmetry'
import { bases, TYPES } from './symmetryTestUtils'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from './mutationRates'
import type { FlameDescriptor, TransformId } from './schema/flameSchema'
import type { Dims } from './symmetryTestUtils'

const isCopy = (tid: string) => tid.startsWith('_sym__')
const copies = (flame: FlameDescriptor) =>
  Object.entries(flame.transforms).filter(([tid]) => isCopy(tid))
const users = (flame: FlameDescriptor) =>
  Object.entries(flame.transforms).filter(([tid]) => !isCopy(tid))

/**
 * Three user transforms with the given probabilities, the last one hidden
 * (a hidden transform still counts toward the copies' weight), then a
 * 4-fold set from the symmetry writer.
 */
function symmetric(
  dims: Dims,
  type: (typeof TYPES)[number],
  probabilities: [number, number, number],
): FlameDescriptor {
  const base = deepClone(bases[dims])
  const t1 = base.transforms['t1' as TransformId]!
  const transforms = Object.fromEntries(
    probabilities.map((probability, i) => [
      `u${i}`,
      { ...deepClone(t1), probability, visible: i < 2 },
    ]),
  )
  return applySymmetryToFlame({ ...base, transforms }, 4, type)
}

const options: MutateFlameOptions = {
  mutateAffine: true,
  affineMode: 'smart',
  mutateVariations: 'modify',
  mutateColors: true,
}
const configFor = (dims: Dims): GenerateRandomFlameConfig => ({
  strength: 0.5,
  minTransforms: 1,
  maxTransforms: 8,
  minVariations: 1,
  maxVariations: 3,
  allowedVariations: [],
  dimensions: dims,
})

/** What the symmetry writer gives a copy for the same user transforms. */
function writerWeight(flame: FlameDescriptor, type: (typeof TYPES)[number]) {
  const userOnly = { ...flame, transforms: Object.fromEntries(users(flame)) }
  const rewritten = applySymmetryToFlame(userOnly, 4, type)
  return copies(rewritten)[0]![1].probability
}

const SUMS: Array<[string, [number, number, number]]> = [
  ['below 1', [0.1, 0.2, 0.3]],
  ['above 1', [2, 3, 1.5]],
]

describe('Mutate and the symmetry copies of a 4-fold set', () => {
  for (const dims of [2, 3] as const) {
    for (const type of TYPES) {
      for (const [label, probabilities] of SUMS) {
        it(`${type}, ${dims}D, user probabilities summing ${label}`, () => {
          const flame = symmetric(dims, type, probabilities)
          expect(copies(flame)).toHaveLength(type === 'dihedral' ? 4 : 3)

          const mutated = mutateFlameSeeded(flame, configFor(dims), options, 7)
          const userProbabilities = users(mutated).map(([, t]) => t.probability)
          expect(userProbabilities.length).toBeGreaterThan(0)

          // Every copy carries symmetryWeight of the mutated transforms,
          // which is what the symmetry writer would write for them.
          const weight = symmetryWeight(mutated.transforms)
          expect(copies(mutated)).toHaveLength(copies(flame).length)
          for (const [, copy] of copies(mutated)) {
            expect(copy.probability).toBe(weight)
            expect(copy.probability).toBe(writerWeight(mutated, type))
          }

          // The user's transforms are evened out among themselves.
          for (const p of userProbabilities) {
            expect(p).toBeCloseTo(1 / userProbabilities.length, 12)
          }
        })
      }
    }
  }

  it('weighs transforms Mutate adds, and still evens out the user transforms', () => {
    const flame = symmetric(2, 'dihedral', [0.1, 0.2, 0.3])
    const mutated = mutateFlameSeeded(
      flame,
      { ...configFor(2), minTransforms: 5 },
      options,
      3,
    )
    expect(users(mutated)).toHaveLength(5)
    for (const [, copy] of copies(mutated)) {
      expect(copy.probability).toBe(symmetryWeight(mutated.transforms))
      expect(copy.probability).toBe(writerWeight(mutated, 'dihedral'))
    }
    for (const [, t] of users(mutated))
      expect(t.probability).toBeCloseTo(0.2, 12)
  })

  it('evens out a selection-only Mutate the same way', () => {
    const flame = symmetric(3, 'rotational', [2, 3, 1.5])
    const mutated = mutateFlame(flame, configFor(3), {
      ...options,
      selectedTransformIds: ['u0'],
    })
    for (const [, copy] of copies(mutated)) {
      expect(copy.probability).toBe(symmetryWeight(mutated.transforms))
    }
    for (const [, t] of users(mutated))
      expect(t.probability).toBeCloseTo(1 / 3, 12)
  })

  it('gives a flame with no copies the same even probabilities as before', () => {
    const base = deepClone(bases[2])
    const t1 = base.transforms['t1' as TransformId]!
    const flame = {
      ...base,
      transforms: {
        a: { ...deepClone(t1), probability: 3 },
        b: { ...deepClone(t1), probability: 0.1 },
        c: { ...deepClone(t1), probability: 0.4 },
        d: { ...deepClone(t1), probability: 1 },
      },
    } as FlameDescriptor
    const mutated = mutateFlameSeeded(flame, configFor(2), options, 11)
    for (const [, t] of Object.entries(mutated.transforms)) {
      expect(t.probability).toBe(0.25)
    }
  })
})

/** A copy as the renderer draws it, less the probability Mutate re-weighs. */
const geometry = (flame: FlameDescriptor) =>
  Object.fromEntries(
    copies(flame).map(([tid, { preAffine, postAffine, color, variations }]) => [
      tid,
      { preAffine, postAffine, color, variations },
    ]),
  )

const SEEDS = [1, 2, 3, 5, 8, 13]

// A symmetric flame keeps its rotations and its mirror exactly through a
// Mutate: only the user's transforms change.
describe('Mutate leaves the symmetry copies as the symmetry writer wrote them', () => {
  for (const dims of [2, 3] as const) {
    for (const type of TYPES) {
      it(`${type}, ${dims}D, no selection, seeds ${SEEDS.join(' ')}`, () => {
        const flame = symmetric(dims, type, [0.1, 0.2, 0.3])
        for (const seed of SEEDS) {
          const mutated = mutateFlameSeeded(
            flame,
            configFor(dims),
            options,
            seed,
          )
          expect(geometry(mutated)).toEqual(geometry(flame))
          for (const [, copy] of copies(mutated)) {
            expect(copy.probability).toBe(symmetryWeight(mutated.transforms))
          }
        }
      })

      it(`${type}, ${dims}D: never removes or adds a copy, at any add or remove chance`, () => {
        const flame = symmetric(dims, type, [2, 3, 1.5])
        const copyIds = copies(flame).map(([tid]) => tid)
        for (const seed of SEEDS) {
          for (const chances of [
            { removeTransformChance: 1 },
            { addTransformChance: 0.9 },
            { removeTransformChance: 0.5, addTransformChance: 0.5 },
          ]) {
            const mutated = mutateFlameSeeded(
              flame,
              configFor(dims),
              { ...options, ...chances, mutateVariations: 'all' },
              seed,
            )
            expect(copies(mutated).map(([tid]) => tid)).toEqual(copyIds)
            expect(geometry(mutated)).toEqual(geometry(flame))
          }
        }
      })
    }
  }

  it('leaves a copy alone even when a selection names it', () => {
    const flame = symmetric(2, 'dihedral', [0.1, 0.2, 0.3])
    const copyIds = copies(flame).map(([tid]) => tid)
    const mutated = mutateFlameSeeded(
      flame,
      configFor(2),
      { ...options, selectedTransformIds: ['u0', ...copyIds] },
      4,
    )
    expect(geometry(mutated)).toEqual(geometry(flame))
  })
})
