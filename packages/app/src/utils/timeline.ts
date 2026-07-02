import { createSignal } from 'solid-js'
import { applyEasing, catmullRom, clamp } from './easing'
import { persistentSignal } from './persistentSignal'

interface WindowTimelineState {
  tracks: () => TimelineTrack[]
  getFrame: () => number
}

export type EasingCurve =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'bounce'
  | 'elastic'

import type { PointInitMode } from '@/flame/pointInitMode'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// `FlameDescriptor` is the single source of truth in the schema (derived from
// the valibot schema). Re-export it here so the timeline helpers and their
// callers share one type that cannot drift from the schema — the previous
// hand-written interface silently lagged the schema (missing plotsPerChain /
// autoExposure3D*, and even put edgeFadeColor at the wrong nesting level),
// which is exactly what made local and CI typecheck disagree (issue #30).
export type { FlameDescriptor, PointInitMode }

/**
 * Expandable mapping of variation types to their available parameters.
 * This system can be extended to support more variations and parameters.
 */
export const VariationParameterMaps: Record<string, string[]> = {
  tunnelVar: ['distortion'],
  lissajousVar: ['freqX', 'freqY', 'freqRatio', 'amplitude', 'phase'],
  pigtail: ['xmultiplier', 'ymultiplier'],
  blob: ['scale', 'phi', 'theta', 'psi'],
  fan2: ['curl_1', 'curl_2'],
  grid: ['du', 'dv'],
  hexes: ['Sx', 'Sy'],
  invCircle: ['distortion'],
  invCircle2: ['distortion'],
  invEllipse: ['a', 'b', 'sinAngle', 'cosAngle'],
  juliaN: ['jx', 'jy'],
  juliaScope: ['jx', 'jy'],
  linearT: [],
  line: [],
  popcorn: ['distortion'],
  popcorn2: ['distortion'],
  radialBlur: ['blurRadius'],
  rectangles: ['dx', 'dy'],
  rings: ['b', 'c', 'd', 'e', 'f'],
  rings2: ['scale', 'phi', 'theta', 'psi'],
  scry: ['Sx', 'Sy', 'a', 'b', 'c'],
  sinusGrid: ['dx', 'dy'],
  spirograph: ['Sx', 'Sy', 'a', 'b', 'c'],
  squish: ['Sx', 'Sy'],
  starBlur: ['blurRadius'],
  swirl: ['Sx', 'Sy', 'a', 'b', 'c'],
  swirl3: ['Sx', 'Sy', 'a', 'b', 'c'],
}

/**
 * All animatable parameters with metadata for the dope sheet editor.
 */
export type TimelineParameterType = 'number' | 'string' | 'array'

export interface TimelineParameter {
  path: string
  label: string
  type: TimelineParameterType
  group: string
}

export const TIMELINE_PARAMETERS: TimelineParameter[] = [
  { path: 'exposure', label: 'Exposure', type: 'number', group: 'Render' },
  { path: 'skipIters', label: 'Skip Iters', type: 'number', group: 'Render' },
  { path: 'vibrancy', label: 'Vibrancy', type: 'number', group: 'Render' },
  { path: 'contrast', label: 'Contrast', type: 'number', group: 'Render' },
  { path: 'gamma', label: 'Gamma', type: 'number', group: 'Render' },
  {
    path: 'highlightPower',
    label: 'Highlight Power',
    type: 'number',
    group: 'Render',
  },
  {
    path: 'depthColorPower',
    label: 'Depth Coloring',
    type: 'number',
    group: 'Render',
  },
  {
    path: 'lightPower',
    label: 'Light Power',
    type: 'number',
    group: 'Render',
  },
  { path: 'drawMode', label: 'Draw Mode', type: 'string', group: 'Render' },
  {
    path: 'palettePhase',
    label: 'Palette Phase',
    type: 'number',
    group: 'Palette',
  },
  {
    path: 'paletteSpeed',
    label: 'Palette Speed',
    type: 'number',
    group: 'Palette',
  },
  {
    path: 'backgroundColor',
    label: 'Background Color',
    type: 'array',
    group: 'Color',
  },
  {
    path: 'edgeFadeColor',
    label: 'Edge Fade Color',
    type: 'array',
    group: 'Color',
  },
  { path: 'camera.x', label: 'Camera X', type: 'number', group: 'Camera' },
  { path: 'camera.y', label: 'Camera Y', type: 'number', group: 'Camera' },
  {
    path: 'camera.zoom',
    label: 'Camera Zoom',
    type: 'number',
    group: 'Camera',
  },
  {
    path: 'camera.rotation',
    label: 'Camera Rotation',
    type: 'number',
    group: 'Camera',
  },
  {
    path: 'camera3D.theta',
    label: 'Camera3D Theta',
    type: 'number',
    group: 'Camera3D',
  },
  {
    path: 'camera3D.phi',
    label: 'Camera3D Phi',
    type: 'number',
    group: 'Camera3D',
  },
  {
    path: 'camera3D.radius',
    label: 'Camera3D Radius',
    type: 'number',
    group: 'Camera3D',
  },
  {
    path: 'camera3D.fov',
    label: 'Camera3D FOV',
    type: 'number',
    group: 'Camera3D',
  },
  {
    path: 'colorInitMode',
    label: 'Color Init Mode',
    type: 'string',
    group: 'Render',
  },
  {
    path: 'pointInitMode',
    label: 'Point Init Mode',
    type: 'string',
    group: 'Render',
  },
  {
    path: 'finalTransform.a',
    label: 'Final Transform A',
    type: 'number',
    group: 'Final Transform',
  },
  {
    path: 'finalTransform.b',
    label: 'Final Transform B',
    type: 'number',
    group: 'Final Transform',
  },
  {
    path: 'finalTransform.c',
    label: 'Final Transform C',
    type: 'number',
    group: 'Final Transform',
  },
  {
    path: 'finalTransform.d',
    label: 'Final Transform D',
    type: 'number',
    group: 'Final Transform',
  },
  {
    path: 'finalTransform.e',
    label: 'Final Transform E',
    type: 'number',
    group: 'Final Transform',
  },
  {
    path: 'finalTransform.f',
    label: 'Final Transform F',
    type: 'number',
    group: 'Final Transform',
  },
  {
    path: 'blendWeight',
    label: 'Blend Weight',
    type: 'number',
    group: 'Blend',
  },
]

/** Flat set of all variation parameter names (e.g. 'distortion', 'freqX', ...). */
export const ALL_VARIATION_PARAM_NAMES = new Set(
  Object.values(VariationParameterMaps).flat(),
)

