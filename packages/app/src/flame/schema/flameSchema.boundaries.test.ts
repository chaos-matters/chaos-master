import { describe, expect, it } from 'vitest'
import { isSafeFlameEntityId, MAX_FLAME_TRANSFORMS, MAX_FLAME_VARIATIONS, MAX_VARIATIONS_PER_TRANSFORM, renderSettingsDefault, tryValidateFlame, validateFlame, validateFlame3D, validateFlameWithErrors, } from './flameSchema'

// Build a minimal valid 2D flame with render-settings overrides layered on the
// known-good defaults, so each test isolates a single field.
function flameWith(overrides: Record<string, unknown>): unknown {
  return {
    transforms: {},
    renderSettings: { ...renderSettingsDefault, ...overrides },
  }
}

const identity = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }

function transformWithVariations(transformIndex: number, count: number) {
  return {
    probability: 1,
    preAffine: identity,
    postAffine: identity,
    color: { x: 0, y: 0 },
    variations: Object.fromEntries(
      Array.from({ length: count }, (_, variationIndex) => [
        `v_${transformIndex}_${variationIndex}`,
        { type: 'linearVar', weight: 1 },
      ]),
    ),
  }
}

function flameGraph(counts: number[]) {
  return {
    transforms: Object.fromEntries(
      counts.map((variationCount, transformIndex) => [
        `t_${transformIndex}`,
        transformWithVariations(transformIndex, variationCount),
      ]),
    ),
  }
}

describe('flame schema — render-settings boundaries', () => {
  it('accepts in-range render settings', () => {
    expect(() =>
      validateFlame(
        flameWith({ exposure: 8, vibrancy: 3, contrast: 20, gamma: 8 }),
      ),
    ).not.toThrow()
  })

  // Each entry pushes exactly one field outside its documented range.
  const outOfRange: [string, Record<string, unknown>][] = [
    ['exposure above max (8)', { exposure: 9 }],
    ['exposure below min (-8)', { exposure: -9 }],
    ['vibrancy above max (3)', { vibrancy: 3.1 }],
    ['vibrancy below min (0)', { vibrancy: -0.1 }],
    ['contrast above max (20)', { contrast: 21 }],
    ['contrast below min (0.01)', { contrast: 0 }],
    ['gamma above max (8)', { gamma: 8.5 }],
    ['gamma below min (0.1)', { gamma: 0.05 }],
    ['skipIters above max (30)', { skipIters: 31 }],
    ['skipIters non-integer', { skipIters: 2.5 }],
    ['paletteMode above max (1)', { paletteMode: 2 }],
    ['paletteMode non-integer', { paletteMode: 0.5 }],
  ]

  for (const [label, override] of outOfRange) {
    it(`rejects ${label}`, () => {
      expect(tryValidateFlame(flameWith(override))).toBeUndefined()
      expect(() => validateFlame(flameWith(override))).toThrow()
    })
  }
})

describe('flame schema — transform record', () => {
  it('accepts a flame with zero transforms (documents current behavior)', () => {
    // There is no minEntries on the transform record, so an empty flame
    // validates; the emptiness only surfaces later in the render pipeline.
    expect(tryValidateFlame({ transforms: {} })).toBeDefined()
  })

  it('accepts the transform and per-transform variation boundaries', () => {
    expect(
      tryValidateFlame(flameGraph(Array(MAX_FLAME_TRANSFORMS).fill(1))),
    ).toBeDefined()
    expect(
      tryValidateFlame(flameGraph([MAX_VARIATIONS_PER_TRANSFORM])),
    ).toBeDefined()
  })

  it('rejects one transform or per-transform variation over the boundary', () => {
    expect(
      tryValidateFlame(flameGraph(Array(MAX_FLAME_TRANSFORMS + 1).fill(1))),
    ).toBeUndefined()
    expect(
      tryValidateFlame(flameGraph([MAX_VARIATIONS_PER_TRANSFORM + 1])),
    ).toBeUndefined()
  })

  it('enforces the total variation budget independently of the local cap', () => {
    const fullTransforms = Math.floor(
      MAX_FLAME_VARIATIONS / MAX_VARIATIONS_PER_TRANSFORM,
    )
    const remainder = MAX_FLAME_VARIATIONS % MAX_VARIATIONS_PER_TRANSFORM
    const atLimit = Array(fullTransforms).fill(MAX_VARIATIONS_PER_TRANSFORM)
    if (remainder > 0) atLimit.push(remainder)

    expect(tryValidateFlame(flameGraph(atLimit))).toBeDefined()
    expect(tryValidateFlame(flameGraph([...atLimit, 1]))).toBeUndefined()
  })

  it('applies the graph cap through every public validation path', () => {
    const oversized = flameGraph(Array(MAX_FLAME_TRANSFORMS + 1).fill(0))
    const errors: string[] = []

    expect(() => validateFlame(oversized)).toThrow(/at most/)
    expect(() => validateFlame3D(oversized)).toThrow(/at most/)
    expect(
      validateFlameWithErrors(oversized, (error) => errors.push(error)),
    ).toBe(undefined)
    expect(errors[0]).toMatch(/at most/)
  })

  it('accepts current UUID and symmetry ids, but rejects hostile keys', () => {
    expect(isSafeFlameEntityId('d2523f69_dd2d_49cb_b14f_d9448e0bfb31')).toBe(
      true,
    )
    expect(isSafeFlameEntityId('_sym__safe_123')).toBe(true)
    expect(isSafeFlameEntityId('__proto__')).toBe(false)
    expect(isSafeFlameEntityId('constructor')).toBe(false)
    expect(isSafeFlameEntityId('unsafe-id')).toBe(false)

    const transform = transformWithVariations(0, 1)
    expect(
      tryValidateFlame({
        transforms: Object.fromEntries([['__proto__', transform]]),
      }),
    ).toBeUndefined()
    expect(
      tryValidateFlame({
        transforms: {
          t_safe: {
            ...transform,
            variations: Object.fromEntries([
              ['constructor', { type: 'linearVar', weight: 1 }],
            ]),
          },
        },
      }),
    ).toBeUndefined()
  })

  it('rejects records with a hostile prototype even without own hostile keys', () => {
    const transforms = Object.create({
      inherited: transformWithVariations(0, 1),
    })
    expect(tryValidateFlame({ transforms })).toBeUndefined()

    const hostileTransform = Object.assign(
      Object.create({ inherited: true }),
      transformWithVariations(0, 1),
    )
    expect(
      tryValidateFlame({ transforms: { t_safe: hostileTransform } }),
    ).toBeUndefined()

    const transform = transformWithVariations(0, 1)
    transform.variations.v_0_0 = Object.assign(
      Object.create({ inherited: true }),
      transform.variations.v_0_0,
    )
    expect(
      tryValidateFlame({ transforms: { t_safe: transform } }),
    ).toBeUndefined()
  })
})
