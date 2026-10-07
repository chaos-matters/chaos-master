import { describe, expect, it } from 'vitest'
import { deepClone } from '@/utils/clone'
import { applyTracksToFlame } from '@/utils/timeline'
import { planGlide } from './plan'
import { APPLIED_CAMERA_PATHS, APPLIED_SCALAR_SETTINGS, APPLIED_STRING_SETTINGS, APPLIED_VECTOR_SETTINGS, sampleGlide, UNSUNK_RENDER_SETTINGS, } from './sample'
import { makeFlame } from './testUtils'
import { isGlideRefusal } from './types'
import type { GlidePlan } from './types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { Keyframe, TimelineTrack } from '@/flame/schema/timeline'

function planned(a: FlameDescriptor, b: FlameDescriptor): GlidePlan {
  const result = planGlide(a, b, { durationMs: 800, fps: 24 })
  if (isGlideRefusal(result)) throw new Error(result.reason)
  return result
}

/**
 * `applyTracksToFlame` seeds an identity final transform UNCONDITIONALLY, not
 * only when a `finalTransform.*` track exists — an existing quirk of the
 * resolver, harmless because the renderer defaults an absent final transform
 * to exactly that identity. Normalise it away so the comparison is about the
 * glide rather than about that.
 */
function dropSeededIdentity(flame: FlameDescriptor): FlameDescriptor {
  const identity = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  if (
    flame.finalTransform &&
    JSON.stringify(flame.finalTransform) === JSON.stringify(identity)
  ) {
    const { finalTransform: _unused, ...rest } = flame
    return rest
  }
  return flame
}

/**
 * Numbers within `tolerance`, everything else identical.
 *
 * Exact equality is not available on a baked track, and the reason is worth
 * writing down. At a frame that IS a keyframe, `resolveKeyframeValue` does not
 * return that keyframe: it picks the segment ENDING there and evaluates
 * `prev + (next - prev) * 1`, which is the same number mathematically and a
 * few ulps away in binary floating point. Frames 0 and `frames` take the
 * resolver's own short-circuits and are exact, which is what the endpoint
 * assertions below check.
 */
function expectClose(
  actual: unknown,
  expected: unknown,
  tolerance: number,
  path = '',
): void {
  if (typeof expected === 'number' && typeof actual === 'number') {
    expect(Math.abs(actual - expected), path).toBeLessThanOrEqual(
      tolerance * Math.max(1, Math.abs(expected)),
    )
    return
  }
  if (
    expected !== null &&
    actual !== null &&
    typeof expected === 'object' &&
    typeof actual === 'object'
  ) {
    const left = expected as Record<string, unknown>
    const right = actual as Record<string, unknown>
    expect(Object.keys(right).sort(), path).toEqual(Object.keys(left).sort())
    for (const key of Object.keys(left)) {
      expectClose(right[key], left[key], tolerance, `${path}.${key}`)
    }
    return
  }
  expect(actual, path).toEqual(expected)
}

function assertTracksMatchSampler(plan: GlidePlan): void {
  for (let frame = 0; frame <= plan.frames; frame++) {
    const viaTracks = deepClone(plan.base)
    applyTracksToFlame(plan.tracks, viaTracks, frame, null)
    const viaSampler = sampleGlide(plan, frame / plan.frames)
    const left = dropSeededIdentity(viaTracks)
    const right = dropSeededIdentity(viaSampler)
    if (frame === 0 || frame === plan.frames) {
      expect(left).toEqual(right)
    } else {
      expectClose(left, right, 1e-9, `frame ${frame}`)
    }
  }
}

describe('sampleGlide equals the resolver on the plan’s own tracks', () => {
  it('for a scalar tweak', () => {
    const a = makeFlame({
      transforms: { one: {} },
      renderSettings: { gamma: 2, exposure: 0 },
    })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: { gamma: 4, exposure: 1.5 },
    })
    assertTracksMatchSampler(planned(a, b))
  })

  it('for a decomposed affine, where the keyframes are baked per frame', () => {
    const a = makeFlame({
      transforms: { spin: { preAffine: { a: 1, b: 0, d: 0, e: 1 } } },
    })
    const b = makeFlame({
      transforms: { spin: { preAffine: { a: -1, b: 0, d: 0, e: -1 } } },
    })
    const plan = planned(a, b)
    expect(
      plan.channels.some(
        (channel) => channel.kind === 'affine' && channel.mode === 'decompose',
      ),
    ).toBe(true)
    assertTracksMatchSampler(plan)
  })

  it('for a structural add, a remove and a variation type change at once', () => {
    const a = makeFlame({
      transforms: {
        keep: {
          probability: 0.5,
          variations: { v: { type: 'linearVar', weight: 1 } },
        },
        gone: { probability: 0.5, preAffine: { c: -3 } },
      },
    })
    const b = makeFlame({
      transforms: {
        keep: {
          probability: 0.4,
          variations: { v: { type: 'swirlVar', weight: 0.8 } },
        },
        fresh: { probability: 0.3, preAffine: { c: 9 } },
        other: { probability: 0.3, preAffine: { c: 11 } },
      },
    })
    assertTracksMatchSampler(planned(a, b))
  })

  it('for a camera move, a colour array and an enum hold', () => {
    const a = makeFlame({
      transforms: { one: {} },
      renderSettings: {
        camera: { zoom: 1, position: [0, 0], rotation: 0 },
        backgroundColor: [0, 0, 0],
        drawMode: 'light',
      },
    })
    const b = makeFlame({
      transforms: { one: {} },
      renderSettings: {
        camera: { zoom: 40, position: [3, 4], rotation: 2 },
        backgroundColor: [1, 1, 0.5],
        drawMode: 'paint',
      },
    })
    assertTracksMatchSampler(planned(a, b))
  })

  it('for a final transform arriving on one side only', () => {
    const a = makeFlame({ transforms: { one: {} } })
    const b = makeFlame({
      transforms: { one: {} },
      finalTransform: { a: 0.5, b: 0.4, c: 1, d: -0.3, e: 0.9, f: 2 },
    })
    assertTracksMatchSampler(planned(a, b))
  })

  it('for a variation parameter', () => {
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
            v: {
              type: 'juliaNVar',
              weight: 0.4,
              params: { power: 7, dist: -2 },
            },
          },
        },
      },
    })
    assertTracksMatchSampler(planned(a, b))
  })
})

