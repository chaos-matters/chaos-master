import { describe, expect, it } from 'vitest'
import { MAX_VARIATIONS_PER_TRANSFORM } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { GLIDE_DURATIONS } from './durations'
import { planGlide } from './plan'
import { sampleGlide } from './sample'
import { makeFlame, preAffineDeterminant, probabilitySumOf } from './testUtils'
import { isGlideRefusal } from './types'
import type { GlideOptions, GlidePlan } from './types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

function plan(
  a: FlameDescriptor,
  b: FlameDescriptor,
  options?: GlideOptions,
): GlidePlan {
  const result = planGlide(a, b, options)
  if (isGlideRefusal(result)) {
    throw new Error(`expected a plan, got a refusal: ${result.reason}`)
  }
  return result
}

const SAMPLE_TS = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]

describe('planGlide — endpoints', () => {
  it('lands on exactly flame B', () => {
    const a = makeFlame({ transforms: { one: { probability: 0.4 } } })
    const b = makeFlame({
      transforms: { one: { probability: 0.9, preAffine: { c: 2 } } },
    })
    expect(plan(a, b).settle).toEqual(b)
  })

  it('starts on flame A when A is already normalised', () => {
    const a = makeFlame({
      transforms: { one: { probability: 0.5 }, two: { probability: 0.5 } },
    })
    const b = makeFlame({
      transforms: {
        one: { probability: 0.25 },
        two: { probability: 0.75, preAffine: { c: 1 } },
      },
    })
    const p = plan(a, b)
    expect(sampleGlide(p, 0)).toEqual(a)
    expect(sampleGlide(p, 1)).toEqual(b)
  })

  it('keeps the settle exact even when the probabilities do not sum to 1', () => {
    const a = makeFlame({ transforms: { one: { probability: 3 } } })
    const b = makeFlame({
      transforms: { one: { probability: 7, preAffine: { c: 1 } } },
    })
    const p = plan(a, b)
    expect(p.settle).toEqual(b)
    expect(p.notes).toContainEqual({
      kind: 'probabilityNormalised',
      sumA: 3,
      sumB: 7,
    })
  })

  it('plans an empty glide for two identical flames rather than dividing by zero', () => {
    const a = makeFlame({ transforms: { one: {} } })
    const p = plan(a, deepClone(a))
    expect(p.changeClass).toBe('none')
    expect(p.channels).toEqual([])
    expect(p.durationMs).toBe(0)
    expect(p.frames).toBeGreaterThanOrEqual(2)
    expect(sampleGlide(p, 0.5)).toEqual(a)
  })
})

describe('planGlide — the Σp invariant', () => {
  it('keeps the probabilities summing to 1 at every sample', () => {
    const a = makeFlame({
      transforms: {
        keep: { probability: 2 },
        leaving: { probability: 1, preAffine: { c: -1 } },
      },
    })
    const b = makeFlame({
      transforms: {
        keep: { probability: 1 },
        arriving: { probability: 3, preAffine: { c: 5, a: 2 } },
      },
    })
    const p = plan(a, b)
    for (const t of SAMPLE_TS) {
      expect(probabilitySumOf(sampleGlide(p, t))).toBeCloseTo(1, 9)
    }
  })

  it('holds across a hidden transform, which contributes nothing at either end', () => {
    const a = makeFlame({
      transforms: {
        one: { probability: 1 },
        hidden: { probability: 5, visible: false },
      },
    })
    const b = makeFlame({
      transforms: {
        one: { probability: 1 },
        hidden: { probability: 5, visible: true, preAffine: { c: 1 } },
      },
    })
    const p = plan(a, b)
    for (const t of SAMPLE_TS) {
      expect(probabilitySumOf(sampleGlide(p, t))).toBeCloseTo(1, 9)
    }
  })

  it('eases every probability channel with the same curve', () => {
    const a = makeFlame({
      transforms: {
        keep: { probability: 1 },
        leaving: {
          probability: 1,
          preAffine: { a: 4, c: 9 },
          color: { x: 0, y: 0 },
          variations: { v: { type: 'linearVar', weight: 1 } },
        },
      },
    })
    const b = makeFlame({
      transforms: {
        keep: { probability: 1 },
        arriving: {
          probability: 1,
          preAffine: { a: -3, c: -8 },
          color: { x: 1, y: 1 },
          variations: { v: { type: 'bubbleVar', weight: 1 } },
        },
      },
    })
    const curves = new Set(
      plan(a, b)
        .channels.filter(
          (channel) =>
            channel.kind === 'scalar' && channel.path.endsWith('.probability'),
        )
        .map((channel) => (channel.kind === 'scalar' ? channel.easing : '')),
    )
    expect(curves.size).toBe(1)
  })
})

