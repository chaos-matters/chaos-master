/**
 * Glide — an animated transition between two flame states.
 *
 * A glide is DATA: a base descriptor, the channels that move, the frame count,
 * and the exact flame to land on. It is not a running animation and it is
 * never the user's timeline (see `plans/state-morph-transitions.md` §4.1 and
 * decision 7). `runtime.ts` is the only file here that knows about the app.
 *
 * The existing "Morph" (a stochastic blend of two IFS at the iteration level)
 * and "Blend" keep their names and their behaviour; a glide interpolates
 * parameters, which is a different thing entirely.
 */

import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'
import type { EasingCurve, TimelineTrack } from '@/flame/schema/timeline'

/** The 2D affine a glide interpolates: `x' = a·x + b·y + c`, `y' = d·x + e·y + f`. */
export type GlideAffine = TransformFunction['preAffine']

/**
 * How a scalar travels from A to B.
 *
 * `angle` takes the shortest arc (359° → 1° travels 2°, not 358°) and `log`
 * moves in log space (zoom 1 → 100 passes through 10, not through 50), which
 * is the difference between a camera move that reads as a move and one that
 * spends 90% of the glide already arrived.
 */
export type GlideScalarMode = 'linear' | 'angle' | 'log'

export type GlideChannel =
  | {
      kind: 'scalar'
      path: string
      from: number
      to: number
      mode: GlideScalarMode
      easing: EasingCurve
    }
  /** Strings cannot blend; the resolver holds A and snaps to B at the end. */
  | { kind: 'text'; path: string; from: string; to: string }
  | {
      kind: 'vector'
      path: string
      from: number[]
      to: number[]
      easing: EasingCurve
    }
  /**
   * Six coefficients moved together, because the honest path between two
   * affines is not component-wise. `decompose` interpolates rotation on the
   * shortest arc, scale in log space, shear and translation linearly;
   * `linear` is the fallback for a near-singular pair or for a pair whose
   * decomposed path is indistinguishable from the straight one.
   */
  | {
      kind: 'affine'
      /** `transform.<tid>.preAffine`, `transform.<tid>.postAffine`, or `finalTransform`. */
      prefix: string
      from: GlideAffine
      to: GlideAffine
      /** Which of a–f this channel writes. All six when `mode` is `decompose`. */
      components: string[]
      mode: 'decompose' | 'linear'
      easing: EasingCurve
    }

/** What kind of change this is, which is what decides how long it takes. */
export type GlideChangeClass =
  | 'none'
  | 'scalar'
  | 'camera'
  | 'variation'
  | 'transform'
  | 'whole'

/**
 * Something the planner decided that the caller may want to know about.
 *
 * Every one of these is a place where a glide is not a pure interpolation:
 * a value that has no timeline sink and therefore snaps at the settle, an
 * affine pair with no continuous decomposed path, a budget fallback.
 */
export type GlideNote =
  | { kind: 'snapAtSettle'; path: string; reason: string }
  | { kind: 'reflection'; entity: string }
  | { kind: 'nearSingular'; entity: string }
  | { kind: 'linearFallback'; entity: string; reason: string }
  | { kind: 'probabilityNormalised'; sumA: number; sumB: number }
  /**
   * The baked keyframe form did not fit the timeline's budget. `channels` —
   * what the runtime and the offline exporter actually sample — is unaffected;
   * only `tracks` is reduced or empty.
   */
  | { kind: 'trackBudget'; reason: string }
  | {
      kind: 'structural'
      entity: string
      change:
        | 'transformAdded'
        | 'transformRemoved'
        | 'variationAdded'
        | 'variationRemoved'
        | 'variationTypeChanged'
    }

export type GlideQualityTier = 'responsive' | 'balanced' | 'full'
/** `auto` derives the tier from the workspace's own quality preset. */
export type GlideQualityPreference = 'auto' | GlideQualityTier

/**
 * Both presentation switches as one value: what an Arcade take holds on to
 * when it starts, and gives back when it ends.
 */
export type GlideSwitches = {
  enabled: boolean
  quality: GlideQualityPreference
}

