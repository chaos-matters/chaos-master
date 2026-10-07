// Characterizes the migration that runs inside validateFlame and rewrites, in
// place, every flame that enters the app: autosave, share links, .flame imports,
// gallery rows. A wrong entry does not throw -- the flame validates and renders
// as a different fractal -- so these pin exact values rather than shapes.
import { describe, expect, it } from 'vitest'
import { renderSettingsDefault, validateFlame } from './flameSchema'
import { migrateFlameVariationTypes, VARIATION_TYPE_MIGRATIONS, } from './migrateFlameTypes'

const IDENTITY_2D = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }

function rawFlame(
  variation: Record<string, unknown>,
  opts: { dimensions?: 2 | 3; preAffine?: Record<string, number> } = {},
) {
  return {
    renderSettings: {
      ...renderSettingsDefault,
      ...(opts.dimensions === 3 ? { dimensions: 3 } : {}),
    },
    transforms: {
      t1: {
        probability: 1,
        preAffine: { ...(opts.preAffine ?? IDENTITY_2D) },
        postAffine: { ...IDENTITY_2D },
        color: { x: 0, y: 0 },
        variations: { v1: { weight: 1, ...variation } },
      },
    },
  }
}

const firstVariation = (flame: ReturnType<typeof rawFlame>) =>
  flame.transforms.t1.variations.v1 as Record<string, unknown>

describe('VARIATION_TYPE_MIGRATIONS', () => {
  it('only ever targets a Var-suffixed name', () => {
    const bad = Object.entries(VARIATION_TYPE_MIGRATIONS).filter(
      ([, to]) => !to.endsWith('Var'),
    )
    expect(bad).toEqual([])
  })

  it('never chains: no target is itself a legacy name', () => {
    const chained = Object.values(VARIATION_TYPE_MIGRATIONS).filter((to) =>
      Object.hasOwn(VARIATION_TYPE_MIGRATIONS, to),
    )
    expect(chained).toEqual([])
  })
})

describe('migrateFlameVariationTypes', () => {
  it('renames a legacy variation and keeps its weight and params', () => {
    const flame = rawFlame({
      type: 'horseshoe',
      weight: 0.75,
      params: { spread: 2 },
    })
    migrateFlameVariationTypes(flame)
    expect(firstVariation(flame)).toEqual({
      type: 'horseshoeVar',
      weight: 0.75,
      params: { spread: 2 },
    })
  })

  it('fixes the two casing mistakes', () => {
    for (const [from, to] of [
      ['flipyVar', 'flipYVar'],
      ['flipcircleVar', 'flipCircleVar'],
    ]) {
      const flame = rawFlame({ type: from })
      migrateFlameVariationTypes(flame)
      expect(firstVariation(flame).type).toBe(to)
    }
  })

  it('is a fixed point: a migrated flame migrates to itself', () => {
    const once = migrateFlameVariationTypes(rawFlame({ type: 'julia' }))
    const twice = migrateFlameVariationTypes(structuredClone(once))
    expect(twice).toEqual(once)
  })

  it('passes an unknown type through untouched rather than dropping it', () => {
    const flame = rawFlame({ type: 'notARealVariation' })
    migrateFlameVariationTypes(flame)
    expect(firstVariation(flame).type).toBe('notARealVariation')
  })

  // The table is a plain object, so `in` also finds what every object
  // inherits: 'constructor' became the Object function and '__proto__'
  // Object.prototype, where any other unknown name passes through.
  it('passes through a type named like an inherited Object member', () => {
    const names = ['constructor', 'toString', 'hasOwnProperty', '__proto__']
    const rewritten = names.filter((type) => {
      const flame = rawFlame({ type })
      migrateFlameVariationTypes(flame)
      return firstVariation(flame).type !== type
    })
    expect(rewritten).toEqual([])
  })

  it('widens a 2D affine on a 3D flame into the kernel row layout, value by value', () => {
    // Distinct coefficients, so a swapped row or column cannot pass.
    const flame = rawFlame(
      { type: 'linearVar' },
      {
        dimensions: 3,
        preAffine: { a: 1.1, b: 2.2, c: 3.3, d: 4.4, e: 5.5, f: 6.6 },
      },
    )
    migrateFlameVariationTypes(flame)
    // Rows a,b,c,d / e,f,g,h / i,j,k,l with translation in d,h,l; the 2D
    // x-row (a,b,c) and y-row (d,e,f) land in the first two rows, z is identity.
    expect(flame.transforms.t1.preAffine).toEqual({
      a: 1.1,
      b: 2.2,
      c: 0,
      d: 3.3,
      e: 4.4,
      f: 5.5,
      g: 0,
      h: 6.6,
      i: 0,
      j: 0,
      k: 1,
      l: 0,
    })
  })

  it("leaves a 2D flame's affines 2D", () => {
    const flame = rawFlame({ type: 'linearVar' })
    migrateFlameVariationTypes(flame)
    expect(flame.transforms.t1.preAffine).toEqual(IDENTITY_2D)
  })

  it('leaves an affine that is already 3D alone', () => {
    const affine3D = {
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
    }
    const flame = rawFlame(
      { type: 'linearVar' },
      { dimensions: 3, preAffine: affine3D },
    )
    migrateFlameVariationTypes(flame)
    expect(flame.transforms.t1.preAffine).toEqual(affine3D)
  })

  it('widens the final transform of a 3D flame too', () => {
    const flame = {
      ...rawFlame({ type: 'linearVar' }, { dimensions: 3 }),
      finalTransform: { a: 1, b: 0, c: 0.5, d: 0, e: 1, f: -0.5 },
    }
    migrateFlameVariationTypes(flame)
    expect(flame.finalTransform).toMatchObject({ d: 0.5, h: -0.5, k: 1 })
  })
})

describe('validateFlame', () => {
  it('runs the migration, so a legacy flame loads with canonical names', () => {
    const out = validateFlame(rawFlame({ type: 'horseshoe' }))
    const variation = Object.values(
      Object.values(out.transforms)[0]!.variations,
    )[0]!
    expect(variation.type).toBe('horseshoeVar')
  })

  // The migration passes such a name through (above), and the schema refuses
  // it: a plain-object table looked up by that type would find the member.
  it.each(['constructor', 'toString'])(
    'refuses a type named %s, which every object inherits',
    (type) => {
      expect(() => validateFlame(rawFlame({ type }))).toThrow(
        'This flame cannot be shown',
      )
    },
  )
})