describe('planGlide — structure', () => {
  it('fades a removed transform out and never loses it from the union', () => {
    const a = makeFlame({
      transforms: { keep: { probability: 0.5 }, gone: { probability: 0.5 } },
    })
    const b = makeFlame({ transforms: { keep: { probability: 1 } } })
    const p = plan(a, b)
    expect(Object.keys(p.base.transforms).sort()).toEqual(['gone', 'keep'])
    const mid = sampleGlide(p, 0.5) as unknown as {
      transforms: Record<string, { probability: number }>
    }
    expect(mid.transforms.gone!.probability).toBeGreaterThan(0)
    expect(mid.transforms.gone!.probability).toBeLessThan(0.5)
    const end = sampleGlide(p, 1) as unknown as {
      transforms: Record<string, { probability: number }>
    }
    expect(end.transforms.gone!.probability).toBe(0)
    expect(p.notes).toContainEqual({
      kind: 'structural',
      entity: 'gone',
      change: 'transformRemoved',
    })
    // Five transforms into three ends with exactly three, not five padded
    // with duplicates of the last — the prior art's worst bug.
    expect(Object.keys(p.settle.transforms)).toEqual(['keep'])
  })

  it('grows a new transform from probability zero at B’s shape', () => {
    const a = makeFlame({ transforms: { one: { probability: 1 } } })
    const b = makeFlame({
      transforms: {
        one: { probability: 0.5 },
        fresh: { probability: 0.5, preAffine: { a: 3, c: 7 } },
      },
    })
    const p = plan(a, b)
    const base = p.base as unknown as {
      transforms: Record<
        string,
        { probability: number; preAffine: Record<string, number> }
      >
    }
    expect(base.transforms.fresh!.probability).toBe(0)
    expect(base.transforms.fresh!.preAffine.a).toBe(3)
    expect(base.transforms.fresh!.preAffine.c).toBe(7)
    expect(p.notes).toContainEqual({
      kind: 'structural',
      entity: 'fresh',
      change: 'transformAdded',
    })
  })

  it('crossfades a variation type change and never shows a third type', () => {
    const a = makeFlame({
      transforms: {
        one: { variations: { v: { type: 'linearVar', weight: 1 } } },
      },
    })
    const b = makeFlame({
      transforms: {
        one: { variations: { v: { type: 'swirlVar', weight: 1 } } },
      },
    })
    const p = plan(a, b)
    expect(p.notes).toContainEqual({
      kind: 'structural',
      entity: 'one.v',
      change: 'variationTypeChanged',
    })
    for (const t of SAMPLE_TS) {
      const variations = (
        sampleGlide(p, t) as unknown as {
          transforms: Record<
            string,
            { variations: Record<string, { type: string; weight: number }> }
          >
        }
      ).transforms.one!.variations
      const types = new Set(
        Object.values(variations).map((variation) => variation.type),
      )
      expect([...types].sort()).toEqual(['linearVar', 'swirlVar'])
    }
    const mid = (
      sampleGlide(p, 0.5) as unknown as {
        transforms: Record<
          string,
          { variations: Record<string, { type: string; weight: number }> }
        >
      }
    ).transforms.one!.variations
    const weights = Object.values(mid).map((variation) => variation.weight)
    expect(weights.every((weight) => weight > 0 && weight < 1)).toBe(true)
  })

  it('fades an added and a removed variation by weight', () => {
    const a = makeFlame({
      transforms: {
        one: { variations: { keep: { type: 'linearVar', weight: 1 } } },
      },
    })
    const b = makeFlame({
      transforms: {
        one: {
          variations: {
            keep: { type: 'linearVar', weight: 1 },
            extra: { type: 'swirlVar', weight: 0.6 },
          },
        },
      },
    })
    const p = plan(a, b)
    const base = p.base as unknown as {
      transforms: Record<
        string,
        { variations: Record<string, { weight: number }> }
      >
    }
    expect(base.transforms.one!.variations.extra!.weight).toBe(0)
    const end = sampleGlide(p, 1) as unknown as {
      transforms: Record<
        string,
        { variations: Record<string, { weight: number }> }
      >
    }
    expect(end.transforms.one!.variations.extra!.weight).toBeCloseTo(0.6, 12)
    expect(p.notes).toContainEqual({
      kind: 'structural',
      entity: 'one.extra',
      change: 'variationAdded',
    })
  })

  it('interpolates a variation parameter', () => {
    const a = makeFlame({
      transforms: {
        one: {
          variations: {
            v: { type: 'juliaNVar', weight: 1, params: { power: 2, dist: 1 } },
          },
        },
      },
    })
    const b = makeFlame({
      transforms: {
        one: {
          variations: {
            v: { type: 'juliaNVar', weight: 1, params: { power: 6, dist: 1 } },
          },
        },
      },
    })
    const p = plan(a, b)
    const mid = sampleGlide(p, 0.5) as unknown as {
      transforms: Record<
        string,
        { variations: Record<string, { params: Record<string, number> }> }
      >
    }
    expect(mid.transforms.one!.variations.v!.params.power).toBeGreaterThan(2)
    expect(mid.transforms.one!.variations.v!.params.power).toBeLessThan(6)
  })

  it('mints a fresh id when a new transform collides with a kept one', () => {
    // A's `x` pairs with B's `y` by similarity, and B also carries an
    // unmatched `x`: the union cannot use that key twice.
    const a = makeFlame({
      transforms: { x: { preAffine: { c: 0.5 }, probability: 1 } },
    })
    const b = makeFlame({
      transforms: {
        y: { preAffine: { c: 0.5 }, probability: 0.5 },
        x: { preAffine: { c: -9 }, probability: 0.5 },
      },
    })
    const p = plan(a, b)
    const ids = Object.keys(p.base.transforms)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(ids).toContain('x')
  })
})

