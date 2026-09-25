/**
 * Every variation name the app can produce resolves in both IFS pipelines,
 * and a name it never produced is drawn by neither.
 *
 * The app writes each registered 2D type, and each custom variation, into a
 * 2D flame; each registered 3D type into a 3D flame; and a Flame Clash 2D
 * fighter's 2D types into its fight flame, marked `from2D`
 * (flame/clash/convert2Dto3D.ts). A 3D flame that holds a 2D type or a custom
 * variation draws it through VARIATION_2D_TO_3D_MAP as its 3D analog, or else
 * as its own 2D function; a `from2D` transform always draws it as itself.
 * producedVariationTypes.test.ts holds the producers to registered names.
 *
 * Before v1.0.0 the app keeps no compatibility for names it never produced:
 * validation loads such a name as it was written, and neither pipeline draws
 * it. That covers the names only the 3D map once held (`blur`, `curl`,
 * `sphere`, `linearT`, ...): the Flame Clash branch had migrated six of them
 * at load and kept ten mapped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildIfsPipeline, resolveIfsWgsl } from './ifsPipelineWgsl.testUtils'
import { renderSettingsDefault, validateFlame } from './schema/flameSchema'
import { resolveVariationType3D, VARIATION_2D_TO_3D_MAP, } from './transformFunction3D'
import { transformVariations } from './variations'
import { clearAllCustomVariations, createCustomVariation, } from './variations/custom'
import { transformVariations3D } from './variations3D'
import type { TransformRecord } from './schema/flameSchema'

// Read before any test registers a custom variation into the 2D registry.
const TYPES_2D = Object.keys(transformVariations)
const TYPES_3D = Object.keys(transformVariations3D)

/** The registered 2D types a 3D flame draws as a 3D analog. */
const ANALOGS_3D: Record<string, string> = {
  bubbleVar: 'bubble3D',
  cylinderVar: 'cylinder3D',
  cylinder2Var: 'cylindrical3D',
  cylinderApoVar: 'cylinder3D',
  gaussianVar: 'gaussian3D',
  blurVar: 'blur3D',
  squareVar: 'square3D',
  scryVar: 'scry3D',
  crossVar: 'cross3D',
  curlVar: 'curl3D',
  pdjVar: 'pdj3D',
}

/**
 * Names the app never produced: those only the 3D map once held, and one that
 * is no variation at all. The map's tenth, `sphereVar`, is spelled like a
 * variation, which the fixture guard refuses in a test (fixtureRealism.test.ts,
 * rule c); the map's own test below covers it.
 */
const NEVER_PRODUCED = [
  'blur',
  'square',
  'scry',
  'cross',
  'curl',
  'pdj',
  'linearT',
  'swirl3',
  'polar2',
  'nPolar',
  'ex',
  'cylindrical',
  'sphere',
  'hemisphere',
  'starfield',
  'notAVariation',
]

// The test runner's own localStorage is not a working Storage, and the
// custom variations registry saves to it.
const stored = new Map<string, string>()
const memoryStorage: Storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => {
    stored.set(key, value)
  },
  removeItem: (key) => {
    stored.delete(key)
  },
  clear: () => {
    stored.clear()
  },
  key: (index) => [...stored.keys()][index] ?? null,
  get length() {
    return stored.size
  },
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage)
})