/**
 * Resolve variation parameters for a given transform and variation type.
 * @param transforms - The transform record containing all variations
 * @param transformId - The ID of the transform
 * @param variationId - The ID of the variation
 * @param paramPath - The parameter path (e.g., "tunnelVar.distortion")
 * @param frame - The current frame number
 * @returns The interpolated parameter value or null if not found
 */
export function resolveVariationParameter(
  transforms: Record<string, unknown>,
  transformId: string,
  variationId: string,
  paramPath: string,
  frame: number,
): number | null {
  const transform = transforms[transformId] as
    | {
        variations: Record<string, unknown>
      }
    | undefined

  if (!transform) return null

  const variation = transform.variations[variationId] as
    | {
        type: string
        params: Record<string, number> | undefined
        weight: number
      }
    | undefined

  if (!variation || variation.params === undefined) return null

  // Get the available parameters for this variation type
  const params = VariationParameterMaps[variation.type] || []

  // Find the parameter in the paramPath
  const paramName = paramPath.split('.').pop()
  if (paramName === undefined || !params.includes(paramName)) return null

  // Check if there's a keyframe track for this parameter
  const timelineState = (
    globalThis as unknown as { currentTimeline?: WindowTimelineState }
  ).currentTimeline

  if (!timelineState) return null

  const trackPath = `${transformId}.${variationId}.${paramName}`
  // Search through the tracks array to find the matching track
  const track = timelineState
    .tracks()
    .find((t: TimelineTrack) => t.parameterPath === trackPath)

  if (!track) return null

  // Find the keyframe at the current frame
  const keyframe = track.keyframes.find(
    (kf: KeyframeData) => kf.frame === frame,
  )
  if (!keyframe) return null

  return keyframe.value as number
}

/** Segment interpolation mode (orthogonal to `easing`). See schema/timeline.ts. */
export type KeyframeInterpolation = 'linear' | 'constant' | 'spline'

export type KeyframeData = {
  frame: number
  value:
    | number
    | string
    | [number, number, number]
    | [number, number, number, number]
    | boolean
    | null
  easing?: EasingCurve
  interp?: KeyframeInterpolation
}

export type TimelineTrack = {
  parameterPath: string
  keyframes: KeyframeData[]
}

/**
 * How playback loops back on itself:
 * - `off`      — no synthesis (a plain `loop` may still jump at the wrap).
 * - `seamless` — there-and-back: play A→B, then a synthesized B→A return tail.
 * - `cycle`    — per-property cyclic wrap over the whole timeline period; each
 *                track's last keyframe flows into its first, respecting that
 *                track's own keyframe timing/phase. No timeline extension.
 */
export type LoopMode = 'off' | 'seamless' | 'cycle'

export type TimelineConfig = {
  fps: number
  timeScale: number
  startFrame: number
  endFrame: number
  loop: boolean
  autoFps?: boolean
  /** Resolve-time loop synthesis mode (see resolveLoopValue). */
  loopMode?: LoopMode
}

export function defaultConfig(): TimelineConfig {
  return {
    fps: 30,
    timeScale: 1,
    startFrame: 0,
    endFrame: 90,
    loop: true,
    autoFps: false,
    loopMode: 'off',
  }
}

/** Last keyframe frame across all tracks (the end of the user's content). */
export function getUserEndFrame(tracks: TimelineTrack[], fallback = 0): number {
  let userEnd = fallback
  let seen = false
  for (const t of tracks) {
    for (const kf of t.keyframes) {
      if (!seen || kf.frame > userEnd) {
        userEnd = kf.frame
        seen = true
      }
    }
  }
  return seen ? userEnd : fallback
}

type ResolvedValue =
  | number
  | string
  | boolean
  | [number, number, number]
  | null
  | [number, number, number, number]

export type LoopOptions =
  | { mode: 'seamless'; startFrame: number; endFrame: number; userEnd: number }
  | { mode: 'cycle'; startFrame: number; endFrame: number }

/**
 * Build loop options from a config + tracks, or `null` when looping synthesis
 * is off (so callers fall back to plain keyframe resolution).
 */
export function loopOptsFromConfig(
  config: TimelineConfig,
  tracks: TimelineTrack[],
): LoopOptions | null {
  const mode = config.loopMode ?? 'off'
  if (mode === 'off') return null
  if (mode === 'cycle') {
    return {
      mode: 'cycle',
      startFrame: config.startFrame,
      endFrame: config.endFrame,
    }
  }
  return {
    mode: 'seamless',
    startFrame: config.startFrame,
    endFrame: config.endFrame,
    userEnd: getUserEndFrame(tracks, config.startFrame),
  }
}

/** Interpolate between two keyframe values (numbers/arrays blend; else snap). */
function lerpKfValues(
  from: ResolvedValue,
  to: ResolvedValue,
  t: number,
): ResolvedValue {
  if (typeof from === 'number' && typeof to === 'number') {
    return from + (to - from) * t
  }
  if (Array.isArray(from) && Array.isArray(to) && from.length === to.length) {
    return from.map((v, i) => v + ((to as number[])[i]! - v) * t) as
      | [number, number, number]
      | [number, number, number, number]
  }
  // Strings / booleans can't blend — hold, then snap to the target at t === 1.
  return t >= 1 ? to : from
}

/**
 * Resolve a track's value at `frame`, optionally synthesizing a loop. With
 * `opts === null` it is exactly `resolveKeyframeValue`. See {@link LoopMode}.
 */
export function resolveLoopValue(
  keyframes: KeyframeData[],
  frame: number,
  opts: LoopOptions | null,
): ResolvedValue {
  const natural = resolveKeyframeValue(keyframes, frame)
  if (opts === null) return natural
  return opts.mode === 'seamless'
    ? resolveSeamless(keyframes, frame, natural, opts)
    : resolveCycle(keyframes, frame, natural, opts)
}

/**
 * Seamless (there-and-back) tail. In the trailing window `(userEnd, endFrame]`
 * the value ramps from the track's held last value back to its value at
 * `startFrame`, so the final frame equals the first.
 */
