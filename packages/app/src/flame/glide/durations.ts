/**
 * How long a glide takes, and what curve it takes it on.
 *
 * One data table, so pacing is tunable without touching the engine. The
 * numbers come from `plans/state-morph-transitions.md` §4.6: a whole-flame
 * load at 400 ms reads as a snap, and a single weight tweak at 1600 ms reads
 * as broken, so one global duration is not an option.
 */

import { MAX_TIMELINE_FRAME } from '@/flame/schema/timeline'
import { MAX_GLIDE_MS, MIN_GLIDE_MS } from './types'
import type { GlideChangeClass, GlideStepHint } from './types'
import type { EasingCurve } from '@/flame/schema/timeline'

export const GLIDE_DURATIONS: Record<GlideChangeClass, number> = {
  none: 0,
  /** exposure, one weight, one affine coefficient */
  scalar: 400,
  camera: 700,
  variation: 700,
  transform: 900,
  /** load / preset / randomize — everything moved at once */
  whole: 1600,
}

/**
 * The curve the whole glide shares.
 *
 * Shared deliberately, and not only for tidiness: every probability channel
 * has to be eased by the SAME function or Σp stops being 1 halfway through
 * (see `plan.ts`). Appear/disappear asymmetry therefore lives on variation
 * weights, which carry no such invariant, and not on probabilities — a
 * documented deviation from the plan's §4.6 table.
 */
export function easingFor(changeClass: GlideChangeClass): EasingCurve {
  return changeClass === 'none' ? 'linear' : 'easeInOut'
}

/** A value rising from nothing leads; a value falling to nothing trails. */
export const GLIDE_ENTER_EASING: EasingCurve = 'easeOut'
export const GLIDE_EXIT_EASING: EasingCurve = 'easeIn'

export type GlideChangeCounts = {
  transformsAdded: number
  transformsRemoved: number
  variationsAdded: number
  variationsRemoved: number
  unionTransforms: number
  cameraChanged: boolean
  anyChange: boolean
}

/**
 * The longest applicable class.
 *
 * "Whole" is not "many things changed" — it is "the cast changed": half or
 * more of the union's transforms appeared or disappeared, which is what a
 * preset load, a randomize or a `flame.load` looks like from here.
 */
export function classifyChange(counts: GlideChangeCounts): GlideChangeClass {
  const structural = counts.transformsAdded + counts.transformsRemoved
  if (structural >= Math.max(2, Math.ceil(counts.unionTransforms / 2))) {
    return 'whole'
  }
  if (structural > 0) return 'transform'
  if (counts.variationsAdded + counts.variationsRemoved > 0) return 'variation'
  if (counts.cameraChanged) return 'camera'
  return counts.anyChange ? 'scalar' : 'none'
}

/**
 * The duration a recorded step's own hint asks for, or `undefined` when the
 * step says nothing and the planner should classify the diff itself.
 *
 * `cut` returns 0, which is how a session says "this one snaps" — a palette
 * apply, or a step whose change is invisible.
 */
export function glideMsForHint(
  hint: GlideStepHint | undefined,
  durationScale = 1,
): number | undefined {
  if (hint === undefined) return undefined
  if (hint === 'cut') return 0
  return clampGlideMs(GLIDE_DURATIONS[hint] * durationScale)
}

export function clampGlideMs(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.min(MAX_GLIDE_MS, Math.max(MIN_GLIDE_MS, ms))
}

/**
 * Frames at the configured fps, NOT frames at whatever the GPU manages.
 *
 * The prior art counted rendered frames, so the same transition took one
 * second at 60 fps and two at 30. Here the count is a property of the plan,
 * which is what makes an offline export of it deterministic.
 */
export function glideFrameCount(durationMs: number, fps: number): number {
  const raw = Math.round((durationMs / 1000) * fps)
  return Math.min(MAX_TIMELINE_FRAME, Math.max(2, raw))
}
