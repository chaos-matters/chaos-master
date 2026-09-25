import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { pureClone } from '../utils/clone'
import { FlameDescriptor, FlameDescriptor3D, renderSettingsDefault, validateFlame, } from './flameSchema'
import { flameDomainPlans, numberDomainOf, projectFlameToSchema, projectFlameValue, projectNumber, } from './numberDomain'
import type { DomainPlan, NumberDomain } from './numberDomain'

const whole = (min: number, max: number): NumberDomain => ({
  min,
  max,
  integer: true,
  cyclic: false,
})
const cyclic = (min: number, max: number): NumberDomain => ({
  min,
  max,
  integer: false,
  cyclic: true,
})

describe('numberDomainOf', () => {
  it('reads bounds, integer and the cyclic tag through optional wrappers', () => {
    expect(
      numberDomainOf(
        v.optional(
          v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(30)),
        ),
      ),
    ).toEqual(whole(0, 30))
    expect(
      numberDomainOf(
        v.pipe(
          v.number(),
          v.minValue(0),
          v.maxValue(1),
          v.metadata({ cyclic: true }),
        ),
      ),
    ).toEqual(cyclic(0, 1))
  })

  it('declares no domain for a number that is only asked to be finite', () => {
    expect(numberDomainOf(v.number())).toBeUndefined()
    expect(numberDomainOf(v.pipe(v.number(), v.finite()))).toBeUndefined()
    expect(numberDomainOf(v.string())).toBeUndefined()
  })

  it('refuses a cyclic tag without both bounds, since nothing can wrap', () => {
    expect(() =>
      numberDomainOf(
        v.pipe(v.number(), v.minValue(0), v.metadata({ cyclic: true })),
      ),
    ).toThrow(/finite minimum and maximum/)
  })
})

describe('projectNumber', () => {
  it('floors a fraction, as the renderer consumed it, then clamps', () => {
    expect(projectNumber(17.666, whole(0, 30))).toBe(17)
    expect(projectNumber(12.5, whole(0, 30))).toBe(12)
    expect(projectNumber(29.9, whole(0, 30))).toBe(29)
    expect(projectNumber(45, whole(0, 30))).toBe(30)
    expect(projectNumber(-0.5, whole(0, 30))).toBe(0)
  })

  it('wraps a cyclic value instead of stopping it at the end', () => {
    expect(projectNumber(1.25, cyclic(0, 1))).toBeCloseTo(0.25, 12)
    expect(projectNumber(2, cyclic(0, 1))).toBe(0)
    expect(projectNumber(-0.25, cyclic(0, 1))).toBeCloseTo(0.75, 12)
    // In range, both ends included, is left exactly as it is.
    expect(projectNumber(1, cyclic(0, 1))).toBe(1)
    expect(projectNumber(0.5, cyclic(0, 1))).toBe(0.5)
  })

  it('leaves what it cannot place alone', () => {
    expect(projectNumber(Number.NaN, whole(0, 30))).toBeNaN()
    expect(projectNumber(Infinity, cyclic(0, 1))).toBe(Infinity)
  })
})

/** Every bounded number actually present in `value`, with its path. */
function leaves(
  plan: DomainPlan,
  value: unknown,
  path: (string | number)[] = [],
  out: { path: (string | number)[]; domain: NumberDomain }[] = [],
) {
  if (plan.kind === 'number') {
    if (typeof value === 'number') out.push({ path, domain: plan.domain })
    return out
  }
  if (typeof value !== 'object' || value === null) return out
  const target = value as Record<string | number, unknown>
  const children: [string | number, DomainPlan][] =
    plan.kind === 'fields'
      ? plan.fields
      : Object.keys(target).map((key) => [key, plan.plan])
  for (const [key, child] of children) {
    leaves(child, target[key], [...path, key], out)
  }
  return out
}

function planLeafCount(plan: DomainPlan): number {
  if (plan.kind === 'number') return 1
  if (plan.kind === 'each') return planLeafCount(plan.plan)
  return plan.fields.reduce((sum, [, child]) => sum + planLeafCount(child), 0)
}

function setAt(root: unknown, path: (string | number)[], value: number) {
  let node = root as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) {
    node = node[key] as Record<string | number, unknown>
  }
  node[path.at(-1)!] = value
}