function resolveSeamless(
  keyframes: KeyframeData[],
  frame: number,
  natural: ResolvedValue,
  opts: { startFrame: number; endFrame: number; userEnd: number },
): ResolvedValue {
  const { startFrame, endFrame, userEnd } = opts
  if (endFrame <= userEnd || frame <= userEnd) return natural

  const startVal = resolveKeyframeValue(keyframes, startFrame)
  const endHeld = resolveKeyframeValue(keyframes, userEnd)
  if (startVal === null || endHeld === null) return natural

  const t = applyEasing(
    clamp((frame - userEnd) / (endFrame - userEnd), 0, 1),
    'easeInOut',
  )
  return lerpKfValues(endHeld, startVal, t)
}

/**
 * Per-property cyclic wrap. The timeline `[startFrame, endFrame]` is one period
 * `P`. Inside a track's own keyframe span it resolves normally; outside it
 * (before its first keyframe or after its last) it interpolates across the wrap
 * from the last keyframe `kn` to the first keyframe `k0` shifted by `+P`. That
 * makes `value(startFrame) === value(endFrame)` for every track, using each
 * track's own keyframe timing.
 */
function resolveCycle(
  keyframes: KeyframeData[],
  frame: number,
  natural: ResolvedValue,
  opts: { startFrame: number; endFrame: number },
): ResolvedValue {
  if (keyframes.length < 2) return natural
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame)
  const k0 = sorted[0]!
  const kn = sorted[sorted.length - 1]!
  const period = opts.endFrame - opts.startFrame
  if (period <= 0) return natural

  // Inside the track's own keyframe span → ordinary interpolation.
  if (frame >= k0.frame && frame <= kn.frame) return natural

  // Wrap segment: kn (at kn.frame) → k0 (at k0.frame + period).
  const wrapLen = k0.frame + period - kn.frame
  if (wrapLen <= 0) return natural // keyframes already span the full period

  // Bring "head" frames (before k0) into the segment by adding one period.
  const ff = frame >= kn.frame ? frame : frame + period
  const t = applyEasing(
    clamp((ff - kn.frame) / wrapLen, 0, 1),
    k0.easing ?? 'linear',
  )
  return lerpKfValues(kn.value, k0.value, t)
}

/**
 * Resolves the value at a given frame for a set of keyframes.
 * Returns the interpolated value or the nearest keyframe value.
 */
export function resolveKeyframeValue(
  keyframes: KeyframeData[],
  frame: number,
):
  | number
  | string
  | boolean
  | [number, number, number]
  | null
  | [number, number, number, number] {
  if (keyframes.length === 0) return null

  const sorted = [...keyframes].sort(
    (a: KeyframeData, b: KeyframeData) => a.frame - b.frame,
  )

  // Before first keyframe
  const firstKf = sorted[0]!
  if (frame <= firstKf.frame) return firstKf.value

  // After last keyframe
  const lastKf = sorted[sorted.length - 1]!
  if (frame >= lastKf.frame) return lastKf.value

  // Find surrounding keyframes (track the index so spline can reach neighbours).
  let prevIdx = 0
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]!.frame <= frame && sorted[i + 1]!.frame >= frame) {
      prevIdx = i
      break
    }
  }
  const prev = sorted[prevIdx]!
  const next = sorted[prevIdx + 1]!

  const frameRange = next.frame - prev.frame
  if (frameRange === 0) return prev.value

  const rawT = (frame - prev.frame) / frameRange
  const t = clamp(rawT, 0, 1)

  // The segment prev→next is owned by `next` (its easing + interp), consistent
  // with how this resolver has always sourced easing.
  const easedT = applyEasing(t, next.easing ?? 'linear')
  const interp = next.interp ?? 'linear'

  // Numbers: constant (hold) / spline (Catmull-Rom) / linear (lerp).
  if (typeof prev.value === 'number' && typeof next.value === 'number') {
    if (interp === 'constant') return prev.value
    if (interp === 'spline') {
      const before = sorted[prevIdx - 1]?.value
      const after = sorted[prevIdx + 2]?.value
      const p0 = typeof before === 'number' ? before : prev.value
      const p3 = typeof after === 'number' ? after : next.value
      return catmullRom(p0, prev.value, next.value, p3, easedT)
    }
    return prev.value + (next.value - prev.value) * easedT
  }

  // Array values (RGB/RGBA colors): same modes, component-wise.
  if (
    Array.isArray(prev.value) &&
    Array.isArray(next.value) &&
    prev.value.length === next.value.length
  ) {
    if (interp === 'constant') return prev.value
    const nextArr = next.value as number[]
    if (interp === 'spline') {
      const before = sorted[prevIdx - 1]?.value
      const after = sorted[prevIdx + 2]?.value
      const len = prev.value.length
      const p0 =
        Array.isArray(before) && before.length === len
          ? (before as number[])
          : (prev.value as number[])
      const p3 =
        Array.isArray(after) && after.length === len
          ? (after as number[])
          : nextArr
      return prev.value.map((v, i) =>
        catmullRom(p0[i]!, v, nextArr[i]!, p3[i]!, easedT),
      ) as [number, number, number] | [number, number, number, number]
    }
    return prev.value.map((v, i) => v + (nextArr[i]! - v) * easedT) as
      | [number, number, number]
      | [number, number, number, number]
  }

  // For string interpolation (drawMode, colorInitMode, pointInitMode) or boolean
  if (typeof prev.value === 'string' || typeof prev.value === 'boolean') {
    return prev.value
  }
  return next.value
}

/**
 * Gets all unique frames from all tracks for the timeline ruler.
 */
export function getAllTrackFrames(tracks: TimelineTrack[]): number[] {
  const frames = new Set<number>()
  for (const track of tracks) {
    for (const kf of track.keyframes) {
      frames.add(kf.frame)
    }
  }
  return [...frames].sort((a: number, b: number) => a - b)
}

/**
 * Creates a timeline state manager.
 * Returns current frame, config, tracks, and utility functions.
 */