describe('planGlide — the final transform', () => {
  it('relaxes to the identity when only A has one, and the settle removes it', () => {
    const a = makeFlame({
      transforms: { one: {} },
      finalTransform: { a: 2, c: 1 },
    })
    const b = makeFlame({ transforms: { one: {} } })
    const p = plan(a, b)
    expect(p.settle.finalTransform).toBeUndefined()
    expect(sampleGlide(p, 1).finalTransform).toEqual({
      a: 1,
      b: 0,
      c: 0,
      d: 0,
      e: 1,
      f: 0,
    })
    expect(p.notes).toContainEqual({
      kind: 'snapAtSettle',
      path: 'finalTransform',
      reason:
        'the target has no final transform; the glide relaxes to the identity and the settle removes it',
    })
  })

  it('grows from the identity when only B has one', () => {
    const a = makeFlame({ transforms: { one: {} } })
    const b = makeFlame({
      transforms: { one: {} },
      finalTransform: { a: 2, c: 1 },
    })
    const p = plan(a, b)
    expect(p.base.finalTransform).toEqual({
      a: 1,
      b: 0,
      c: 0,
      d: 0,
      e: 1,
      f: 0,
    })
    expect(sampleGlide(p, 1).finalTransform!.a).toBeCloseTo(2, 12)
    expect(sampleGlide(p, 1).finalTransform!.c).toBeCloseTo(1, 12)
  })
})

describe('planGlide — camera and render settings', () => {
  it('moves the zoom in log space and the rotation on the shortest arc', () => {
    const a = makeFlame({
      transforms: { one: {} },
      renderSettings: {
        camera: { zoom: 1, position: [0, 0], rotation: (359 * Math.PI) / 180 },
      },
    })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: {
        camera: { zoom: 100, position: [2, -3], rotation: (1 * Math.PI) / 180 },
      },
    })
    const p = plan(a, b)
    expect(p.changeClass).toBe('camera')
    expect(p.durationMs).toBeGreaterThanOrEqual(GLIDE_DURATIONS.camera)
    const mid = sampleGlide(p, 0.5).renderSettings.camera
    expect(mid.zoom).toBeCloseTo(10, 6)
    // Through zero, not the long way round through π: halfway between 359°
    // and 1° is 0°, which as a number is 2π here.
    expect(Math.abs(Math.sin(mid.rotation))).toBeLessThan(0.02)
    expect(Math.cos(mid.rotation)).toBeGreaterThan(0.99)
    expect(sampleGlide(p, 1).renderSettings.camera.rotation).toBeCloseTo(
      (1 * Math.PI) / 180,
      12,
    )
    expect(sampleGlide(p, 1).renderSettings.camera.position).toEqual([2, -3])
  })

  it('interpolates the graded render settings and holds the enums', () => {
    const a = makeFlame({
      transforms: { one: {} },
      renderSettings: { gamma: 2, exposure: 0, drawMode: 'light' },
    })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: { gamma: 4, exposure: 1, drawMode: 'paint' },
    })
    const p = plan(a, b)
    const mid = sampleGlide(p, 0.5).renderSettings
    expect(mid.gamma).toBeGreaterThan(2)
    expect(mid.gamma).toBeLessThan(4)
    expect(mid.drawMode).toBe('light')
    expect(sampleGlide(p, 1).renderSettings.drawMode).toBe('paint')
  })

  it('notes a render setting that has no timeline sink instead of animating into silence', () => {
    const a = makeFlame({
      transforms: { one: {} },
      renderSettings: { plotsPerChain: 16, paletteMode: 0 },
    })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: { plotsPerChain: 4, paletteMode: 1 },
    })
    const p = plan(a, b)
    const snapped = p.notes
      .filter((note) => note.kind === 'snapAtSettle')
      .map((note) => (note.kind === 'snapAtSettle' ? note.path : ''))
    expect(snapped).toContain('plotsPerChain')
    expect(snapped).toContain('paletteMode')
    expect(
      p.channels.some(
        (channel) =>
          channel.kind !== 'affine' &&
          (channel.path === 'plotsPerChain' || channel.path === 'paletteMode'),
      ),
    ).toBe(false)
  })

  it('interpolates the background colour component-wise', () => {
    const a = makeFlame({
      transforms: { one: {} },
      renderSettings: { backgroundColor: [0, 0, 0] },
    })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: { backgroundColor: [1, 0.5, 0] },
    })
    const p = plan(a, b)
    expect(sampleGlide(p, 1).renderSettings.backgroundColor).toEqual([
      1, 0.5, 0,
    ])
    const mid = sampleGlide(p, 0.5).renderSettings.backgroundColor!
    expect(mid[0]).toBeGreaterThan(0)
    expect(mid[0]).toBeLessThan(1)
  })
})

