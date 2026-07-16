import { describe, expect, it } from 'vitest'
import { breedFlames, DEFAULT_BREED_CONFIG } from './breedFlame'
import { example1 } from './examples/example1'
import { example3 } from './examples/example3'
import { example5 } from './examples/example5'
import { validateFlame } from './schema/flameSchema'
import type { BreedConfig } from './breedFlame'

function expectValidFlame(f: unknown) {
  const flame = f as Record<string, unknown>
  expect(flame).toBeDefined()
  expect(flame.version).toBeTruthy()
  expect(flame.transforms).toBeTruthy()
  const transforms = flame.transforms as Record<string, unknown>
  const tids = Object.keys(transforms)
  expect(tids.length).toBeGreaterThan(0)
  for (const tid of tids) {
    const t = transforms[tid] as Record<string, unknown>
    expect(t.probability).toBeTypeOf('number')
    expect(t.color).toBeTruthy()
    expect(t.variations).toBeTruthy()
    const vars = t.variations as Record<string, unknown>
    expect(Object.keys(vars).length).toBeGreaterThan(0)
  }
}

/** Parent with `count` distinct single-linearVar transforms. */
function makeLinearParent(count: number) {
  const transforms: Record<string, unknown> = {}
  for (let i = 0; i < count; i++) {
    transforms[`t_${count}_${i}`] = {
      probability: 1 / count,
      preAffine: { a: 1, b: 0, c: i * 0.1, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.5, y: 0.5 },
      variations: { [`v_${count}_${i}`]: { type: 'linearVar', weight: 1 } },
    }
  }
  return validateFlame({ version: '1.0', transforms })
}

/** Sorted multiset of all variation types across a flame's transforms. */
function variationTypes(f: unknown): string[] {
  const transforms = (
    f as {
      transforms: Record<
        string,
        { variations: Record<string, { type: string }> }
      >
    }
  ).transforms
  return Object.values(transforms)
    .flatMap((t) => Object.values(t.variations).map((v) => v.type))
    .sort()
}

describe('breedFlames', () => {
  it('returns the configured number of children', () => {
    const children = breedFlames(example1, example3, { count: 5 })
    expect(children).toHaveLength(5)
  })

  it('returns 9 children by default', () => {
    const children = breedFlames(example1, example3)
    expect(children).toHaveLength(DEFAULT_BREED_CONFIG.count)
  })

  it('returns empty array for count 0', () => {
    const children = breedFlames(example1, example3, { count: 0 })
    expect(children).toHaveLength(0)
  })

  it('produces valid child flames', () => {
    const children = breedFlames(example1, example3, { count: 9 })
    for (const child of children) {
      expectValidFlame(child)
    }
  })

  it('works with different parent pairs', () => {
    const pairs: [typeof example1, typeof example3][] = [
      [example1, example3],
      [example3, example5],
      [example5, example1],
    ]
    for (const [a, b] of pairs) {
      const children = breedFlames(a, b, { count: 3 })
      expect(children).toHaveLength(3)
      for (const child of children) {
        expectValidFlame(child)
      }
    }
  })

  it('handles same parent (self-breeding)', () => {
    const children = breedFlames(example1, example1, { count: 5 })
    expect(children).toHaveLength(5)
    for (const child of children) {
      expectValidFlame(child)
    }
  })

  it('gives children unique names', () => {
    const children = breedFlames(example1, example3, { count: 5 })
    const names = children.map((c) => c.metadata?.name)
    expect(new Set(names).size).toBe(children.length)
  })

  it('preserves render settings from parent A', () => {
    const children = breedFlames(example1, example3, { count: 3 })
    for (const child of children) {
      expect(child.renderSettings.dimensions).toBe(
        example1.renderSettings.dimensions,
      )
      expect(child.renderSettings.camera.zoom).toBe(
        example1.renderSettings.camera.zoom,
      )
    }
  })

  describe('crossover modes', () => {
    const modes: BreedConfig['crossoverMode'][] = [
      'uniform',
      'weighted',
      'shuffle',
      'alternate',
      'smart',
    ]

    for (const mode of modes) {
      it(`${mode} produces valid children`, () => {
        const children = breedFlames(example1, example3, {
          count: 4,
          crossoverMode: mode,
        })
        expect(children).toHaveLength(4)
        for (const child of children) {
          expectValidFlame(child)
        }
      })
    }

    it('smart cross-breeds matched dominant types instead of reassembling', () => {
      // Self-breed: every dominant variation type matches its counterpart, so
      // children are built purely from cross-bred pairs — same transform count
      // and variation-type multiset as the parent (mutation off keeps both
      // deterministic).
      const children = breedFlames(example1, example1, {
        count: 3,
        crossoverMode: 'smart',
        mutationStrength: 0,
      })
      expect(children).toHaveLength(3)
      const parentTypes = variationTypes(example1)
      for (const child of children) {
        expectValidFlame(child)
        expect(Object.keys(child.transforms)).toHaveLength(
          Object.keys(example1.transforms).length,
        )
        expect(variationTypes(child)).toEqual(parentTypes)
      }
    })

    it('uniform reaches the target transform count with skewed parents', () => {
      // 10 vs 1 transforms → target = round(11 / 2) = 6. The balance-preferring
      // selection stalls once parent B's single transform is used, so the open
      // slots must be backfilled from the skipped candidates.
      const big = makeLinearParent(10)
      const small = makeLinearParent(1)
      for (const [a, b] of [
        [big, small],
        [small, big],
      ] as const) {
        const children = breedFlames(a, b, {
          count: 4,
          crossoverMode: 'uniform',
          mutationStrength: 0,
        })
        expect(children).toHaveLength(4)
        for (const child of children) {
          expectValidFlame(child)
          expect(Object.keys(child.transforms)).toHaveLength(6)
        }
      }
    })
  })

  describe('mutation strength', () => {
    it('zero mutation still produces valid children', () => {
      const children = breedFlames(example1, example3, {
        count: 5,
        mutationStrength: 0,
      })
      expect(children).toHaveLength(5)
      for (const child of children) {
        expectValidFlame(child)
      }
    })

    it('full mutation produces valid children', () => {
      const children = breedFlames(example1, example3, {
        count: 5,
        mutationStrength: 1,
      })
      expect(children).toHaveLength(5)
      for (const child of children) {
        expectValidFlame(child)
      }
    })

    it('high mutation creates diversity', () => {
      const lowMut = breedFlames(example1, example3, {
        count: 5,
        mutationStrength: 0,
        crossoverMode: 'uniform',
      })
      const highMut = breedFlames(example1, example3, {
        count: 5,
        mutationStrength: 1,
        crossoverMode: 'uniform',
      })
      for (const child of [...lowMut, ...highMut]) {
        expectValidFlame(child)
      }
    })
  })

  it('children have non-zero transform probabilities', () => {
    const children = breedFlames(example1, example3, { count: 9 })
    for (const child of children) {
      const transforms = child.transforms as Record<
        string,
        { probability: number }
      >
      const totalProb = Object.values(transforms).reduce(
        (s, t) => s + t.probability,
        0,
      )
      expect(totalProb).toBeGreaterThan(0.99)
      expect(totalProb).toBeLessThan(1.01)
    }
  })
})
