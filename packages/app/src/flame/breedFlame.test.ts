import { describe, expect, it } from 'vitest'
import { breedFlames, DEFAULT_BREED_CONFIG } from './breedFlame'
import { example1 } from './examples/example1'
import { example3 } from './examples/example3'
import { example5 } from './examples/example5'
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
