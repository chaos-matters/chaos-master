import { persistentSignal } from './persistentSignal'
import type { TimelineState } from './timeline'

/**
 * Opt-in (default OFF): when enabled, randomize/reset buttons (affine coefs,
 * flame color, …) drop a keyframe at the current frame for every value they
 * change, so a whole bulk change lands on the timeline in one shot. Off by
 * default — randomizing normally does not touch the animation.
 *
 * Shared so any randomize button can adopt it: update the values, then call
 * keyframeRandomizedParams(timeline, paths).
 */
export const [keyframeOnRandomize, setKeyframeOnRandomize] = persistentSignal(
  'editor/keyframe-on-randomize',
  false,
)

/** When the option is on, keyframe each parameter path at the current frame.
 *  Call AFTER applying the value change so the new values are captured. No-op
 *  when the option is off or there is no timeline. */
export function keyframeRandomizedParams(
  timeline: TimelineState | null | undefined,
  paths: readonly string[],
) {
  if (!timeline || !keyframeOnRandomize()) return
  for (const path of paths) {
    timeline.addKeyframeAtCurrentFrame(path)
  }
}
