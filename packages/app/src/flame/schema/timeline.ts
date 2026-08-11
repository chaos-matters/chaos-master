import * as v from '@/valibot'

export const EasingCurve = v.picklist([
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
])
export type EasingCurve = v.InferOutput<typeof EasingCurve>

export const KeyframeValue = v.union([
  v.number(),
  v.string(),
  v.tuple([v.number(), v.number(), v.number()]),
  v.tuple([v.number(), v.number(), v.number(), v.number()]),
  v.boolean(),
  v.null_(),
])

// How a segment is interpolated, independent of `easing` (which reshapes time):
// - 'linear'   : straight lerp
// - 'constant' : hold the previous value (stepped)
// - 'spline'   : Catmull-Rom through neighbouring keyframes (smooth, C1)
export const KeyframeInterpolation = v.picklist([
  'linear',
  'constant',
  'spline',
])
export type KeyframeInterpolation = v.InferOutput<typeof KeyframeInterpolation>

export const Keyframe = v.object({
  frame: v.number(),
  value: KeyframeValue,
  easing: v.optional(EasingCurve, 'linear'),
  interp: v.optional(KeyframeInterpolation, 'linear'),
})
export type Keyframe = v.InferOutput<typeof Keyframe>

export const TimelineTrack = v.object({
  parameterPath: v.string(),
  keyframes: v.array(Keyframe),
})
export type TimelineTrack = v.InferOutput<typeof TimelineTrack>

export const TimelineConfig = v.object({
  fps: v.pipe(v.number(), v.minValue(1), v.maxValue(60)),
  startFrame: v.pipe(v.number(), v.minValue(0)),
  endFrame: v.pipe(v.number(), v.minValue(1)),
  loop: v.boolean(),
  autoFps: v.optional(v.boolean(), false),
  // Resolve-time loop synthesis (adds no real keyframes):
  // - 'seamless': trailing gap ramps back to each track's start value.
  // - 'cycle': per-property cyclic wrap over the whole timeline period.
  loopMode: v.optional(v.picklist(['off', 'seamless', 'cycle']), 'off'),
})
export type TimelineConfig = v.InferOutput<typeof TimelineConfig>

export const TimelineData = v.object({
  config: TimelineConfig,
  tracks: v.array(TimelineTrack),
})
export type TimelineData = v.InferOutput<typeof TimelineData>

/**
 * The LIVE timeline state, as `createTimelineState` actually holds it.
 *
 * Distinct from {@link TimelineData}, which is the persisted/share shape: this
 * one carries `timeScale` (a playback control that never needed persisting)
 * and leaves `easing`/`interp` genuinely optional instead of defaulting them,
 * so a snapshot round-trips a track without inventing values it did not have.
 *
 * Used where the live state crosses a JSON boundary and must come back
 * unchanged — a recorded session's starting animation, and the
 * `timeline.loadTimeline` command that restores one.
 */
export const TimelineSnapshotConfig = v.object({
  fps: v.pipe(v.number(), v.minValue(1), v.maxValue(240)),
  timeScale: v.pipe(v.number(), v.finite(), v.minValue(0)),
  startFrame: v.pipe(v.number(), v.integer(), v.minValue(0)),
  endFrame: v.pipe(v.number(), v.integer(), v.minValue(1)),
  loop: v.boolean(),
  autoFps: v.optional(v.boolean()),
  loopMode: v.optional(v.picklist(['off', 'seamless', 'cycle'])),
})

export const TimelineSnapshotKeyframe = v.object({
  frame: v.pipe(v.number(), v.finite()),
  value: KeyframeValue,
  easing: v.optional(EasingCurve),
  interp: v.optional(KeyframeInterpolation),
})

export const TimelineSnapshot = v.object({
  config: TimelineSnapshotConfig,
  tracks: v.array(
    v.object({
      parameterPath: v.pipe(v.string(), v.nonEmpty()),
      keyframes: v.array(TimelineSnapshotKeyframe),
    }),
  ),
})
export type TimelineSnapshot = v.InferOutput<typeof TimelineSnapshot>

export function defaultTimelineConfig(): TimelineConfig {
  return {
    fps: 30,
    startFrame: 0,
    endFrame: 90,
    loop: true,
    autoFps: false,
    loopMode: 'off',
  }
}
