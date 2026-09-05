import { describe, expect, it } from 'vitest'
import { isSafeFlameEntityId, renderSettingsDefault, tryValidateFlame, validateFlame, validateFlame3D, } from './flameSchema'

describe('core flame schema validation', () => {
  it('validates a minimal valid flame descriptor', () => {
    const flame = {
      renderSettings: { ...renderSettingsDefault },
      transforms: {
        t1: {
          probability: 1,
          preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          color: { x: 0, y: 0 },
          variations: {
            v1: { type: 'linearVar', weight: 1 },
          },
        },
      },
    }

    const validated = validateFlame(flame)
    expect(validated).toBeDefined()
    expect(Object.keys(validated.transforms)).toContain('t1')
  })

  it('validates a 3D flame descriptor preserving 3D affines', () => {
    const flame3D = {
      renderSettings: { ...renderSettingsDefault, dimensions: 3 },
      transforms: {
        t1: {
          probability: 1,
          preAffine: {
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
          },
          postAffine: {
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
          },
          color: { x: 0, y: 0 },
          variations: {
            v1: { type: 'linear3D', weight: 1 },
          },
        },
      },
    }

    const validated = validateFlame3D(flame3D)
    expect(validated).toBeDefined()
    expect(validated.renderSettings?.dimensions).toBe(3)
  })

  it('rejects invalid or unsafe flame data gracefully with tryValidateFlame', () => {
    expect(tryValidateFlame(null)).toBeUndefined()
    expect(tryValidateFlame('not a flame')).toBeUndefined()
    expect(tryValidateFlame({ transforms: { __proto__: {} } })).toBeUndefined()
  })

  it('validates safe entity IDs', () => {
    expect(isSafeFlameEntityId('t_0_123')).toBe(true)
    expect(isSafeFlameEntityId('__proto__')).toBe(false)
    expect(isSafeFlameEntityId('constructor')).toBe(false)
    expect(isSafeFlameEntityId('')).toBe(false)
  })

  it('validates a flame with compositing layers', () => {
    const layeredFlame = {
      renderSettings: { ...renderSettingsDefault },
      transforms: {
        t1: {
          probability: 1,
          preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          color: { x: 0, y: 0 },
          variations: {
            v1: { type: 'linearVar', weight: 1 },
          },
        },
      },
      layers: [
        {
          id: 'layer_bg',
          name: 'Background Nebula',
          visible: true,
          opacity: 0.8,
          blendMode: 'screen',
          transforms: {
            t_bg: {
              probability: 1,
              preAffine: { a: 0.5, b: 0, c: 0, d: 0, e: 0.5, f: 0 },
              postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
              color: { x: 0.5, y: 0.5 },
              variations: {
                v_bg: { type: 'sphericalVar', weight: 1 },
              },
            },
          },
        },
      ],
    }

    const validated = validateFlame(layeredFlame)
    expect(validated.layers).toBeDefined()
    expect(validated.layers).toHaveLength(1)
    expect(validated.layers?.[0]?.blendMode).toBe('screen')
    expect(validated.layers?.[0]?.opacity).toBe(0.8)
  })
})
