import * as v from '@/valibot'

/**
 * Hard limits for timeline data that crosses a file/session boundary.
 *
 * The editor normally stays far below these values (the duration scrubber tops
 * out at 999 frames). Keeping one shared ceiling prevents a hand-edited replay
 * from turning a frame ruler or keyframe list into an unbounded DOM workload.
 */
export const MAX_TIMELINE_FRAME = 2000
export const MAX_TIMELINE_PLAYBACK_FPS = 240
export const MAX_TIMELINE_TIME_SCALE = 10
export const MAX_TIMELINE_PARAMETER_PATH_LENGTH = 512
export const MAX_TIMELINE_TRACKS = 512
export const MAX_TIMELINE_KEYFRAMES_PER_TRACK = 4096
export const MAX_TIMELINE_KEYFRAMES = 4096
export const MAX_TIMELINE_KEYFRAME_STRING_LENGTH = 512
export const MAX_TIMELINE_KEYFRAME_NUMBER_MAGNITUDE = 1_000_000

const FORBIDDEN_PATH_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

/** A bounded, dot-separated parameter path safe to resolve as data. */
export function isTimelineParameterPath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TIMELINE_PARAMETER_PATH_LENGTH
  ) {
    return false
  }
  const segments = value.split('.')
  return segments.every((segment) => {
    if (segment.length === 0 || FORBIDDEN_PATH_SEGMENTS.has(segment)) {
      return false
    }
    for (let index = 0; index < segment.length; index++) {
      const code = segment.charCodeAt(index)
      const allowed =
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        code === 45 ||
        code === 95
      if (!allowed) return false
    }
    return true
  })
}

export const EasingCurve = v.picklist([
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
])
export type EasingCurve = v.InferOutput<typeof EasingCurve>

const TimelineKeyframeNumber = v.pipe(
  v.number(),
  v.finite(),
  v.minValue(-MAX_TIMELINE_KEYFRAME_NUMBER_MAGNITUDE),
  v.maxValue(MAX_TIMELINE_KEYFRAME_NUMBER_MAGNITUDE),
)

export const KeyframeValue = v.union([
  TimelineKeyframeNumber,
  v.pipe(v.string(), v.maxLength(MAX_TIMELINE_KEYFRAME_STRING_LENGTH)),
  v.tuple([
    TimelineKeyframeNumber,
    TimelineKeyframeNumber,
    TimelineKeyframeNumber,
  ]),
  v.tuple([
    TimelineKeyframeNumber,
    TimelineKeyframeNumber,
    TimelineKeyframeNumber,
    TimelineKeyframeNumber,
  ]),
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
  frame: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_TIMELINE_FRAME),
  ),
  value: KeyframeValue,
  easing: v.optional(EasingCurve, 'linear'),
  interp: v.optional(KeyframeInterpolation, 'linear'),
})
export type Keyframe = v.InferOutput<typeof Keyframe>

export const TimelineTrack = v.object({
  parameterPath: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(MAX_TIMELINE_PARAMETER_PATH_LENGTH),
  ),
  keyframes: v.pipe(
    v.array(Keyframe),
    v.maxLength(MAX_TIMELINE_KEYFRAMES_PER_TRACK),
  ),
})
export type TimelineTrack = v.InferOutput<typeof TimelineTrack>

export const TimelineConfig = v.object({
  fps: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(1),
    v.maxValue(60),
  ),
  startFrame: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_TIMELINE_FRAME),
  ),
  endFrame: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(1),
    v.maxValue(MAX_TIMELINE_FRAME),
  ),
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
  tracks: v.pipe(v.array(TimelineTrack), v.maxLength(MAX_TIMELINE_TRACKS)),
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
  fps: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(1),
    v.maxValue(MAX_TIMELINE_PLAYBACK_FPS),
  ),
  timeScale: v.pipe(
    v.number(),
    v.finite(),
    v.minValue(0),
    v.maxValue(MAX_TIMELINE_TIME_SCALE),
  ),
  startFrame: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_TIMELINE_FRAME),
  ),
  endFrame: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(1),
    v.maxValue(MAX_TIMELINE_FRAME),
  ),
  loop: v.boolean(),
  autoFps: v.optional(v.boolean()),
  loopMode: v.optional(v.picklist(['off', 'seamless', 'cycle'])),
})

export const TimelineSnapshotKeyframe = v.object({
  frame: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_TIMELINE_FRAME),
  ),
  value: KeyframeValue,
  easing: v.optional(EasingCurve),
  interp: v.optional(KeyframeInterpolation),
})

export const TimelineSnapshot = v.object({
  config: TimelineSnapshotConfig,
  /** The authored/scrubbed playhead position. Optional for sessions created
   *  before recorder view-state coverage landed. */
  currentFrame: v.optional(
    v.pipe(
      v.number(),
      v.finite(),
      v.integer(),
      v.minValue(0),
      v.maxValue(MAX_TIMELINE_FRAME),
    ),
  ),
  /** Timeline/editor switches live outside config but affect later commands. */
  animationEnabled: v.optional(v.boolean()),
  autoKeyframe: v.optional(v.boolean()),
  /** Whether the canvas is showing the authored frame instead of base values. */
  previewHeld: v.optional(v.boolean()),
  tracks: v.pipe(
    v.array(
      v.object({
        parameterPath: v.pipe(
          v.string(),
          v.nonEmpty(),
          v.maxLength(MAX_TIMELINE_PARAMETER_PATH_LENGTH),
        ),
        keyframes: v.pipe(
          v.array(TimelineSnapshotKeyframe),
          v.maxLength(MAX_TIMELINE_KEYFRAMES_PER_TRACK),
        ),
      }),
    ),
    v.maxLength(MAX_TIMELINE_TRACKS),
  ),
})
export type TimelineSnapshot = v.InferOutput<typeof TimelineSnapshot>

/**
 * Parse a complete snapshot and apply the cross-field/aggregate limits that
 * cannot be represented by the small Valibot schemas above.
 */
export function tryValidateTimelineSnapshot(
  value: unknown,
): TimelineSnapshot | undefined {
  const parsed = v.safeParse(TimelineSnapshot, value)
  if (!parsed.success) return undefined
  const snapshot = parsed.output
  if (snapshot.config.startFrame > snapshot.config.endFrame) return undefined
  if (
    snapshot.currentFrame !== undefined &&
    (snapshot.currentFrame < snapshot.config.startFrame ||
      snapshot.currentFrame > snapshot.config.endFrame)
  ) {
    return undefined
  }

  const paths = new Set<string>()
  let keyframeCount = 0
  for (const track of snapshot.tracks) {
    if (!isTimelineParameterPath(track.parameterPath)) return undefined
    if (paths.has(track.parameterPath)) return undefined
    paths.add(track.parameterPath)
    keyframeCount += track.keyframes.length
    if (keyframeCount > MAX_TIMELINE_KEYFRAMES) return undefined
  }
  return snapshot
}

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