export type GlideQuality = {
  tier: GlideQualityTier
  /** Multiplies the render quality of every frame except the settle. */
  accumulationScale: number
  /** Multiplies the duration table, so a higher tier also glides for longer. */
  durationScale: number
}

export type GlidePlan = {
  /** The structural union of A and B, holding A's values. Frame 0. */
  base: FlameDescriptor
  /** The exact canonical B, applied when the glide ends. */
  settle: FlameDescriptor
  channels: GlideChannel[]
  /** The same motion as keyframe data, for consumers that take tracks. */
  tracks: TimelineTrack[]
  fps: number
  /** Inclusive: frame 0 is A, frame `frames` is B. */
  frames: number
  durationMs: number
  changeClass: GlideChangeClass
  quality: GlideQuality
  notes: GlideNote[]
}

/**
 * What a finished glide tells whoever asked for it.
 *
 * `completedByDeadline` is not an error: the document still lands on exactly
 * `plan.settle`. It says the wall clock got it there because the animation
 * clock never ran — which is what a hidden or throttled tab looks like, and
 * the one case where an agent should not believe anybody watched the motion.
 */
export type GlideOutcome = {
  plan: GlidePlan
  completedByDeadline: boolean
}

export type GlideRefusal = { refused: true; reason: string }

export function isGlideRefusal(
  value: GlidePlan | GlideRefusal,
): value is GlideRefusal {
  return Object.hasOwn(value, 'refused')
}

export type GlideOptions = {
  /** Overrides the duration table for this glide. Clamped to `MAX_GLIDE_MS`. */
  durationMs?: number
  fps?: number
  /** `auto` reads `qualityPreset`. */
  quality?: GlideQualityPreference
  /** The workspace's current quality preset key, for `quality: 'auto'`. */
  qualityPreset?: string
  /**
   * How a new transform or variation enters. `weight` (the default) starts it
   * at B's shape with zero probability; `identity` is not implemented in v1
   * and is reserved so the option can arrive without a signature change.
   */
  entry?: 'weight'
}

/** The half of a glide runtime (runtime.ts) that `glide.toFlame` drives. */
export type GlideDriver = {
  settleForNextChange: () => FlameDescriptor | undefined
  glideFrom: (
    from: FlameDescriptor,
    options?: GlideOptions,
  ) => Promise<GlideOutcome | undefined>
  /**
   * How long a glide into `target` would take with no duration named: the
   * planner's own, for that change at the current quality tier, from the
   * settled document. 0 when it would not animate at all.
   */
  plannedDurationMs: (target: FlameDescriptor) => number
}

/**
 * What a recorded step says about its own transition.
 *
 * Semantic, not a duration: a file says "this step is a cut" or "this step is
 * a whole-flame change" and the duration table resolves it at replay time, so
 * retuning the pacing does not mean rewriting every session ever saved. A
 * synthesized session sets it from the change it planned; a real recording
 * usually omits it and lets the planner classify the diff itself.
 */
export type GlideStepHint =
  | 'cut'
  | 'scalar'
  | 'camera'
  | 'variation'
  | 'transform'
  | 'whole'

export const GLIDE_STEP_HINTS = [
  'cut',
  'scalar',
  'camera',
  'variation',
  'transform',
  'whole',
] as const

export function isGlideStepHint(value: unknown): value is GlideStepHint {
  return (
    typeof value === 'string' &&
    (GLIDE_STEP_HINTS as readonly string[]).includes(value)
  )
}

/** Longest a single glide may run, however it was asked for. */
export const MAX_GLIDE_MS = 5000
/** Shortest glide worth planning; below this a change is better off snapping. */
export const MIN_GLIDE_MS = 80
/**
 * How long past its own duration a glide waits before the wall clock lands it.
 *
 * `requestAnimationFrame` is the animation clock and a hidden tab does not run
 * it at all, so a glide clocked by rAF alone can hang forever — and with it any
 * caller awaiting the transition. Every glide therefore also carries a
 * `setTimeout` deadline; this is the only slack it allows a healthy tab, which
 * needs one frame (~17 ms at 60 Hz) past the end to notice it has arrived.
 */
export const GLIDE_DEADLINE_SLACK_MS = 250