afterEach(() => {
  clearAllCustomVariations()
  stored.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Registers a custom variation, as the editor saves one, and returns its type. */
function customVariation(): string {
  const made = createCustomVariation(
    'Resolution check',
    'return vec2f(pos.y, -pos.x);',
  )
  if (!made.success) throw new Error(JSON.stringify(made.errors))
  return made.def.id
}

/**
 * One transform that holds a variation of each type, keyed `v0`, `v1`, ...
 * in order, so the shader's uniforms name each one.
 */
function transformsWith(
  types: readonly string[],
  from2D?: true,
): TransformRecord {
  const identity = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  return {
    t1: {
      probability: 1,
      preAffine: identity,
      postAffine: identity,
      color: { x: 0, y: 0 },
      ...(from2D && { from2D }),
      variations: Object.fromEntries(
        types.map((type, index) => [`v${index}`, { type, weight: 0.5 }]),
      ),
    },
  } as unknown as TransformRecord
}

/** The types, among `types`, whose variation the compiled shader leaves out. */
function leftOut(
  types: readonly string[],
  dims: 2 | 3,
  from2D?: true,
): string[] {
  const wgsl = resolveIfsWgsl({
    transforms: transformsWith(types, from2D),
    dims,
  })
  const drawn = new Set(wgsl.match(/\bvariationv\d+\b/g))
  return types.filter((_, index) => !drawn.has(`variationv${index}`))
}

/**
 * A raw one-transform flame whose variation has `type`, as JSON brings it.
 * Its params hold every key the parametric names here read, so each reads
 * values of the flame's and none falls back to a default unnoticed.
 */
function rawFlame(type: string, dimensions: 2 | 3) {
  const identity = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  return {
    renderSettings: { ...renderSettingsDefault, dimensions },
    transforms: {
      t1: {
        probability: 1,
        preAffine: { ...identity, a: 0.6, e: 0.6 },
        postAffine: identity,
        color: { x: 0.2, y: -0.1 },
        variations: {
          v1: {
            type,
            weight: 0.7,
            params: { a: 0.3, b: 1.1, c: -0.4, d: 0.8, e: 0.1, f: -0.2 },
          },
        },
      },
    },
  }
}

describe('a 2D flame', () => {
  it('draws every registered 2D type and a custom variation as itself', () => {
    expect(leftOut([...TYPES_2D, customVariation()], 2)).toEqual([])
  })
})

describe('a 3D flame', () => {
  it('draws every registered 3D type as itself', () => {
    for (const type of TYPES_3D) expect(resolveVariationType3D(type)).toBe(type)
    expect(leftOut(TYPES_3D, 3)).toEqual([])
  })

  it('draws a 2D type as its 3D analog, and every other 2D type and a custom variation as itself', () => {
    const custom = customVariation()
    const drawnAs = Object.fromEntries(
      [...TYPES_2D, custom].map((type) => [type, resolveVariationType3D(type)]),
    )
    expect(drawnAs).toEqual(
      Object.fromEntries(
        [...TYPES_2D, custom].map((type) => [type, ANALOGS_3D[type] ?? type]),
      ),
    )
    expect(leftOut([...TYPES_2D, custom], 3)).toEqual([])
  })

  it.each(Object.entries(ANALOGS_3D))(
    'draws %s with the shader and uniforms of %s',
    (type, analog) => {
      const render = (drawn: string) => {
        const flame = validateFlame(rawFlame(drawn, 3))
        const pipeline = buildIfsPipeline({
          transforms: flame.transforms,
          dims: 3,
        })
        pipeline.update(flame)
        return { wgsl: pipeline.wgsl(), writes: pipeline.writes }
      }
      const mapped = render(type)
      const direct = render(analog)
      expect(mapped.wgsl).toBe(direct.wgsl)
      expect(mapped.writes).toEqual(direct.writes)
    },
  )
})

describe("a Flame Clash 2D fighter's transform in a 3D flame (from2D)", () => {
  it('draws every registered 2D and 3D type and a custom variation as itself', () => {
    const types = [...TYPES_2D, ...TYPES_3D, customVariation()]
    expect(
      types.filter((type) => resolveVariationType3D(type, true) !== type),
    ).toEqual([])
    expect(leftOut(types, 3, true)).toEqual([])
  })
})

describe('VARIATION_2D_TO_3D_MAP', () => {
  it('sends registered 2D types only, each to a registered 3D type', () => {
    expect(
      Object.keys(VARIATION_2D_TO_3D_MAP).filter(
        (type) => !Object.hasOwn(transformVariations, type),
      ),
    ).toEqual([])
    expect(
      Object.values(VARIATION_2D_TO_3D_MAP).filter(
        (analog) => !Object.hasOwn(transformVariations3D, analog),
      ),
    ).toEqual([])
  })
})

describe('a name the app never produced', () => {
  it.each(NEVER_PRODUCED)(
    'loads %s as it was written, and neither pipeline draws it',
    (name) => {
      // Each pipeline warns as it skips the name.
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      for (const dims of [2, 3] as const) {
        const flame = validateFlame(rawFlame(name, dims))
        const [variation] = Object.values(
          Object.values(flame.transforms)[0]!.variations,
        )
        expect(variation!.type).toBe(name)
        expect(leftOut([name], dims)).toEqual([name])
      }
      expect(resolveVariationType3D(name)).toBeUndefined()
      expect(resolveVariationType3D(name, true)).toBeUndefined()
    },
  )
})
