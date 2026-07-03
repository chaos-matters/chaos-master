import { persistentSignal } from './persistentSignal'
import type { TimelineState } from './timeline'

/**
 * Opt-in "track changes" recording (default OFF): while enabled, edits drop a
 * keyframe at the current frame for every value they change — scrub/slider
 * edits, dice randomizes and affine/color graph drags alike — so animating is
 * just "toggle the diamond, move things, step frames, move again". Unlike the
 * timeline's Auto mode (which only re-records already-animated params), this
 * also creates the first keyframe for untouched params.
 */
export const [keyframeOnChange, setKeyframeOnChange] = persistentSignal(
  'editor/keyframe-on-change',
  false,
)

/** When track-changes is on, keyframe each parameter path at the current
 *  frame as ONE undo entry (a dice roll is one Ctrl+Z). Call AFTER applying
 *  the value change so the new values are captured. No-op when the option is
 *  off or there is no timeline. */
export function keyframeChangedParams(
  timeline: TimelineState | null | undefined,
  paths: readonly string[],
) {
  // animationEnabled gate: the diamond is only visible (= toggleable) while
  // the animation UI is on; without it a persisted ON state would keep
  // recording ghost keyframes after the user leaves animation mode.
  if (!timeline?.animationEnabled() || !keyframeOnChange()) return
  // A deliberate one-shot write: no coalescing, each roll is its own step.
  timeline.addKeyframesAtCurrentFrame(paths, { coalesce: false })
}

/** Per-edit keyframe hook shared by the scrub/slider/angle inputs: Auto mode
 *  re-records already-animated params; the track-changes diamond records any
 *  change, creating the first keyframe too. Multi-path edits (e.g. a symmetry
 *  rotation touching a/b/d/e) record as one undo entry; per-pointer-move
 *  repeats coalesce, so a whole scrub costs one undo step — the owning input
 *  should call `timeline.breakUndoCoalescing()` when its gesture ends. Call
 *  AFTER applying the value. */
export function keyframeEditedParams(
  timeline: TimelineState | null | undefined,
  paths: readonly string[],
) {
  // Both modes only record while the animation UI is on — their toggles
  // (Auto button, track-changes diamond) are invisible without it, and a
  // persisted ON state must not keep recording ghost keyframes.
  if (!timeline?.animationEnabled() || paths.length === 0) return
  if (
    (timeline.autoKeyframe() &&
      paths.some((path) => timeline.hasAnyKeyframes(path))) ||
    keyframeOnChange()
  ) {
    timeline.addKeyframesAtCurrentFrame(paths)
  }
}

/** Single-path convenience over keyframeEditedParams. */
export function keyframeEditedParam(
  timeline: TimelineState | null | undefined,
  path: string | undefined,
) {
  if (!path) return
  keyframeEditedParams(timeline, [path])
}
