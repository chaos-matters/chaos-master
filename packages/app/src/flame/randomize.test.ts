import { describe, expect, it } from 'vitest'
import { recordEntries } from '@/utils/record'
import { examples } from './examples'
import { createSeededRandomSource, mutateFlame, mutateFlameSeeded, randomizeVariationParams, smartMutateAffine2D, smartMutateAffine3D, withRandomSource, } from './randomize'
import type { GenerateRandomFlameConfig, MutateFlameOptions } from './randomize'
import type { FlameDescriptor } from './schema/flameSchema'

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

/**
 * `mutateFlameSeeded` is the session recorder's replay contract for Mutate:
 * one (flame, config, options, seed) tuple must always yield one descriptor,
 * ids included. See docs/plans/semantic-recorder-plan.md.
 */
describe('mutateFlameSeeded', () => {
  const config: GenerateRandomFlameConfig = {
    strength: 0.5,
    minTransforms: 2,
    maxTransforms: 4,
    minVariations: 1,
    maxVariations: 3,
    allowedVariations: [],
    dimensions: 2,
  }
  // Force the structural paths — added transforms and topped-up variations
  // are the only things that mint ids, so they are what needs pinning.
  const options: MutateFlameOptions = {
    mutateAffine: true,
    affineMode: 'smart',
    mutateVariations: 'all',
    mutateColors: true,
    addTransformChance: 0.3,
    removeTransformChance: 0.05,
  }

  it('is deterministic for one seed, and differs across seeds', () => {
    const a = mutateFlameSeeded(examples.example1, config, options, 1234)
    const b = mutateFlameSeeded(examples.example1, config, options, 1234)
    expect(b).toEqual(a)
    expect(
      mutateFlameSeeded(examples.example1, config, options, 99),
    ).not.toEqual(a)
  })

  it('keeps surviving ids untouched (timeline tracks reference them)', () => {
    // No structural churn, so nothing is added or removed: every input id
    // must come out the other side unchanged.
    const stable: MutateFlameOptions = {
      ...options,
      mutateVariations: 'modify',
      addTransformChance: 0,
      removeTransformChance: 0,
    }
    const mutated = mutateFlameSeeded(examples.example1, config, stable, 7)
    for (const [tid, transform] of recordEntries(
      examples.example1.transforms,
    )) {
      expect(Object.keys(mutated.transforms)).toContain(tid)
      expect(Object.keys(mutated.transforms[tid]!.variations)).toEqual(
        Object.keys(transform.variations),
      )
    }
  })

  it('renames without dropping entries when a re-run reuses the seed', () => {
    // A hand-written .steps.json may reuse one seed across mutates, so the
    // second pass can mint a name the first pass already handed to a
    // survivor — and Object.fromEntries would silently drop one of them.
    // Renaming is pure bookkeeping: it must preserve the shape mutateFlame
    // produced, entry for entry.
    const shape = (f: FlameDescriptor) => [
      Object.keys(f.transforms).length,
      ...Object.values(f.transforms).map(
        (t) => Object.keys(t.variations).length,
      ),
    ]
    // Swept rather than pinned to one seed: whether a re-run mints a name a
    // survivor already holds depends on where the mutator happens to add
    // entities, so a single lucky seed proves nothing.
    for (let seed = 0; seed < 40; seed++) {
      const once = mutateFlameSeeded(examples.example1, config, options, seed)
      const raw = withRandomSource(createSeededRandomSource(seed), () =>
        mutateFlame(once, config, options),
      )
      const twice = mutateFlameSeeded(once, config, options, seed)
      expect(shape(twice), `seed ${seed}`).toEqual(shape(raw))
    }
  })
})