function getAt(root: unknown, path: (string | number)[]): unknown {
  let node = root
  for (const key of path) node = (node as Record<string | number, unknown>)[key]
  return node
}

/** Values just outside `domain`, and a fraction inside it when whole. */
function outOfDomain(domain: NumberDomain): number[] {
  const values: number[] = []
  if (Number.isFinite(domain.min)) values.push(domain.min - 0.5)
  if (Number.isFinite(domain.max)) values.push(domain.max + 0.5)
  if (domain.integer) values.push(Math.max(domain.min, 0) + 0.5)
  if (domain.cyclic) values.push(domain.max + 1.25, domain.min - 3.25)
  return values
}

/** A flame that carries every optional bounded field at least once. */
function fixture(dimensions: 2 | 3) {
  const affine =
    dimensions === 3
      ? {
          a: 1,
          b: 0,
          c: 0,
          d: 0,
          e: 1,
          f: 0,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 1,
          l: 0,
        }
      : { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  const transforms = {
    t1: {
      probability: 1,
      preAffine: affine,
      postAffine: affine,
      color: { x: 0.5, y: 0.5 },
      variations: { v1: { type: 'linearVar', weight: 1 } },
    },
  }
  return validateFlame({
    version: '1.0',
    renderSettings: {
      ...pureClone(renderSettingsDefault),
      dimensions,
      blendWeight: 0.5,
      edgeFadeColor: [0, 0, 0, 0.8],
    },
    transforms,
    layers: [{ id: 'l1', opacity: 0.5, transforms }],
  })
}

describe('projectFlameToSchema', () => {
  it('reads the two fields playback breaks off the schema itself', () => {
    const { flat } = flameDomainPlans()
    const byPath = new Map(
      leaves(flat, fixture(2)).map((l) => [l.path.join('.'), l.domain]),
    )
    expect(byPath.get('renderSettings.skipIters')).toEqual(whole(0, 50))
    expect(byPath.get('renderSettings.palettePhase')).toEqual(cyclic(0, 1))
  })

  it.each([2, 3] as const)(
    'every bounded number of a %dD flame lands in a flame that validates',
    (dimensions) => {
      const { flat, spatial } = flameDomainPlans()
      const plan = dimensions === 3 ? spatial : flat
      const base = fixture(dimensions)
      const found = leaves(plan, base)
      // The fixture must reach every bounded field the schema has, or a new
      // one would pass here untested.
      expect(found.length).toBeGreaterThanOrEqual(planLeafCount(plan))
      for (const { path, domain } of found) {
        const key = path.join('.')
        for (const bad of outOfDomain(domain)) {
          // `dimensions` picks the schema the rest is read with, and nothing
          // animates it: a value past 3 has no frame to come from.
          if (key === 'renderSettings.dimensions' && bad > domain.max) continue
          const flame = pureClone(base)
          setAt(flame, path, bad)
          projectFlameToSchema(flame)
          const label = `${key} = ${bad}`
          expect(() => validateFlame(pureClone(flame)), label).not.toThrow()
          const landed = getAt(flame, path) as number
          expect(landed, label).toBe(projectNumber(bad, domain))
        }
      }
    },
  )

  it('leaves a flame that already validates exactly as it was', () => {
    const flame = fixture(2)
    const before = pureClone(flame)
    expect(projectFlameToSchema(flame)).toBe(flame)
    expect(flame).toEqual(before)
  })
})

/**
 * Every bounded number anywhere under `schema`, whatever holds it: unions,
 * variants, intersections, lazy schemas and rest entries included. `compile`
 * follows objects, tuples, records, arrays and optional wrappers only.
 */
function boundedNumbersAnywhere(
  schema: unknown,
  path = '',
  // The schemas on the way here, so a lazy self-reference ends; shared
  // schemas elsewhere (one colour schema for every channel) still count.
  ancestors: readonly unknown[] = [],
): string[] {
  if (
    typeof schema !== 'object' ||
    schema === null ||
    ancestors.includes(schema)
  ) {
    return []
  }
  if (numberDomainOf(schema)) return [path]
  const node = schema as Record<string, unknown>
  const children: [string, unknown][] = []
  if (node.entries && typeof node.entries === 'object') {
    for (const [k, c] of Object.entries(node.entries)) children.push([k, c])
  }
  if (Array.isArray(node.items)) {
    node.items.forEach((c, i) => children.push([String(i), c]))
  }
  if (Array.isArray(node.options)) {
    node.options.forEach((c, i) => children.push([`<option ${i}>`, c]))
  }
  for (const key of ['item', 'value', 'wrapped', 'rest'] as const) {
    if (node[key]) children.push([`<${key}>`, node[key]])
  }
  if (typeof node.getter === 'function') {
    children.push([
      '<lazy>',
      (node.getter as (i: unknown) => unknown)(undefined),
    ])
  }
  return children.flatMap(([key, child]) =>
    boundedNumbersAnywhere(child, path ? `${path}.${key}` : key, [
      ...ancestors,
      schema,
    ]),
  )
}

describe('the compiled plan', () => {
  // A bound placed under a union, variant, intersection or lazy schema would
  // be skipped by `compile` without a word, and playback would go back to
  // writing frames that do not validate. This counts them the long way.
  it.each([
    ['2D', FlameDescriptor, 'flat'],
    ['3D', FlameDescriptor3D, 'spatial'],
  ] as const)(
    'reaches every bounded number in the %s flame schema',
    (_label, schema, which) => {
      const plan = flameDomainPlans()[which]
      const everywhere = boundedNumbersAnywhere(schema)
      expect(everywhere.length).toBeGreaterThan(0)
      expect(planLeafCount(plan), everywhere.join('\n')).toBe(everywhere.length)
    },
  )

  it('finds a bound hidden under a union, so the check above can fail', () => {
    const hidden = v.object({
      a: v.union([v.string(), v.pipe(v.number(), v.maxValue(1))]),
    })
    expect(boundedNumbersAnywhere(hidden)).toEqual(['a.<option 1>'])
  })

  it('copies an array it has to change instead of rewriting it', () => {
    const flame = fixture(2)
    const keyframeValue: [number, number, number] = [1.5, 0, 0]
    flame.renderSettings.backgroundColor = keyframeValue
    projectFlameToSchema(flame)
    expect(flame.renderSettings.backgroundColor).toEqual([1, 0, 0])
    expect(keyframeValue).toEqual([1.5, 0, 0])
  })
})

describe('projectFlameValue', () => {
  const at = (path: string, value: unknown, dimensions?: number) =>
    projectFlameValue(['renderSettings', ...path.split('.')], value, dimensions)

  it('floors an integer setting and clamps it at both ends', () => {
    expect(at('skipIters', 7.9)).toBe(7)
    expect(at('skipIters', -3)).toBe(0)
    expect(at('skipIters', 60)).toBe(50)
    expect(at('plotsPerChain', 0.5)).toBe(1)
  })

  it('wraps a cyclic setting', () => {
    expect(at('palettePhase', 1.25)).toBe(0.25)
    expect(at('palettePhase', -0.25)).toBe(0.75)
  })

  it('reaches a bound inside a nested object or a tuple', () => {
    expect(at('camera.zoom', 9000, 3)).toBe(500)
    expect(at('backgroundColor.1', 2)).toBe(1)
    expect(at('camera', { zoom: 0, position: [3, 4] })).toEqual({
      zoom: 0.01,
      position: [3, 4],
    })
  })

  it('copies an array it has to change', () => {
    const colour = [1.5, -1, 0.5]
    expect(at('backgroundColor', colour)).toEqual([1, 0, 0.5])
    expect(colour).toEqual([1.5, -1, 0.5])
  })

  it('leaves a value the schema does not bound as it is', () => {
    expect(at('paletteSpeed', 9000)).toBe(9000)
    expect(at('camera.position', [1e5, -1e5])).toEqual([1e5, -1e5])
    expect(at('notASetting', 7.5)).toBe(7.5)
    expect(at('skipIters.deeper', 7.5)).toBe(7.5)
    expect(at('skipIters', 'seven')).toBe('seven')
    expect(at('skipIters', Number.NaN)).toBeNaN()
  })
})
