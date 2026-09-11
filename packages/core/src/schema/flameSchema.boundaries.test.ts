// Boundary table for validateFlame: each limit must accept its edge value
// unchanged and reject the value just past it with an error, never clamp it.
import { describe, expect, it } from 'vitest'
import { MAX_FLAME_ENTITY_ID_LENGTH, MAX_FLAME_TRANSFORMS, MAX_FLAME_VARIATIONS, MAX_VARIATIONS_PER_TRANSFORM, renderSettingsDefault, validateFlameWithErrors, } from './flameSchema'

const IDENTITY_2D = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }

function transform(variationCount = 1) {
  return {
    probability: 1,
    preAffine: { ...IDENTITY_2D },
    postAffine: { ...IDENTITY_2D },
    color: { x: 0, y: 0 },
    variations: Object.fromEntries(
      Array.from({ length: variationCount }, (_, i) => [
        `v${i}`,
        { type: 'linearVar', weight: 1 },
      ]),
    ),
  }
}

function flame(
  opts: { transforms?: number; variations?: number; ids?: string[] } = {},
) {
  const ids =
    opts.ids ?? Array.from({ length: opts.transforms ?? 1 }, (_, i) => `t${i}`)
  return {
    renderSettings: structuredClone(renderSettingsDefault),
    transforms: Object.fromEntries(
      ids.map((id) => [id, transform(opts.variations ?? 1)]),
    ),
  } as Record<string, unknown> & {
    renderSettings: Record<string, unknown>
  }
}

function validate(data: unknown) {
  const errors: string[] = []
  const out = validateFlameWithErrors(data, (e) => errors.push(e))
  return { out, errors }
}

type Row = {
  field: string
  set: (f: ReturnType<typeof flame>, value: unknown) => void
  get: (out: NonNullable<ReturnType<typeof validate>['out']>) => unknown
  accept: unknown[]
  reject: unknown[]
}

const rs = (key: string): Pick<Row, 'set' | 'get'> => ({
  set: (f, value) => {
    f.renderSettings[key] = value
  },
  get: (out) => (out.renderSettings as Record<string, unknown>)[key],
})

const ROWS: Row[] = [
  {
    field: 'exposure',
    ...rs('exposure'),
    accept: [-8, 8],
    reject: [-8.001, 8.001],
  },
  {
    field: 'skipIters',
    ...rs('skipIters'),
    accept: [0, 30],
    reject: [-1, 31, 2.5],
  },
  {
    field: 'plotsPerChain',
    ...rs('plotsPerChain'),
    accept: [1, 64],
    reject: [0, 65, 1.5],
  },
  {
    field: 'autoExposure3DStrength',
    ...rs('autoExposure3DStrength'),
    accept: [0, 3],
    reject: [-0.01, 3.01],
  },
  {
    field: 'vibrancy',
    ...rs('vibrancy'),
    accept: [0, 3],
    reject: [-0.01, 3.01],
  },
  {
    field: 'dimensions',
    ...rs('dimensions'),
    accept: [2, 3],
    reject: [1, 4, 2.5],
  },
  {
    field: 'backgroundColor',
    ...rs('backgroundColor'),
    accept: [
      [0, 0, 0],
      [1, 1, 1],
    ],
    reject: [
      [1.01, 0, 0],
      [0, -0.01, 0],
    ],
  },
  {
    field: 'camera.zoom',
    set: (f, value) => {
      const camera = (f.renderSettings.camera ?? {}) as Record<string, unknown>
      f.renderSettings.camera = { ...camera, zoom: value }
    },
    get: (out) => (out.renderSettings.camera as { zoom: number }).zoom,
    accept: [0.01, 500],
    reject: [0.0099, 500.01],
  },
]

describe('validateFlame boundaries', () => {
  for (const row of ROWS) {
    it.each(row.accept.map((v) => [JSON.stringify(v), v]))(
      `${row.field} accepts its edge value %s unchanged`,
      (_label, value) => {
        const f = flame()
        row.set(f, value)
        const { out, errors } = validate(f)
        expect(errors).toEqual([])
        expect(row.get(out!)).toEqual(value)
      },
    )
    it.each(row.reject.map((v) => [JSON.stringify(v), v]))(
      `${row.field} rejects %s with an error instead of clamping`,
      (_label, value) => {
        const f = flame()
        row.set(f, value)
        const { out, errors } = validate(f)
        expect(out).toBeUndefined()
        expect(errors.length).toBeGreaterThan(0)
      },
    )
  }
})

describe('validateFlame metadata limits', () => {
  it('accepts a 255-character author and rejects 256', () => {
    const ok = flame()
    ok.metadata = { author: 'a'.repeat(255) }
    expect(validate(ok).errors).toEqual([])
    const bad = flame()
    bad.metadata = { author: 'a'.repeat(256) }
    expect(validate(bad).out).toBeUndefined()
  })

  it('accepts a 10-character version and rejects an empty or 11-character one', () => {
    const ok = flame()
    ok.version = '1234567890'
    expect(validate(ok).errors).toEqual([])
    for (const version of ['', '12345678901']) {
      const bad = flame()
      bad.version = version
      expect(validate(bad).out).toBeUndefined()
    }
  })
})

describe('validateFlame graph limits', () => {
  it(`accepts ${MAX_FLAME_TRANSFORMS} transforms and names the limit at one more`, () => {
    expect(
      validate(flame({ transforms: MAX_FLAME_TRANSFORMS })).errors,
    ).toEqual([])
    expect(
      validate(flame({ transforms: MAX_FLAME_TRANSFORMS + 1 })).errors,
    ).toEqual([
      `a flame may contain at most ${MAX_FLAME_TRANSFORMS} transforms`,
    ])
  })

  it(`accepts ${MAX_VARIATIONS_PER_TRANSFORM} variations in a transform and names the limit at one more`, () => {
    expect(
      validate(flame({ variations: MAX_VARIATIONS_PER_TRANSFORM })).errors,
    ).toEqual([])
    expect(
      validate(flame({ variations: MAX_VARIATIONS_PER_TRANSFORM + 1 })).errors,
    ).toEqual([
      `a transform may contain at most ${MAX_VARIATIONS_PER_TRANSFORM} variations`,
    ])
  })

  it(`caps the whole flame at ${MAX_FLAME_VARIATIONS} variations`, () => {
    // 16 x 32 = 512 exactly; 17 x 31 = 527 stays under both per-part caps.
    expect(validate(flame({ transforms: 16, variations: 32 })).errors).toEqual(
      [],
    )
    expect(validate(flame({ transforms: 17, variations: 31 })).errors).toEqual([
      `a flame may contain at most ${MAX_FLAME_VARIATIONS} variations`,
    ])
  })
})

describe('validateFlame entity ids', () => {
  it(`accepts an id of ${MAX_FLAME_ENTITY_ID_LENGTH} safe characters`, () => {
    expect(
      validate(flame({ ids: ['a'.repeat(MAX_FLAME_ENTITY_ID_LENGTH)] })).errors,
    ).toEqual([])
  })

  it.each([
    ['one character too long', 'a'.repeat(MAX_FLAME_ENTITY_ID_LENGTH + 1)],
    ['a prototype key', '__proto__'],
    ['a hyphen', 'a-b'],
    ['empty', ''],
  ])('rejects an id that is %s', (_label, id) => {
    const { out, errors } = validate(flame({ ids: [id] }))
    expect(out).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
  })
})