export function createTimelineState() {
  const [currentFrame, setCurrentFrame] = createSignal(0)
  const [config, setConfig] = createSignal<TimelineConfig>(defaultConfig())
  const [tracks, setTracks] = createSignal<TimelineTrack[]>([], {
    equals: false,
  })
  const [isPlaying, setIsPlaying] = createSignal(false)
  const [isScrubbing, setIsScrubbing] = createSignal(false)
  // Blender-like: once the playhead is moved (seek/scrub/step/play), the canvas
  // keeps showing that frame's animated state on release ("held"), instead of
  // snapping back to the base flame. Editing the base view (camera pan/zoom)
  // detaches by clearing this. Drives `isDrivingView` below.
  const [previewHeld, setPreviewHeld] = createSignal(false)
  // Achieved playback FPS while Auto FPS is on. With Auto FPS each frame only
  // advances once it reaches target quality, so the real rate is below the
  // nominal `fps` and varies with scene complexity. Smoothed (EMA) so the
  // readout is stable. undefined when not measuring.
  const [measuredFps, setMeasuredFps] = createSignal<number | undefined>(
    undefined,
  )
  let lastAdvanceTs: number | undefined

  function resetFpsMeter() {
    lastAdvanceTs = undefined
    setMeasuredFps(undefined)
  }
  const [autoKeyframe, setAutoKeyframe] = persistentSignal(
    'timeline-auto-keyframe',
    true,
  )
  const [removeMode, setRemoveMode] = createSignal(false)
  const [animationEnabled, setAnimationEnabled] = createSignal(false)

  // True when the canvas should reflect the timeline (a specific frame's
  // animated values) rather than the base flame: while playing, while scrubbing,
  // or when a frame is "held" after a seek/step. The single source of truth for
  // every `effective*` animated accessor.
  const isDrivingView = () =>
    animationEnabled() && (isPlaying() || isScrubbing() || previewHeld())

  const [lastAddedKeyframe, setLastAddedKeyframe] = createSignal<{
    path: string
    frame: number
  } | null>(null)

  let valueResolverFn:
    | ((
        path: string,
      ) =>
        | number
        | string
        | [number, number, number]
        | [number, number, number, number]
        | null)
    | null = null

  let valueWriterFn:
    | ((
        path: string,
        value:
          | number
          | string
          | [number, number, number]
          | [number, number, number, number],
      ) => void)
    | null = null

  // Undo/redo stacks for timeline operations. Capped: auto-keyframe and the
  // track-changes diamond can push one snapshot per pointer-move during a
  // scrub, and every entry deep-copies every track.
  const MAX_TIMELINE_UNDO = 100
  const undoStack: (readonly TimelineTrack[])[] = []
  const redoStack: (readonly TimelineTrack[])[] = []
  // Set by addKeyframeAtCurrentFrame so a continuous same-param scrub at one
  // frame coalesces into a single undo entry (one Ctrl+Z reverts the whole
  // gesture instead of hundreds of per-move steps). Any other undo push
  // breaks the run.
  let lastKeyframeUndo: { path: string; frame: number } | null = null

  function pushUndo() {
    lastKeyframeUndo = null
    undoStack.push(
      tracks().map((t) => ({
        ...t,
        keyframes: t.keyframes.map((kf) => ({ ...kf })),
      })),
    )
    if (undoStack.length > MAX_TIMELINE_UNDO) undoStack.shift()
    redoStack.length = 0
  }

  function timelineUndo() {
    lastKeyframeUndo = null
    const prev = undoStack.pop()
    if (!prev) return
    redoStack.push(
      tracks().map((t) => ({
        ...t,
        keyframes: t.keyframes.map((kf) => ({ ...kf })),
      })),
    )
    setTracks(() => prev as TimelineTrack[])
  }

  function timelineRedo() {
    lastKeyframeUndo = null
    const next = redoStack.pop()
    if (!next) return
    undoStack.push(
      tracks().map((t) => ({
        ...t,
        keyframes: t.keyframes.map((kf) => ({ ...kf })),
      })),
    )
    setTracks(() => next as TimelineTrack[])
  }

  function hasTimelineUndo() {
    return undoStack.length > 0
  }

  function hasTimelineRedo() {
    return redoStack.length > 0
  }

  function addKeyframeImpl(
    parameterPath: string,
    frame: number,
    value:
      | number
      | string
      | [number, number, number]
      | [number, number, number, number],
    easing?: EasingCurve,
    interp?: KeyframeInterpolation,
  ) {
    setTracks((prev: TimelineTrack[]) => {
      const ti = prev.findIndex(
        (t: TimelineTrack) => t.parameterPath === parameterPath,
      )
      if (ti !== -1) {
        const track = prev[ti]!
        const existingKf = track.keyframes.find(
          (kf: KeyframeData) => kf.frame === frame,
        )
        // On update, preserve fields the caller didn't pass (e.g. a value scrub
        // or easing change must keep the keyframe's interp mode).
        const newKeyframes = existingKf
          ? track.keyframes.map((kf) =>
              kf.frame === frame
                ? {
                    frame,
                    value,
                    easing: easing ?? kf.easing,
                    interp: interp ?? kf.interp,
                  }
                : kf,
            )
          : [...track.keyframes, { frame, value, easing, interp }]
        return [
          ...prev.slice(0, ti),
          { parameterPath, keyframes: newKeyframes },
          ...prev.slice(ti + 1),
        ]
      }
      return [
        ...prev,
        { parameterPath, keyframes: [{ frame, value, easing, interp }] },
      ]
    })
    setLastAddedKeyframe({ path: parameterPath, frame })
    if (frame === currentFrame() && valueWriterFn) {
      valueWriterFn(parameterPath, value)
    }
  }

  function removeKeyframeImpl(parameterPath: string, frame: number) {
    setTracks((prev: TimelineTrack[]) =>
      prev
        .map((t: TimelineTrack) =>
          t.parameterPath === parameterPath
            ? {
                ...t,
                keyframes: t.keyframes.filter(
                  (kf: KeyframeData) => kf.frame !== frame,
                ),
              }
            : t,
        )
        .filter((t: TimelineTrack) => t.keyframes.length > 0),
    )
  }

  function addKeyframe(
    parameterPath: string,
    frame: number,
    value:
      | number
      | string
      | [number, number, number]
      | [number, number, number, number],
    easing?: EasingCurve,
    interp?: KeyframeInterpolation,
  ) {
    pushUndo()
    addKeyframeImpl(parameterPath, frame, value, easing, interp)
  }

  function removeKeyframe(parameterPath: string, frame: number) {
    pushUndo()
    removeKeyframeImpl(parameterPath, frame)
  }

  function setKeyframeValue(
    parameterPath: string,
    frame: number,
    value:
      | number
      | string
      | [number, number, number]
      | [number, number, number, number],
    easing?: EasingCurve,
    interp?: KeyframeInterpolation,
  ) {
    addKeyframeImpl(parameterPath, frame, value, easing, interp)
  }

  /**
   * Set the interpolation mode of an existing keyframe, preserving its value and
   * easing. No-op if the keyframe's value isn't interpolatable (null/boolean).
   */
  function setKeyframeInterp(
    parameterPath: string,
    frame: number,
    interp: KeyframeInterpolation,
  ) {
    const kf = getKeyframeAtFrame(parameterPath, frame)
    if (!kf || kf.value === null || typeof kf.value === 'boolean') return
    addKeyframe(parameterPath, frame, kf.value, kf.easing, interp)
  }

  function getKeysForFrame(frame: number): Record<string, boolean> {
    const result: Record<string, boolean> = {}
    const trackList = tracks()
    for (let i = 0; i < trackList.length; i++) {
      const track = trackList[i]!
      const hasKf = track.keyframes.some(
        (kf: KeyframeData) => kf.frame === frame,
      )
      if (hasKf) {
        result[track.parameterPath] = true
      }
    }
    return result
  }

  function hasKeyframeAtFrame(parameterPath: string, frame: number): boolean {
    const track = tracks().find(
      (t: TimelineTrack): t is TimelineTrack =>
        t.parameterPath === parameterPath,
    )
    return (
      track?.keyframes.some((kf: KeyframeData) => kf.frame === frame) ?? false
    )
  }

  /**
   * Get all keyframes at a specific frame for a track
   * Returns the keyframe at that frame or undefined
   */
  function getKeyframeAtFrame(
    parameterPath: string,
    frame: number,
  ): KeyframeData | undefined {
    const track = tracks().find(
      (t: TimelineTrack): t is TimelineTrack =>
        t.parameterPath === parameterPath,
    )
    if (!track) return undefined
    return track.keyframes.find((kf: KeyframeData) => kf.frame === frame)
  }

  /**
   * Get keyframes that would overlap if added at a specific frame
   * This helps detect when creating multiple keyframes at the same frame
   */
  function getOverlappingKeyframes(
    parameterPath: string,
    frame: number,
  ): KeyframeData[] {
    const track = tracks().find(
      (t: TimelineTrack): t is TimelineTrack =>
        t.parameterPath === parameterPath,
    )
    if (!track) return []
    return track.keyframes.filter((kf: KeyframeData) => kf.frame === frame)
  }

  /**
   * Handle keyframe overlap - warn if adding a keyframe at a frame with existing keyframes
   * Returns true if operation was successful, false if duplicate was detected
   */
  function addKeyframeWithOverlapCheck(
    parameterPath: string,
    frame: number,
    value:
      | number
      | string
      | [number, number, number]
      | [number, number, number, number],
    easing?: EasingCurve,
  ): boolean {
    const existingKeyframes = getOverlappingKeyframes(parameterPath, frame)
    if (existingKeyframes.length > 0) {
      return false
    }

    pushUndo()
    addKeyframeImpl(parameterPath, frame, value, easing)
    return true
  }

  /**
   * Remove all keyframes at a specific frame for a track.
   * Delegates to removeKeyframe.
   */
  function removeKeyframesAtFrame(parameterPath: string, frame: number): void {
    pushUndo()
    removeKeyframeImpl(parameterPath, frame)
  }

  function removeTrack(parameterPath: string) {
    pushUndo()
    setTracks((prev) => prev.filter((t) => t.parameterPath !== parameterPath))
  }

  function removeTracks(parameterPaths: string[]) {
    if (parameterPaths.length === 0) return
    pushUndo()
    setTracks((prev) =>
      prev.filter((t) => !parameterPaths.includes(t.parameterPath)),
    )
  }

  /**
   * Find the closest keyframe before or at a given frame
   */
  function findClosestKeyframeBeforeFrame(
    parameterPath: string,
    frame: number,
  ): KeyframeData | undefined {
    const track = tracks().find(
      (t: TimelineTrack): t is TimelineTrack =>
        t.parameterPath === parameterPath,
    )
    if (!track) return undefined

    const validKeyframes = track.keyframes
      .filter((kf: KeyframeData) => kf.frame <= frame)
      .sort((a: KeyframeData, b: KeyframeData) => b.frame - a.frame)

    return validKeyframes[0]
  }

  /**
   * Split a keyframe into two at a specified frame
   * Keeps the first keyframe value, copies to second with updated frame number
   */
  function splitKeyframeAtFrame(
    parameterPath: string,
    originalFrame: number,
    splitFrame: number,
  ): boolean {
    const track = tracks().find(
      (t: TimelineTrack): t is TimelineTrack =>
        t.parameterPath === parameterPath,
    )
    if (!track) return false

    const keyframe = track.keyframes.find(
      (kf: KeyframeData) => kf.frame === originalFrame,
    )
    if (
      !keyframe ||
      keyframe.value === null ||
      typeof keyframe.value === 'boolean'
    )
      return false

    // Remove the original keyframe
    pushUndo()
    removeKeyframeImpl(parameterPath, originalFrame)

    // Add new keyframes at split positions
    addKeyframeImpl(
      parameterPath,
      originalFrame,
      keyframe.value,
      keyframe.easing,
      keyframe.interp,
    )
    addKeyframeImpl(
      parameterPath,
      splitFrame,
      keyframe.value,
      keyframe.easing,
      keyframe.interp,
    )

    return true
  }

  /**
   * Mirror keyframe value to the opposite side of the timeline
   * Calculates the mirrored frame position based on timeline bounds
   */
  function mirrorKeyframeToOpposite(
    parameterPath: string,
    frame: number,
  ): number | null {
    const currentConfig = config()
    const _frameRange = currentConfig.endFrame - currentConfig.startFrame

    // Calculate mirrored frame (if center is startFrame)
    const mirroredFrame =
      currentConfig.startFrame + (currentConfig.endFrame - frame)

    // Check if mirrored frame is within valid range
    if (
      mirroredFrame < currentConfig.startFrame ||
      mirroredFrame > currentConfig.endFrame
    ) {
      return null
    }

    return mirroredFrame
  }

  /**
   * Apply mirrored value from one keyframe to another track
   * Useful for creating symmetrical animations across different parameters
   */
  function applyMirroredValueFromTrack(
    sourceParameterPath: string,
    targetParameterPath: string,
    frame: number,
  ): boolean {
    const sourceTrack = tracks().find(
      (t: TimelineTrack): t is TimelineTrack =>
        t.parameterPath === sourceParameterPath,
    )
    if (!sourceTrack) return false

    // Get keyframe value at source frame
    const keyframe = sourceTrack.keyframes.find(
      (kf: KeyframeData) => kf.frame === frame,
    )
    if (
      !keyframe ||
      keyframe.value === null ||
      typeof keyframe.value === 'boolean'
    )
      return false

    // Add keyframe to target track at mirrored frame with same easing
    const mirroredFrame = mirrorKeyframeToOpposite(sourceParameterPath, frame)
    if (mirroredFrame === null) return false

    pushUndo()
    addKeyframeImpl(
      targetParameterPath,
      mirroredFrame,
      keyframe.value,
      keyframe.easing,
      keyframe.interp,
    )
    return true
  }

  /**
   * Check if multiple tracks have keyframes at the same frame
   */
  function getTracksWithFrameOverlap(frame: number): string[] {
    const result: string[] = []
    for (const track of tracks()) {
      if (track.keyframes.some((kf: KeyframeData) => kf.frame === frame)) {
        result.push(track.parameterPath)
      }
    }
    return result
  }

  function resolveValueAtPath(
    parameterPath: string,
    frame: number,
  ):
    | number
    | string
    | boolean
    | [number, number, number]
    | [number, number, number, number]
    | null {
    const track = tracks().find(
      (t: TimelineTrack): t is TimelineTrack =>
        t.parameterPath === parameterPath,
    )
    if (!track) return null
    return resolveLoopValue(
      track.keyframes,
      frame,
      loopOptsFromConfig(config(), tracks()),
    )
  }

  function advanceFrame() {
    const cfg = config()
    // Sample the achieved rate between auto-FPS advances (each advance fires
    // when a frame hits target quality). Skip manual stepping (not playing).
    if (isPlaying() && cfg.autoFps) {
      const now = globalThis.performance.now()
      if (lastAdvanceTs !== undefined) {
        const dt = now - lastAdvanceTs
        if (dt > 0) {
          const instantaneous = 1000 / dt
          setMeasuredFps((prev) =>
            prev === undefined
              ? instantaneous
              : prev * 0.8 + instantaneous * 0.2,
          )
        }
      }
      lastAdvanceTs = now
    }
    const next = currentFrame() + 1
    if (next > cfg.endFrame) {
      setCurrentFrame(cfg.startFrame)
      if (!cfg.loop) {
        setIsPlaying(false)
        resetFpsMeter()
      }
    } else {
      setCurrentFrame(next)
    }
    setPreviewHeld(true)
  }

  function goBackFrame() {
    const cfg = config()
    const prev = currentFrame() - 1
    if (prev < cfg.startFrame) {
      setCurrentFrame(cfg.loop ? cfg.endFrame : cfg.startFrame)
    } else {
      setCurrentFrame(prev)
    }
    setPreviewHeld(true)
  }

  function goToFrame(frame: number) {
    setCurrentFrame(clamp(frame, config().startFrame, config().endFrame))
    setPreviewHeld(true)
  }

  function play() {
    const cfg = config()
    if (!cfg.loop && currentFrame() >= cfg.endFrame) {
      setCurrentFrame(cfg.startFrame)
    }
    resetFpsMeter()
    setPreviewHeld(true)
    setIsPlaying(true)
  }

  function pause() {
    setIsPlaying(false)
    resetFpsMeter()
  }

  function togglePlay() {
    setIsPlaying(!isPlaying())
    resetFpsMeter()
  }

  function hasAnyKeyframes(parameterPath: string): boolean {
    return tracks().some(
      (t: TimelineTrack) =>
        t.parameterPath === parameterPath && t.keyframes.length > 0,
    )
  }

  function removeAllKeyframesForPath(parameterPath: string) {
    pushUndo()
    setTracks((prev: TimelineTrack[]) =>
      prev.filter((t: TimelineTrack) => t.parameterPath !== parameterPath),
    )
  }

  function setValueResolver(
    fn: (
      path: string,
    ) =>
      | number
      | string
      | [number, number, number]
      | [number, number, number, number]
      | null,
  ) {
    valueResolverFn = fn
  }

  function setValueWriter(
    fn: (
      path: string,
      value:
        | number
        | string
        | [number, number, number]
        | [number, number, number, number],
    ) => void,
  ) {
    valueWriterFn = fn
  }

  function getResolvedValue(
    path: string,
  ):
    | number
    | string
    | [number, number, number]
    | [number, number, number, number]
    | null {
    return valueResolverFn ? valueResolverFn(path) : null
  }

  function addKeyframeAtCurrentFrame(parameterPath: string) {
    const frame = currentFrame()
    const value = valueResolverFn ? valueResolverFn(parameterPath) : null
    if (value !== null) {
      // Coalesce continuous re-records of the same param at the same frame
      // (auto-keyframe / track-changes fire per pointer-move while scrubbing)
      // into one undo entry.
      const coalesce =
        lastKeyframeUndo?.path === parameterPath &&
        lastKeyframeUndo.frame === frame
      if (!coalesce) {
        pushUndo()
        lastKeyframeUndo = { path: parameterPath, frame }
      }
      addKeyframeImpl(parameterPath, frame, value)
    }
  }

  function toggleKeyframeAtCurrentFrame(parameterPath: string) {
    const frame = currentFrame()
    const hasKf = hasKeyframeAtFrame(parameterPath, frame)
    if (hasKf) {
      pushUndo()
      removeKeyframeImpl(parameterPath, frame)
    } else {
      addKeyframeAtCurrentFrame(parameterPath)
    }
  }

  function moveKeyframe(
    parameterPath: string,
    oldFrame: number,
    newFrame: number,
  ) {
    const track = tracks().find(
      (t: TimelineTrack): t is TimelineTrack =>
        t.parameterPath === parameterPath,
    )
    if (!track) return

    const keyframe = track.keyframes.find(
      (kf: KeyframeData) => kf.frame === oldFrame,
    )
    if (
      !keyframe ||
      keyframe.value === null ||
      typeof keyframe.value === 'boolean'
    )
      return

    pushUndo()
    removeKeyframeImpl(parameterPath, oldFrame)
    addKeyframeImpl(
      parameterPath,
      newFrame,
      keyframe.value,
      keyframe.easing,
      keyframe.interp,
    )
  }

  /**
   * Move a keyframe to a new frame WITHOUT pushing undo — for use inside an
   * interactive drag that already opened a single undo step at its start. No-op
   * if the source is missing/non-interpolatable, or the destination already
   * holds another keyframe (so a drag can't clobber a neighbour).
   */
  function relocateKeyframe(
    parameterPath: string,
    oldFrame: number,
    newFrame: number,
  ) {
    if (oldFrame === newFrame) return
    const kf = getKeyframeAtFrame(parameterPath, oldFrame)
    if (!kf || kf.value === null || typeof kf.value === 'boolean') return
    if (hasKeyframeAtFrame(parameterPath, newFrame)) return
    removeKeyframeImpl(parameterPath, oldFrame)
    addKeyframeImpl(parameterPath, newFrame, kf.value, kf.easing, kf.interp)
  }

  function clearAllTracks() {
    setPreviewHeld(false)
    if (tracks().length === 0) return
    pushUndo()
    setTracks([])
  }

  /**
   * Set the loop synthesis mode. Non-destructive and idempotent — adds no
   * keyframes. `seamless`/`cycle` turn `loop` on. `seamless` also guarantees a
   * trailing return ramp by extending `endFrame` past the last keyframe (by the
   * forward span, so the return takes the same time as the forward animation);
   * `cycle` uses the existing timeline as its period and never extends it.
   * See {@link LoopMode}.
   */
  function setLoopMode(mode: LoopMode) {
    const cfg = config()
    if (mode === 'off') {
      setConfig({ ...cfg, loopMode: 'off' })
      return
    }
    if (mode === 'cycle') {
      setConfig({ ...cfg, loopMode: 'cycle', loop: true })
      return
    }
    const userEnd = getUserEndFrame(tracks(), cfg.startFrame)
    const span = Math.max(1, userEnd - cfg.startFrame)
    const endFrame = cfg.endFrame > userEnd ? cfg.endFrame : userEnd + span
    setConfig({ ...cfg, loopMode: 'seamless', loop: true, endFrame })
  }

  /** Replace all tracks with deep-cloned copies (unified with addKeyframeImpl). */
  function loadTracks(incoming: readonly TimelineTrack[]) {
    setPreviewHeld(false)
    setTracks(() =>
      incoming.map((t) => ({
        parameterPath: t.parameterPath,
        keyframes: t.keyframes.map((kf) => ({
          frame: kf.frame,
          value: kf.value,
          easing: kf.easing,
          interp: kf.interp,
        })),
      })),
    )
  }

  const getFrame = (): number => currentFrame()

  return {
    currentFrame,
    setCurrentFrame,
    config,
    setConfig,
    tracks,
    setTracks,
    lastAddedKeyframe,
    isPlaying,
    setIsPlaying,
    measuredFps,
    isScrubbing,
    setIsScrubbing,
    previewHeld,
    setPreviewHeld,
    isDrivingView,
    autoKeyframe,
    setAutoKeyframe,
    removeMode,
    setRemoveMode,
    animationEnabled,
    setAnimationEnabled,
    getFrame,
    addKeyframe,
    removeKeyframe,
    setKeyframeValue,
    setKeyframeInterp,
    getKeysForFrame,
    hasKeyframeAtFrame,
    getKeyframeAtFrame,
    getOverlappingKeyframes,
    addKeyframeWithOverlapCheck,
    removeTrack,
    removeTracks,
    removeKeyframesAtFrame,
    findClosestKeyframeBeforeFrame,
    splitKeyframeAtFrame,
    getTracksWithFrameOverlap,
    mirrorKeyframeToOpposite,
    applyMirroredValueFromTrack,
    resolveValueAtPath,
    hasAnyKeyframes,
    removeAllKeyframesForPath,
    setValueResolver,
    setValueWriter,
    getResolvedValue,
    addKeyframeAtCurrentFrame,
    toggleKeyframeAtCurrentFrame,
    moveKeyframe,
    relocateKeyframe,
    loadTracks,
    clearAllTracks,
    setLoopMode,
    advanceFrame,
    goBackFrame,
    goToFrame,
    play,
    pause,
    togglePlay,
    timelineUndo,
    timelineRedo,
    hasTimelineUndo,
    hasTimelineRedo,
  }
}

