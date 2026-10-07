/**
 * `sampleGlide` — the specification the baked tracks must equal.
 *
 * There are deliberately two implementations of "the flame at time t": this
 * one, and `applyTracksToFlame(plan.tracks, clone(plan.base), frame)` in
 * `utils/timeline.ts`. Deduplicating them would mean moving that resolver out
 * of a 2000-line file with callers in the render seam and the export path
 * (HM3 in the plan), so instead the equivalence is asserted from a test. That
 * test is worth more than the deduplication: `applyTracksToFlame` had no
 * direct unit coverage at all before it.
 *
 * `writeGlidePath` below is therefore held to one rule — it must write exactly
 * the paths `applyTracksToFlame` writes, in exactly the same places, and
 * nothing else. `APPLIED_PATHS` is the allow-list the planner filters against,
 * and `sample.test.ts` checks that the two have not drifted.
 */

import { projectFlameToSchema } from '@chaos-master/core'
import { deepClone } from '@/utils/clone'
import { applyEasing } from '@/utils/easing'
import { interpolateAffine, lerpAffineLinear, lerpAngleShortest, lerpNumber, lerpScaleLog, } from './affine'
import type { GlideChannel, GlidePlan } from './types'
import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'

/** Numeric render settings `applyTracksToFlame` writes by bare name. */
export const APPLIED_SCALAR_SETTINGS = [
  'exposure',
  'skipIters',
  'vibrancy',
  'contrast',
  'gamma',
  'highlightPower',
  'depthColorPower',
  'lightPower',
  'palettePhase',
  'paletteSpeed',
  'densityEstimationQuality',
  'estimatorCurve',
] as const

/** Enum render settings. Held through the transition, snapped at the end. */
export const APPLIED_STRING_SETTINGS = [
  'drawMode',
  'colorInitMode',
  'pointInitMode',
] as const

/** Array render settings and their arity. */
export const APPLIED_VECTOR_SETTINGS: Record<string, number> = {
  backgroundColor: 3,
  edgeFadeColor: 4,
}

export const APPLIED_CAMERA_PATHS = [
  'camera.x',
  'camera.y',
  'camera.zoom',
  'camera.rotation',
] as const

export const APPLIED_CAMERA3D_PATHS = [
  'camera3D.theta',
  'camera3D.phi',
  'camera3D.radius',
  'camera3D.fov',
] as const

export const APPLIED_AFFINE_COMPONENTS = ['a', 'b', 'c', 'd', 'e', 'f'] as const

/**
 * Path heads the resolver reserves. A transform whose id collides with one of
 * these can never be addressed by a track, so the planner refuses to emit
 * channels for it and records the snap instead of animating into silence.
 */
export const RESERVED_PATH_HEADS = new Set<string>([
  'camera',
  'camera3D',
  'transform',
  'finalTransform',
  ...APPLIED_SCALAR_SETTINGS,
  ...APPLIED_STRING_SETTINGS,
  ...Object.keys(APPLIED_VECTOR_SETTINGS),
])

/**
 * Render settings that differ but have nowhere to land.
 *
 * Each of these is representable as a track, accepted by the schema, shown by
 * the dope sheet, and written nowhere — so a glide that emitted one would let
 * the difference silently vanish and only the settle would repair it. The
 * planner notes them as `snapAtSettle` instead.
 */
export const UNSUNK_RENDER_SETTINGS: Record<string, string> = {
  plotsPerChain: 'no timeline sink',
  paletteMode: 'no timeline sink',
  dimensions: 'no timeline sink',
  lightDirection: 'no timeline sink',
  autoExposure3D: 'no timeline sink',
  autoExposure3DStrength: 'no timeline sink',
  autoExposure3DRefRadius: 'no timeline sink',
  autoExposure3DBase: 'no timeline sink',
  palette: 'palettes are applied by command, not by a timeline path',
  blendWeight: 'blend weight lives outside the descriptor',
  blendFlame: 'blend flame lives outside the descriptor',
}

const IDENTITY_AFFINE_2D = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }

export function identityAffine2D(): TransformFunction['preAffine'] {
  return { ...IDENTITY_AFFINE_2D }
}

type MutableTransforms = Record<
  string,
  {
    probability: number
    colorSpeed?: number
    color: { x: number; y: number }
    preAffine: Record<string, number>
    postAffine: Record<string, number>
    variations: Record<
      string,
      { weight: number; params?: Record<string, number> }
    >
  }
>

/**
 * Write one resolved value where `applyTracksToFlame` would write it.
 *
 * Silently does nothing for a path whose target is absent, which is the
 * resolver's behaviour too — a track for a transform that is not in the base
 * is inert there, and must be inert here.
 */