// ── Path sink audit ─────────────────────────────────────────────────────────
// The planner may only emit a track for a path the resolver actually applies.
// A track for `paletteMode` is accepted by the schema, shown by the dope sheet
// and written nowhere — so a difference on one would silently vanish and only
// the settle would repair it. These two tests are what stop the allow-list and
// the resolver drifting apart the next time a render setting is added.

function trackFor(path: string, value: Keyframe['value']): TimelineTrack[] {
  return [
    {
      parameterPath: path,
      keyframes: [{ frame: 0, value, easing: 'linear', interp: 'linear' }],
    },
  ]
}

function auditFlame(): FlameDescriptor {
  return makeFlame({
    transforms: {
      tA: {
        variations: {
          vA: { type: 'juliaNVar', weight: 0.5, params: { power: 2, dist: 1 } },
        },
      },
    },
    finalTransform: { a: 1 },
  })
}

function applies(path: string, value: Keyframe['value']): boolean {
  const flame = auditFlame()
  const before = JSON.stringify(flame)
  applyTracksToFlame(trackFor(path, value), flame, 0, null)
  return JSON.stringify(flame) !== before
}

describe('APPLIED_PATHS still matches applyTracksToFlame', () => {
  it('writes every scalar render setting in the allow-list', () => {
    for (const path of APPLIED_SCALAR_SETTINGS) {
      expect(applies(path, 0.123456), path).toBe(true)
    }
  })

  it('writes every enum render setting in the allow-list', () => {
    const values: Record<string, string> = {
      drawMode: 'paint',
      colorInitMode: 'colorInitPosition',
      pointInitMode: 'pointInitGaussian',
    }
    for (const path of APPLIED_STRING_SETTINGS) {
      expect(applies(path, values[path]!), path).toBe(true)
    }
  })

  it('writes every array render setting in the allow-list', () => {
    expect(applies('backgroundColor', [0.1, 0.2, 0.3])).toBe(true)
    expect(applies('edgeFadeColor', [0.1, 0.2, 0.3, 0.4])).toBe(true)
    expect(Object.keys(APPLIED_VECTOR_SETTINGS).sort()).toEqual([
      'backgroundColor',
      'edgeFadeColor',
    ])
  })

  it('writes every camera path in the allow-list', () => {
    for (const path of APPLIED_CAMERA_PATHS) {
      expect(applies(path, 0.77), path).toBe(true)
    }
  })

  it('writes every transform, variation and final-transform path shape', () => {
    const paths = [
      'transform.tA.probability',
      'transform.tA.colorSpeed',
      'transform.tA.color.x',
      'transform.tA.color.y',
      'transform.tA.preAffine.a',
      'transform.tA.postAffine.f',
      'finalTransform.a',
      'finalTransform.f',
      'tA.vA',
      'tA.vA.power',
    ]
    for (const path of paths) {
      expect(applies(path, 0.4242), path).toBe(true)
    }
  })

  it('confirms the unsunk settings really do reach nothing', () => {
    const values: Record<string, Keyframe['value']> = {
      plotsPerChain: 4,
      paletteMode: 1,
      dimensions: 3,
      lightDirection: [1, 1, 1],
      autoExposure3D: true,
      autoExposure3DStrength: 2,
      autoExposure3DRefRadius: 9,
      autoExposure3DBase: 3,
      palette: 'anything',
      blendWeight: 0.5,
      blendFlame: 'anything',
    }
    for (const path of Object.keys(UNSUNK_RENDER_SETTINGS)) {
      expect(applies(path, values[path] ?? 1), path).toBe(false)
    }
  })
})