export type TimelineState = ReturnType<typeof createTimelineState>

export function applyTracksToFlame(
  tracks: TimelineTrack[],
  flame: FlameDescriptor,
  frame: number,
  loop: LoopOptions | null = null,
): void {
  const trackMap = new Map(tracks.map((t) => [t.parameterPath, t] as const))

  function applyNumber(path: string, setter: (v: number) => void) {
    const track = trackMap.get(path)
    if (!track) return
    const value = resolveLoopValue(track.keyframes, frame, loop)
    if (value !== null && typeof value === 'number') setter(value)
  }

  function applyString(path: string, setter: (v: string) => void) {
    const track = trackMap.get(path)
    if (!track) return
    const value = resolveLoopValue(track.keyframes, frame, loop)
    if (value !== null && typeof value === 'string') setter(value)
  }

  // Camera
  if (flame.renderSettings.camera?.position) {
    applyNumber('camera.x', (v) => {
      flame.renderSettings.camera.position[0] = v
    })
    applyNumber('camera.y', (v) => {
      flame.renderSettings.camera.position[1] = v
    })
  }
  if (flame.renderSettings.camera) {
    applyNumber('camera.zoom', (v) => {
      flame.renderSettings.camera.zoom = v
    })
    applyNumber('camera.rotation', (v) => {
      flame.renderSettings.camera.rotation = v
    })
  }

  // Camera3D
  if (flame.renderSettings.camera3D) {
    applyNumber('camera3D.theta', (v) => {
      flame.renderSettings.camera3D.theta = v
    })
    applyNumber('camera3D.phi', (v) => {
      flame.renderSettings.camera3D.phi = v
    })
    applyNumber('camera3D.radius', (v) => {
      flame.renderSettings.camera3D.radius = v
    })
    applyNumber('camera3D.fov', (v) => {
      flame.renderSettings.camera3D.fov = v
    })
  }

  // Flame parameters
  applyNumber('exposure', (v) => {
    flame.renderSettings.exposure = v
  })
  applyNumber('skipIters', (v) => {
    flame.renderSettings.skipIters = v
  })
  applyNumber('vibrancy', (v) => {
    flame.renderSettings.vibrancy = v
  })
  applyNumber('contrast', (v) => {
    flame.renderSettings.contrast = v
  })
  applyNumber('gamma', (v) => {
    flame.renderSettings.gamma = v
  })
  applyNumber('highlightPower', (v) => {
    flame.renderSettings.highlightPower = v
  })
  applyNumber('depthColorPower', (v) => {
    flame.renderSettings.depthColorPower = v
  })
  applyNumber('lightPower', (v) => {
    flame.renderSettings.lightPower = v
  })
  applyNumber('palettePhase', (v) => {
    flame.renderSettings.palettePhase = v
  })
  applyNumber('paletteSpeed', (v) => {
    flame.renderSettings.paletteSpeed = v
  })
  applyNumber('densityEstimationQuality', (v) => {
    flame.renderSettings.densityEstimationQuality = v
  })
  applyNumber('estimatorCurve', (v) => {
    flame.renderSettings.estimatorCurve = v
  })
  applyString('drawMode', (v) => {
    flame.renderSettings.drawMode = v as 'light' | 'paint'
  })
  applyString('colorInitMode', (v) => {
    flame.renderSettings.colorInitMode = v as
      | 'colorInitZero'
      | 'colorInitPosition'
  })
  applyString('pointInitMode', (v) => {
    flame.renderSettings.pointInitMode =
      v as typeof flame.renderSettings.pointInitMode
  })

  // Color arrays
  {
    const track = trackMap.get('backgroundColor')
    if (track) {
      const value = resolveLoopValue(track.keyframes, frame, loop)
      if (
        value !== null &&
        Array.isArray(value) &&
        value.length === 3 &&
        typeof value[0] === 'number' &&
        typeof value[1] === 'number' &&
        typeof value[2] === 'number'
      ) {
        flame.renderSettings.backgroundColor = value
      }
    }
  }

  {
    const track = trackMap.get('edgeFadeColor')
    if (track) {
      const value = resolveLoopValue(track.keyframes, frame, loop)
      if (
        value !== null &&
        Array.isArray(value) &&
        value.length === 4 &&
        typeof value[0] === 'number' &&
        typeof value[1] === 'number' &&
        typeof value[2] === 'number' &&
        typeof value[3] === 'number'
      ) {
        // Lives under renderSettings (the schema's canonical location). The old
        // top-level `flame.edgeFadeColor` write was a dead prop the renderer
        // never read, so the animated edge fade never applied (bug exposed once
        // the typecheck stopped widening the flame type to `any` — issue #30).
        flame.renderSettings.edgeFadeColor = value
      }
    }
  }

  // Transform and variation paths
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transforms = flame.transforms as Record<string, any>
  for (const [path, track] of trackMap) {
    if (typeof path !== 'string') continue
    const value = resolveLoopValue(track.keyframes, frame, loop)
    if (value === null || typeof value !== 'number') continue

    const parts = path.split('.')
    // transform.{tid}.preAffine.{a-f} or transform.{tid}.postAffine.{a-f}
    if (
      parts[0] === 'transform' &&
      parts.length === 4 &&
      (parts[2] === 'preAffine' || parts[2] === 'postAffine')
    ) {
      const [, tid, affineType, param] = parts
      if (tid && param && transforms[tid]?.[affineType]) {
        transforms[tid][affineType][param] = value
      }
      continue
    }
    // transform.{tid}.color.{x,y}
    if (
      parts[0] === 'transform' &&
      parts.length === 4 &&
      parts[2] === 'color'
    ) {
      const [, tid, , param] = parts
      if (tid && param && transforms[tid]?.color) {
        transforms[tid].color[param] = value
      }
      continue
    }
    // transform.{tid}.probability
    if (
      parts[0] === 'transform' &&
      parts.length === 3 &&
      parts[2] === 'probability'
    ) {
      const [, tid] = parts
      if (tid && transforms[tid]) {
        transforms[tid].probability = value
      }
      continue
    }
    // transform.{tid}.colorSpeed
    if (
      parts[0] === 'transform' &&
      parts.length === 3 &&
      parts[2] === 'colorSpeed'
    ) {
      const [, tid] = parts
      if (tid && transforms[tid]) {
        transforms[tid].colorSpeed = value
      }
      continue
    }
    // {tid}.{vid}.{paramName} — variation param
    if (
      parts.length === 3 &&
      parts[0] !== 'transform' &&
      parts[0] !== 'camera'
    ) {
      const [tid, vid, paramName] = parts
      const variation = transforms[tid!]?.variations?.[vid!]
      if (variation) {
        if (!variation.params) {
          variation.params = {}
        }
        variation.params[paramName!] = value
      }
      continue
    }
    // {tid}.{vid} — variation weight
    if (
      parts.length === 2 &&
      parts[0] !== 'transform' &&
      parts[0] !== 'camera'
    ) {
      const [tid, vid] = parts
      const variation = transforms[tid!]?.variations?.[vid!]
      if (variation) {
        variation.weight = value
      }
    }
  }

  // Final transform. Seed a dimension-appropriate identity: a 3D flame needs a
  // 12-param (a–l) affine — seeding a 2D one here produced 3D flames with an
  // invalid 2D finalTransform that then failed strict schema validation on
  // re-import.
  if (!flame.finalTransform) {
    flame.finalTransform =
      flame.renderSettings.dimensions === 3
        ? {
            a: 1,
            b: 0,
            c: 0,
            d: 0,
            e: 0,
            f: 1,
            g: 0,
            h: 0,
            i: 0,
            j: 0,
            k: 1,
            l: 0,
          }
        : { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  }
  applyNumber('finalTransform.a', (v) => {
    flame.finalTransform!.a = v
  })
  applyNumber('finalTransform.b', (v) => {
    flame.finalTransform!.b = v
  })
  applyNumber('finalTransform.c', (v) => {
    flame.finalTransform!.c = v
  })
  applyNumber('finalTransform.d', (v) => {
    flame.finalTransform!.d = v
  })
  applyNumber('finalTransform.e', (v) => {
    flame.finalTransform!.e = v
  })
  applyNumber('finalTransform.f', (v) => {
    flame.finalTransform!.f = v
  })
}

/**
 * Applies timeline values to a flame descriptor for the current frame.
 */
export function applyTimelineToFlame(
  timeline: TimelineState,
  flame: FlameDescriptor,
): void {
  const tracks = timeline.tracks()
  applyTracksToFlame(
    tracks,
    flame,
    timeline.currentFrame(),
    loopOptsFromConfig(timeline.config(), tracks),
  )
}

/**
 * Applies timeline values to a flame descriptor for a specific frame number.
 */
export function applyTimelineToFlameAtFrame(
  // Only the tracks/config getters are read here, so accept any object that
  // supplies them (e.g. the lightweight stub the export-preview gallery builds)
  // rather than forcing a full TimelineState and an `as any` cast at the call.
  timeline: Pick<TimelineState, 'tracks' | 'config'>,
  flame: FlameDescriptor,
  frame: number,
): void {
  const tracks = timeline.tracks()
  applyTracksToFlame(
    tracks,
    flame,
    frame,
    loopOptsFromConfig(timeline.config(), tracks),
  )
}
