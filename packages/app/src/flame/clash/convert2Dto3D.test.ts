/**
 * How a fighter takes its 3D form: the stem rule, the flat-card fallback, the
 * morph that inflates a flat card without changing the compiled shader, and
 * how the 3D renderer resolves each variation of it.
 */
import { describe, expect, it } from 'vitest'
import { examples } from '../examples'
import { resolveIfsWgsl } from '../ifsPipelineWgsl.testUtils'
import { shaderShapeOf } from '../shaderShape'
import { resolveVariationType3D } from '../transformFunction3D'
import { transformVariations } from '../variations'
import { fighterForm, stemTwin3D, twin3D, Z_TRANSPARENT_TWINS, } from './convert2Dto3D'
import { IDENTITY_AFFINE } from './placement'
import type { FlameDescriptor, TransformFunction, TransformRecord, } from '../schema/flameSchema'

const shape = (transforms: Record<string, unknown>) =>
  JSON.stringify(shaderShapeOf(transforms as TransformRecord))

/** A 2D flame with the given variation types, one transform each. */
function flat2D(types: string[]): FlameDescriptor {
  const base = examples.linear1
  const transforms = Object.fromEntries(
    types.map((type, n) => [
      `t${n}`,
      {
        probability: 1,
        visible: true,
        preAffine: { a: 0.5, b: 0.1, c: 0.2, d: -0.1, e: 0.5, f: 0.3 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0.1, y: 0.1 },
        colorSpeed: 0.5,
        variations: { v: { type, weight: 0.8, visible: true } },
      },
    ]),
  )
  return { ...base, transforms }
}

describe('stemTwin3D', () => {
  it.each([
    ['sphericalVar', 'spherical3D'],
    ['juliaVar', 'julia3D'],
    ['linearVar', 'linear3D'],
  ])('sends %s to %s', (from, to) => {
    expect(stemTwin3D(from)).toBe(to)
  })

  it.each([
    ['juliaNVar', 'no 3D twin'],
    ['fanVar', 'a twin that takes parameters'],
    ['curlVar', 'a 2D variation that takes parameters'],
    ['spherical3D', 'already 3D'],
    ['notAVariation', 'not registered'],
  ])('leaves %s alone: %s', (type) => {
    expect(stemTwin3D(type)).toBeUndefined()
  })
})

describe('twin3D', () => {
  it.each([
    ['sphericalVar', 'spherical3D'],
    ['gaussianVar', 'gaussian3D'],
  ])('is the stem twin where there is one: %s to %s', (from, to) => {
    expect(twin3D(from)).toBe(to)
  })

  it.each([
    ['curlVar', 'curl3D'],
    ['pdjVar', 'pdj3D'],
    ['cylinder2Var', 'cylindrical3D'],
    ['cylinderApoVar', 'cylinder3D'],
  ])(
    'is else the analog the 3D renderer has always drawn %s as, %s',
    (from, to) => {
      expect(stemTwin3D(from)).toBeUndefined()
      expect(twin3D(from)).toBe(to)
      expect(resolveVariationType3D(from)).toBe(to)
    },
  )

  it.each(['juliaNVar', 'fanVar', 'spherical3D', 'notAVariation'])(
    'is nothing for %s',
    (type) => {
      expect(twin3D(type)).toBeUndefined()
    },
  )
})

