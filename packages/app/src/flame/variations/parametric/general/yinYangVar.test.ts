import { vec2f } from 'typegpu/data'
import { describe, expect, it } from 'vitest'
import { extractFlameUniforms } from '../../../transformFunction'
import { getParamsEditor } from '../../utils'
import { whorlVar } from './whorlVar'
import { yinYangVar } from './yinYangVar'
import type { VariationInfo } from '../../simple/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const varInfo: VariationInfo = {
  weight: 1,
  affineCoefs: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
}

describe('yinYangVar', () => {
  it('has expected default parameters with outside = 0', () => {
    expect(yinYangVar.paramDefaults).toEqual({
      radius: 0.5,
      ang1: 0.0,
      ang2: 0.0,
      dual_t: 1,
      outside: 0,
    })
  })

  it('produces finite output at representative sample coordinates', () => {
    const samples: [number, number][] = [
      [0, 0],
      [0.5, 0.5],
      [-0.5, 0.5],
      [1.0, -1.0],
      [0.0, 0.5],
      [-0.5, -0.5],
      [2.0, 2.0],
    ]

    for (const [x, y] of samples) {
      const out = yinYangVar.fn(vec2f(x, y), varInfo, yinYangVar.paramDefaults)
      expect(Number.isFinite(out.x), `x=${x} y=${y} -> out.x`).toBe(true)
      expect(Number.isFinite(out.y), `x=${x} y=${y} -> out.y`).toBe(true)
    }
  })

  it('correctly toggles rotation behavior with the outside parameter', () => {
    const pos = vec2f(0.3, 0.4)
    const out0 = yinYangVar.fn(pos, varInfo, {
      ...yinYangVar.paramDefaults,
      outside: 0,
    })
    const out1 = yinYangVar.fn(pos, varInfo, {
      ...yinYangVar.paramDefaults,
      outside: 1,
    })

    expect(Number.isFinite(out0.x)).toBe(true)
    expect(Number.isFinite(out0.y)).toBe(true)
    expect(Number.isFinite(out1.x)).toBe(true)
    expect(Number.isFinite(out1.y)).toBe(true)
    // outside=1 inverts the rotation direction compared to outside=0
    expect(out0.x).not.toBe(out1.x)
  })
})

describe('whorlVar division safety', () => {
  it('produces finite output even at the singularity boundary r == w', () => {
    // whorlVar defaults w = 1. At r == 1 (e.g. (1, 0) or (0, 1)), (w - r) == 0.
    // safeDenom prevents division by zero / NaN.
    const singularPoints: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [Math.SQRT1_2, Math.SQRT1_2],
    ]

    for (const [x, y] of singularPoints) {
      const out = whorlVar.fn(vec2f(x, y), varInfo, whorlVar.paramDefaults)
      expect(Number.isFinite(out.x), `x=${x} y=${y} -> out.x`).toBe(true)
      expect(Number.isFinite(out.y), `x=${x} y=${y} -> out.y`).toBe(true)
    }
  })
})

describe('getParamsEditor with partial params', () => {
  it('merges default parameters when params object is incomplete or missing keys', () => {
    const incompleteDescriptor = {
      type: 'yinYangVar',
      params: { radius: 0.8 },
    }

    const editor = getParamsEditor(incompleteDescriptor)
    expect(editor.value).toBeDefined()
    expect(editor.value).toEqual({
      radius: 0.8,
      ang1: 0.0,
      ang2: 0.0,
      dual_t: 1,
      outside: 0,
    })
  })
})

describe('extractFlameUniforms NaN sanitization', () => {
  it('sanitizes NaN and non-finite numbers in variation parameters', () => {
    const flame = {
      transforms: {
        t1: {
          probability: 1,
          color: { x: 0.5, y: 0.5 },
          colorSpeed: 0.4,
          visible: true,
          preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          variations: {
            v1: {
              type: 'yinYangVar',
              weight: NaN,
              visible: true,
              params: {
                radius: NaN,
                outside: Infinity,
              },
            },
          },
        },
      },
    } as unknown as FlameDescriptor

    const uniforms = extractFlameUniforms(flame)
    const t1 = (uniforms as Record<string, unknown>).flamet1 as {
      variationv1: {
        weight: number
        params: { radius: number; outside: number }
      }
    }

    expect(Number.isFinite(t1.variationv1.weight)).toBe(true)
    expect(t1.variationv1.weight).toBe(1) // sanitized fallback from NaN
    expect(Number.isFinite(t1.variationv1.params.radius)).toBe(true)
    expect(t1.variationv1.params.radius).toBe(0.5) // default fallback from NaN
    expect(Number.isFinite(t1.variationv1.params.outside)).toBe(true)
    expect(t1.variationv1.params.outside).toBe(0) // default fallback from Infinity
  })
})