export function writeGlidePath(
  flame: FlameDescriptor,
  path: string,
  value: number | string | number[],
): void {
  const settings = flame.renderSettings as unknown as Record<string, unknown>

  if (typeof value === 'number') {
    if ((APPLIED_SCALAR_SETTINGS as readonly string[]).includes(path)) {
      settings[path] = value
      return
    }
    switch (path) {
      case 'camera.x':
        if (flame.renderSettings.camera?.position) {
          flame.renderSettings.camera.position[0] = value
        }
        return
      case 'camera.y':
        if (flame.renderSettings.camera?.position) {
          flame.renderSettings.camera.position[1] = value
        }
        return
      case 'camera.zoom':
        if (flame.renderSettings.camera) {
          flame.renderSettings.camera.zoom = value
        }
        return
      case 'camera.rotation':
        if (flame.renderSettings.camera) {
          flame.renderSettings.camera.rotation = value
        }
        return
      case 'camera3D.theta':
      case 'camera3D.phi':
      case 'camera3D.radius':
      case 'camera3D.fov':
        if (flame.renderSettings.camera3D) {
          ;(flame.renderSettings.camera3D as unknown as Record<string, number>)[
            path.slice('camera3D.'.length)
          ] = value
        }
        return
      default:
        break
    }
  }

  if (
    typeof value === 'string' &&
    (APPLIED_STRING_SETTINGS as readonly string[]).includes(path)
  ) {
    settings[path] = value
    return
  }

  if (Array.isArray(value) && APPLIED_VECTOR_SETTINGS[path] === value.length) {
    settings[path] = [...value]
    return
  }

  if (typeof value !== 'number') return

  const parts = path.split('.')
  const transforms = flame.transforms as unknown as MutableTransforms

  if (parts[0] === 'finalTransform' && parts.length === 2) {
    // The resolver seeds a dimension-appropriate identity when any
    // `finalTransform.*` track exists. Mirror that, so a glide onto a flame
    // that grew a final transform has somewhere to write.
    flame.finalTransform ??= identityAffine2D()
    if ((APPLIED_AFFINE_COMPONENTS as readonly string[]).includes(parts[1]!)) {
      ;(flame.finalTransform as unknown as Record<string, number>)[parts[1]!] =
        value
    }
    return
  }

  if (
    parts[0] === 'transform' &&
    parts.length === 4 &&
    (parts[2] === 'preAffine' || parts[2] === 'postAffine')
  ) {
    const affine = transforms[parts[1]!]?.[parts[2]]
    if (affine) affine[parts[3]!] = value
    return
  }

  if (parts[0] === 'transform' && parts.length === 4 && parts[2] === 'color') {
    const color = transforms[parts[1]!]?.color as
      | Record<string, number>
      | undefined
    if (color) color[parts[3]!] = value
    return
  }

  if (
    parts[0] === 'transform' &&
    parts.length === 3 &&
    (parts[2] === 'probability' || parts[2] === 'colorSpeed')
  ) {
    const transform = transforms[parts[1]!]
    if (transform) {
      ;(transform as unknown as Record<string, number>)[parts[2]] = value
    }
    return
  }

  // The resolver's own guard, literally: it excludes only `transform` and
  // `camera`, because every other reserved head has already been written by a
  // named applier and reaches a transform record that does not exist. Keeping
  // the condition identical is what makes the equivalence test meaningful.
  const variationRooted = parts[0] !== 'transform' && parts[0] !== 'camera'

  if (parts.length === 3 && variationRooted) {
    const variation = transforms[parts[0]!]?.variations?.[parts[1]!]
    if (variation) {
      variation.params ??= {}
      variation.params[parts[2]!] = value
    }
    return
  }

  if (parts.length === 2 && variationRooted) {
    const variation = transforms[parts[0]!]?.variations?.[parts[1]!]
    if (variation) variation.weight = value
  }
}

function scalarAt(
  channel: Extract<GlideChannel, { kind: 'scalar' }>,
  eased: number,
): number {
  switch (channel.mode) {
    case 'angle':
      return lerpAngleShortest(channel.from, channel.to, eased)
    case 'log':
      return lerpScaleLog(channel.from, channel.to, eased)
    default:
      return lerpNumber(channel.from, channel.to, eased)
  }
}

/** Every path/value pair a channel produces at raw time `t`. */
export function channelValuesAt(
  channel: GlideChannel,
  t: number,
): { path: string; value: number | string | number[] }[] {
  if (channel.kind === 'text') {
    // Strings hold and then snap, exactly as `resolveKeyframeValue` does.
    return [{ path: channel.path, value: t >= 1 ? channel.to : channel.from }]
  }
  if (channel.kind === 'scalar') {
    const eased = applyEasing(t, channel.easing)
    return [{ path: channel.path, value: scalarAt(channel, eased) }]
  }
  if (channel.kind === 'vector') {
    const eased = applyEasing(t, channel.easing)
    return [
      {
        path: channel.path,
        value: channel.from.map((component, index) =>
          lerpNumber(component, channel.to[index] ?? component, eased),
        ),
      },
    ]
  }
  const eased = applyEasing(t, channel.easing)
  const affine =
    channel.mode === 'decompose'
      ? interpolateAffine(channel.from, channel.to, eased)
      : lerpAffineLinear(channel.from, channel.to, eased)
  const values = affine as unknown as Record<string, number>
  return channel.components.map((component) => ({
    path: `${channel.prefix}.${component}`,
    value: values[component]!,
  }))
}

/**
 * The flame at `t`, where 0 is A and 1 is B.
 *
 * Pure and deterministic: the same plan sampled twice is byte-identical, which
 * is what lets an offline export render a glide frame at a time and get the
 * same video twice.
 *
 * At `t = 1` this is B up to probability normalisation (the Σp invariant
 * rescales both endpoints — see `plan.ts`). `plan.settle` is the exact,
 * un-rescaled B and is what the runtime applies when the glide ends.
 */
export function sampleGlide(plan: GlidePlan, t: number): FlameDescriptor {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t
  const flame = deepClone(plan.base)
  for (const channel of plan.channels) {
    for (const { path, value } of channelValuesAt(channel, clamped)) {
      writeGlidePath(flame, path, value)
    }
  }
  // Held to the same schema domains as `applyTracksToFlame`, or halfway from
  // skipIters 10 to 15 is 12.5 here and 12 there.
  return projectFlameToSchema(flame)
}

/** The flame a glide lands on. Always the exact canonical B. */
export function glideEndState(plan: GlidePlan): FlameDescriptor {
  return deepClone(plan.settle)
}