describe('planGlide — durations and classes', () => {
  it('picks the longest applicable class', () => {
    const one = makeFlame({ transforms: { a: {} } })
    const scalar = makeFlame({
      transforms: { a: {} },
      renderSettings: { gamma: 3 },
    })
    expect(plan(one, scalar).changeClass).toBe('scalar')

    const added = makeFlame({
      transforms: { a: { probability: 0.5 }, b: { probability: 0.5 } },
    })
    expect(plan(one, added).changeClass).toBe('transform')

    const three = makeFlame({
      transforms: { a: {}, b: {}, c: {}, d: {} },
    })
    const threePlusOne = makeFlame({
      transforms: { a: {}, b: {}, c: {}, d: {}, e: {} },
    })
    expect(plan(three, threePlusOne).changeClass).toBe('transform')

    // A whole new cast: nothing pairs, so everything fades.
    const cast = makeFlame({
      transforms: {
        a: { preAffine: { a: 1 }, variations: { v: { type: 'linearVar' } } },
        b: { preAffine: { a: 2 }, variations: { v: { type: 'linearVar' } } },
        c: { preAffine: { a: 3 }, variations: { v: { type: 'linearVar' } } },
      },
    })
    const replacement = makeFlame({
      transforms: {
        x: {
          preAffine: { a: -9, c: 40 },
          postAffine: { a: -6, b: 7, c: 40, d: 3, e: -4, f: 20 },
          color: { x: 0, y: 1 },
          variations: { v: { type: 'bubbleVar' } },
        },
        y: {
          preAffine: { a: -8, c: 50 },
          postAffine: { a: -5, b: 8, c: 50, d: 4, e: -3, f: 30 },
          color: { x: 0, y: 1 },
          variations: { v: { type: 'crossVar' } },
        },
        z: {
          preAffine: { a: -7, c: 60 },
          postAffine: { a: -4, b: 9, c: 60, d: 5, e: -2, f: 40 },
          color: { x: 0, y: 1 },
          variations: { v: { type: 'popcornVar' } },
        },
      },
    })
    expect(plan(cast, replacement).changeClass).toBe('whole')
  })

  it('honours an explicit duration and clamps it', () => {
    const a = makeFlame({ transforms: { one: {} } })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: { gamma: 3 },
    })
    expect(plan(a, b, { durationMs: 1234 }).durationMs).toBe(1234)
    expect(plan(a, b, { durationMs: 999_999 }).durationMs).toBe(5000)
  })

  it('takes longer at a higher quality tier', () => {
    const a = makeFlame({ transforms: { one: {} } })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: { gamma: 3 },
    })
    const responsive = plan(a, b, { quality: 'responsive' })
    const full = plan(a, b, { quality: 'full' })
    expect(full.durationMs).toBeGreaterThan(responsive.durationMs)
    expect(full.quality.accumulationScale).toBe(1)
    expect(responsive.quality.accumulationScale).toBeCloseTo(0.35, 12)
  })

  it('counts frames at the configured fps, not at whatever the renderer manages', () => {
    const a = makeFlame({ transforms: { one: {} } })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: { gamma: 3 },
    })
    expect(plan(a, b, { durationMs: 1000, fps: 24 }).frames).toBe(24)
    expect(plan(a, b, { durationMs: 1000, fps: 60 }).frames).toBe(60)
  })
})