describe('fighterForm', () => {
  it('takes a 3D flame as it is', () => {
    const form = fighterForm(examples.example37)
    expect(form.kind).toBe('native3D')
    expect(form.transformsAt(0)).toBe(form.transformsAt(1))
    expect(Object.keys(form.transformsAt(0))).toEqual(
      Object.keys(examples.example37.transforms),
    )
  })

  it('inflates a 2D flame whose twins give it depth', () => {
    const form = fighterForm(examples.goldenApollonianGasket)
    expect(form.kind).toBe('inflates')
    expect(form.converted).toEqual(['sphericalVar -> spherical3D'])
  })

  it('lists what it keeps as 2D', () => {
    const form = fighterForm(examples.neonJulianCosmos)
    expect(form.kind).toBe('inflates')
    expect(form.kept).toContain('juliaNVar')
    expect(form.converted).toContain('sphericalVar -> spherical3D')
  })

  it('keeps a flat card when nothing converts', () => {
    const form = fighterForm(examples.example2)
    expect(form.kind).toBe('flatCard')
    expect(form.converted).toEqual([])
    expect(form.kept).toEqual(['juliaScopeVar'])
  })

  it.each([...Z_TRANSPARENT_TWINS])(
    'keeps a flat card when the only twin is %s, which passes z through',
    (twin) => {
      const form = fighterForm(flat2D([twin.replace(/3D$/, 'Var')]))
      expect(form.kind).toBe('flatCard')
    },
  )

  it('does not count a twin that draws nothing', () => {
    const flame = flat2D(['sphericalVar'])
    const t0 = Object.values(flame.transforms)[0]!
    Object.values(t0.variations)[0]!.weight = 0
    expect(fighterForm(flame).kind).toBe('flatCard')
  })

  it('lays a flat card flat at every morph', () => {
    const form = fighterForm(examples.example2)
    for (const morph of [0, 0.5, 1]) {
      for (const t of Object.values(form.transformsAt(morph))) {
        const pre = t.preAffine as Record<string, number>
        expect([pre.i, pre.j, pre.k, pre.l]).toEqual([0, 0, 0, 0])
      }
    }
  })

  it('lifts the affines of a 2D fighter as its 2D renderer reads them, g-l ignored', () => {
    // A 2D flame's affine may hold g-l, which the 2D schema keeps and its
    // renderer ignores (affineLayoutOf, arcade/affineTerms.ts).
    const flame = flat2D(['sphericalVar'])
    const [tid, t0] = Object.entries(flame.transforms)[0]!
    const read = { a: 0.5, b: 0.1, c: 0.2, d: -0.1, e: 0.5, f: 0.3 }
    const held = { ...read, g: 0.7, h: -0.4, i: 0.6, j: 0.2, k: 0.9, l: 0.8 }
    t0.preAffine = held
    t0.postAffine = held
    flame.finalTransform = held
    // x' = a x + b y + c and y' = d x + e y + f, in the 3D kernel's rows.
    const drawn = {
      ...IDENTITY_AFFINE,
      a: 0.5,
      b: 0.1,
      d: 0.2,
      e: -0.1,
      f: 0.5,
      h: 0.3,
    }
    const form = fighterForm(flame)
    expect(form.transformsAt(1)[tid]!.preAffine).toEqual(drawn)
    expect(form.transformsAt(1)[tid]!.postAffine).toEqual(drawn)
    expect(form.finalTransform).toEqual(drawn)
  })
})

describe('the inflating morph', () => {
  const form = fighterForm(examples.goldenApollonianGasket)
  const source = Object.values(examples.goldenApollonianGasket.transforms)

  it('compiles the same shader at every morph', () => {
    const at0 = shape(form.transformsAt(0))
    for (const morph of [0.25, 0.5, 0.75, 1]) {
      expect(shape(form.transformsAt(morph))).toBe(at0)
    }
  })

  it('is the flat 2D card at 0 and the 3D twin at 1', () => {
    const weights = (morph: number) =>
      Object.values(form.transformsAt(morph)).map((t) =>
        Object.values(t.variations).map((v) => [v.type, v.weight]),
      )
    const original = source.map((t) =>
      Object.values(t.variations).map((v) => v.weight),
    )
    weights(0).forEach((vars, n) => {
      expect(vars).toEqual([
        ['sphericalVar', original[n]![0]],
        ['spherical3D', 0],
      ])
    })
    weights(1).forEach((vars, n) => {
      expect(vars).toEqual([
        ['sphericalVar', 0],
        ['spherical3D', original[n]![0]],
      ])
    })
  })

  it('scales the z row with the morph', () => {
    for (const morph of [0, 0.4, 1]) {
      for (const t of Object.values(form.transformsAt(morph))) {
        const pre = t.preAffine as Record<string, number>
        // A lifted 2D affine passes z through: its z row is (0, 0, 1, 0).
        expect([pre.i, pre.j, pre.k, pre.l]).toEqual([0, 0, morph, 0])
      }
    }
  })

  it('holds the morph to 0..1', () => {
    expect(shape(form.transformsAt(7))).toBe(shape(form.transformsAt(1)))
    const pre = Object.values(form.transformsAt(-3))[0]!.preAffine as Record<
      string,
      number
    >
    expect(pre.k).toBe(0)
  })

  it('names a twin so it never takes an id the transform uses', () => {
    const flame = flat2D(['sphericalVar'])
    const t0 = Object.values(flame.transforms)[0]!
    const variations = t0.variations as Record<string, unknown>
    variations.v_to3d = { type: 'juliaNVar', weight: 0.1, visible: true }
    const ids = Object.keys(
      Object.values(fighterForm(flame).transformsAt(0.5))[0]!.variations,
    )
    expect(ids).toEqual(['v', 'v_to3d2', 'v_to3d'])
  })
})

/**
 * Each variation the 3D renderer would swap for another type, as `from ->
 * to`: it resolves a type the way createFlameWgsl3D does, with the
 * transform's own mark.
 */
function swaps(transforms: Record<string, TransformFunction>) {
  const out = new Set<string>()
  for (const t of Object.values(transforms)) {
    for (const v of Object.values(t.variations)) {
      const to = resolveVariationType3D(v.type, t.from2D)
      if (to !== undefined && to !== v.type) out.add(`${v.type} -> ${to}`)
    }
  }
  return [...out]
}

