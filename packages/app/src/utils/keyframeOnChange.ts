import { onCleanup } from 'solid-js'
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
 *  frame. Call AFTER applying the value change so the new values are captured.
 *  No-op when the option is off or there is no timeline. */
export function keyframeChangedParams(
  timeline: TimelineState | null | undefined,
  paths: readonly string[],
) {
  // animationEnabled gate: the diamond is only visible (= toggleable) while
  // the animation UI is on; without it a persisted ON state would keep
  // recording ghost keyframes after the user leaves animation mode.
  if (!timeline?.animationEnabled() || !keyframeOnChange()) return
  for (const path of paths) {
    timeline.addKeyframeAtCurrentFrame(path)
  }
}

/** Per-edit keyframe hook shared by the scrub/slider/angle inputs: Auto mode
 *  re-records already-animated params; the track-changes diamond records any
 *  change, creating the first keyframe too. Call AFTER applying the value. */
export function keyframeEditedParam(
  timeline: TimelineState | null | undefined,
  path: string | undefined,
) {
  // Both modes only record while the animation UI is on — their toggles
  // (Auto button, track-changes diamond) are invisible without it, and a
  // persisted ON state must not keep recording ghost keyframes.
  if (!timeline?.animationEnabled() || !path) return
  if (
    (timeline.autoKeyframe() && timeline.hasAnyKeyframes(path)) ||
    keyframeOnChange()
  ) {
    timeline.addKeyframeAtCurrentFrame(path)
  }
}

/** Debounced track-changes writer for drag gestures: collects full parameter
 *  paths as gestures finish and keyframes them at the current frame in one
 *  flush. The debounce coalesces nudge bursts (values are resolved at flush
 *  time, i.e. after the last gesture); pending paths flush — not drop — if
 *  the owning component unmounts mid-wait. Create inside a component. */
export function createGestureKeyframer(
  timeline: TimelineState | null | undefined,
  delayMs = 300,
) {
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    if (!timeline) return
    for (const path of pending) {
      timeline.addKeyframeAtCurrentFrame(path)
    }
    pending.clear()
  }
  onCleanup(flush)
  return (paths: readonly string[]) => {
    // Same animationEnabled gate as keyframeChangedParams.
    if (!timeline?.animationEnabled() || !keyframeOnChange()) return
    for (const path of paths) pending.add(path)
    clearTimeout(timer)
    timer = setTimeout(flush, delayMs)
  }
}