describe('planGlide — refusals', () => {
  it('refuses a 2D/3D pairing', () => {
    const a = makeFlame({ transforms: { one: {} } })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: { dimensions: 3 },
    })
    const result = planGlide(a, b)
    expect(isGlideRefusal(result)).toBe(true)
    if (isGlideRefusal(result)) {
      expect(result.reason).toContain('same dimension')
    }
  })

  it('refuses 3D outright in v1', () => {
    const a = makeFlame({
      transforms: { one: {} },
      renderSettings: { dimensions: 3 },
    })
    const result = planGlide(a, deepClone(a))
    expect(isGlideRefusal(result)).toBe(true)
  })

  it('refuses when a type change would overflow the variation cap', () => {
    const variationsA: Record<string, { type: string; weight: number }> = {}
    const variationsB: Record<string, { type: string; weight: number }> = {}
    for (let index = 0; index < MAX_VARIATIONS_PER_TRANSFORM; index++) {
      variationsA[`v${index}`] = { type: 'linearVar', weight: 1 }
      variationsB[`v${index}`] = { type: 'swirlVar', weight: 1 }
    }
    const a = makeFlame({ transforms: { one: { variations: variationsA } } })
    const b = makeFlame({ transforms: { one: { variations: variationsB } } })
    const result = planGlide(a, b)
    expect(isGlideRefusal(result)).toBe(true)
    if (isGlideRefusal(result)) {
      expect(result.reason).toContain('one')
      expect(result.reason).toContain('at the same time')
    }
  })

  it('refuses something that is not a flame', () => {
    expect(isGlideRefusal(planGlide({ nope: true }, { nope: true }))).toBe(true)
  })
})

describe('planGlide — determinism and budget', () => {
  it('produces the same plan twice', () => {
    const a = makeFlame({
      transforms: {
        one: { probability: 0.3, preAffine: { a: 0.4, b: 0.9, d: -0.2 } },
        two: { probability: 0.7 },
      },
    })
    const b = makeFlame({
      transforms: {
        one: { probability: 0.6, preAffine: { a: -0.8, b: 0.1, d: 0.5 } },
        three: { probability: 0.4 },
      },
    })
    expect(JSON.stringify(planGlide(a, b))).toBe(
      JSON.stringify(planGlide(a, b)),
    )
  })

  it('samples the same values twice', () => {
    const a = makeFlame({ transforms: { one: { preAffine: { a: 1 } } } })
    const b = makeFlame({
      transforms: { one: { preAffine: { a: -1, e: -1 } } },
    })
    const p = plan(a, b)
    for (const t of SAMPLE_TS) {
      expect(JSON.stringify(sampleGlide(p, t))).toBe(
        JSON.stringify(sampleGlide(p, t)),
      )
    }
  })

  it('never collapses a half-turned transform through zero', () => {
    const a = makeFlame({
      transforms: { spin: { preAffine: { a: 1, b: 0, d: 0, e: 1 } } },
    })
    const b = makeFlame({
      transforms: { spin: { preAffine: { a: -1, b: 0, d: 0, e: -1 } } },
    })
    const p = plan(a, b)
    for (let frame = 0; frame <= p.frames; frame++) {
      const sampled = sampleGlide(p, frame / p.frames)
      expect(Math.abs(preAffineDeterminant(sampled, 'spin'))).toBeGreaterThan(
        0.9,
      )
    }
  })

  it('keeps a large flame inside the timeline budget', () => {
    const transformsA: Record<string, Record<string, unknown>> = {}
    const transformsB: Record<string, Record<string, unknown>> = {}
    for (let index = 0; index < 24; index++) {
      transformsA[`t${index}`] = {
        probability: 1 / 24,
        preAffine: { a: 1, b: 0.1 * index, d: -0.1 * index, e: 1 },
      }
      transformsB[`t${index}`] = {
        probability: 1 / 24,
        preAffine: { a: -1, b: 0.2 * index, d: 0.3 * index, e: -1 },
      }
    }
    const a = makeFlame({ transforms: transformsA })
    const b = makeFlame({ transforms: transformsB })
    const p = plan(a, b, { durationMs: 1600, fps: 30 })
    const keyframes = p.tracks.reduce(
      (total, track) => total + track.keyframes.length,
      0,
    )
    expect(p.tracks.length).toBeLessThanOrEqual(512)
    expect(keyframes).toBeLessThanOrEqual(4096)
  })
})