const examples2D = Object.entries(examples)
  .filter(([, flame]) => flame.renderSettings.dimensions !== 3)
  .map(([id]) => id as keyof typeof examples)

describe('how the renderer draws a fighter', () => {
  it('marks every transform of a 2D fighter as from 2D, at every morph', () => {
    for (const id of examples2D) {
      for (const morph of [0, 0.5, 1]) {
        const marks = Object.values(
          fighterForm(examples[id]).transformsAt(morph),
        ).map((t) => t.from2D)
        expect(marks.every((mark) => mark === true)).toBe(true)
      }
    }
  })

  it.each(examples2D)(
    '%s draws its own 2D functions at morph 0, no 3D analog in their place',
    (id) => {
      const flat = fighterForm(examples[id]).transformsAt(0)
      expect(swaps(flat)).toEqual([])
      for (const t of Object.values(flat)) {
        for (const v of Object.values(t.variations)) {
          if (!v.visible || v.weight === 0) continue
          expect(Object.hasOwn(transformVariations, v.type)).toBe(true)
        }
      }
    },
  )

  const inflating = examples2D.filter(
    (id) => fighterForm(examples[id]).kind === 'inflates',
  )

  it.each(inflating)(
    '%s at morph 1 draws what the 3D renderer draws for it, the stem rule aside',
    (id) => {
      // Each weighted variation as [the function drawn, weight, params].
      type V =
        TransformFunction['variations'][keyof TransformFunction['variations']]
      const drawn = (variations: V[], fn: (type: string) => unknown) =>
        variations
          .filter((v) => v.visible && v.weight !== 0 && fn(v.type))
          .map((v) => JSON.stringify([fn(v.type), v.weight, v.params ?? null]))
          .sort()
      const fighter = Object.values(fighterForm(examples[id]).transformsAt(1))
      Object.values(examples[id].transforms).forEach((t, n) => {
        const got = drawn(Object.values(fighter[n]!.variations), (type) =>
          resolveVariationType3D(type, true),
        )
        const want = drawn(
          Object.values(t.variations),
          (type) =>
            resolveVariationType3D(type) &&
            (stemTwin3D(type) ?? resolveVariationType3D(type)),
        )
        expect(got).toEqual(want)
      })
    },
  )

  it('compiles each kept 2D function beside the analog it inflates into', () => {
    // example13 has curlVar, pdjVar and gaussianVar: its flat card draws the
    // three 2D functions, and it inflates into curl3D, pdj3D and gaussian3D,
    // the 3D forms the renderer draws a saved 2D flame with. One shader
    // serves every morph.
    const form = fighterForm(examples.example13)
    const weighted = (morph: number) =>
      new Set(
        Object.values(form.transformsAt(morph)).flatMap((t) =>
          Object.values(t.variations)
            .filter((v) => v.weight !== 0)
            .map((v) => resolveVariationType3D(v.type, t.from2D)),
        ),
      )
    const flat = weighted(0)
    const full = weighted(1)
    for (const [from, to] of [
      ['curlVar', 'curl3D'],
      ['pdjVar', 'pdj3D'],
      ['gaussianVar', 'gaussian3D'],
    ] as const) {
      expect([flat.has(from), flat.has(to)]).toEqual([true, false])
      expect([full.has(from), full.has(to)]).toEqual([false, true])
    }
    const wgsl = resolveIfsWgsl({ transforms: form.transformsAt(0), dims: 3 })
    expect(resolveIfsWgsl({ transforms: form.transformsAt(1), dims: 3 })).toBe(
      wgsl,
    )
    // The simple 3D variations compile unnamed; the rest keep their names.
    expect(wgsl).toMatch(/\bcurlVar\(/)
    expect(wgsl).toMatch(/\bpdj3D\(/)
    expect(form.converted).toEqual(
      expect.arrayContaining(['curlVar -> curl3D', 'pdjVar -> pdj3D']),
    )
  })

  it('leaves out what its 2D editor skips, a 3D type or an unknown name', () => {
    const form = fighterForm(flat2D(['juliaNVar', 'sphere3D', 'noSuchName']))
    const types = Object.values(form.transformsAt(0)).map((t) =>
      Object.values(t.variations).map((v) => v.type),
    )
    expect(types).toEqual([['juliaNVar'], [], []])
    expect(form.kept).toEqual(['juliaNVar'])
  })

  it('draws a 3D fighter as its own editor does, analogs included', () => {
    const flame = structuredClone(examples.example37)
    Object.values(Object.values(flame.transforms)[0]!.variations)[0]!.type =
      'bubbleVar'
    const transforms = fighterForm(flame).transformsAt(0)
    expect(Object.values(transforms).some((t) => t.from2D)).toBe(false)
    expect(swaps(transforms)).toEqual(['bubbleVar -> bubble3D'])
  })
})
