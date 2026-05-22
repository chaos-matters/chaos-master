import { createSignal } from 'solid-js'
import { applyEasing, clamp } from './easing'

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

export type { PointInitMode }

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
    window as unknown as { currentTimeline?: WindowTimelineState }
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

export interface FlameDescriptor {
  renderSettings: {
    exposure: number
    skipIters: number
    drawMode: 'light' | 'paint'
    colorInitMode: 'colorInitZero' | 'colorInitPosition'
    pointInitMode: PointInitMode
    vibrancy: number
    backgroundColor?: [number, number, number]
    camera?: {
      zoom: number
      position: [number, number]
      rotation?: number
    }
    palettePhase?: number
    paletteSpeed?: number
    paletteMode?: number
    densityEstimationQuality?: number
    contrast?: number
    gamma?: number
    highlightPower?: number
  }
  transforms: Record<string, unknown>
  metadata: {
    author: string
  }
  edgeFadeColor?: [number, number, number, number]
}

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
}

export type TimelineTrack = {
  parameterPath: string
  keyframes: KeyframeData[]
}

export type TimelineConfig = {
  fps: number
  timeScale: number
  startFrame: number
  endFrame: number
  loop: boolean
}

function defaultConfig(): TimelineConfig {
  return { fps: 30, timeScale: 1, startFrame: 0, endFrame: 90, loop: true }
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

  // Find surrounding keyframes
  let prev = sorted[0]!
  let next = sorted[sorted.length - 1]!
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!
    const after = sorted[i + 1]!
    if (current.frame <= frame && after.frame >= frame) {
      prev = current
      next = after
      break
    }
  }

  const frameRange = next.frame - prev.frame
  if (frameRange === 0) return prev.value

  const rawT = (frame - prev.frame) / frameRange
  const t = clamp(rawT, 0, 1)

  // Type guard: if values are numbers, use lerp with easing, otherwise interpolate strings
  if (typeof prev.value === 'number' && typeof next.value === 'number') {
    // Use the easing curve from the next keyframe (or default to linear)
    const easingCurve = next.easing ?? 'linear'
    const easedT = applyEasing(t, easingCurve)
    return prev.value + (next.value - prev.value) * easedT
  }

  // Interpolate array values (RGB/RGBA colors) with easing
  if (
    Array.isArray(prev.value) &&
    Array.isArray(next.value) &&
    prev.value.length === next.value.length
  ) {
    const easingCurve = next.easing ?? 'linear'
    const easedT = applyEasing(t, easingCurve)
    return prev.value.map(
      (v, i) => v + ((next.value as number[])[i]! - v) * easedT,
    ) as [number, number, number] | [number, number, number, number]
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
  const [autoKeyframe, setAutoKeyframe] = createSignal(false)
  const [removeMode, setRemoveMode] = createSignal(false)
  const [animationEnabled, setAnimationEnabled] = createSignal(false)

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

  // Undo/redo stacks for timeline operations
  const undoStack: (readonly TimelineTrack[])[] = []
  const redoStack: (readonly TimelineTrack[])[] = []

  function pushUndo() {
    undoStack.push(
      tracks().map((t) => ({
        ...t,
        keyframes: t.keyframes.map((kf) => ({ ...kf })),
      })),
    )
    redoStack.length = 0
  }

  function timelineUndo() {
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
        const newKeyframes = existingKf
          ? track.keyframes.map((kf) =>
              kf.frame === frame
                ? { frame, value, easing: easing ?? kf.easing }
                : kf,
            )
          : [...track.keyframes, { frame, value, easing }]
        return [
          ...prev.slice(0, ti),
          { parameterPath, keyframes: newKeyframes },
          ...prev.slice(ti + 1),
        ]
      }
      return [...prev, { parameterPath, keyframes: [{ frame, value, easing }] }]
    })
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
  ) {
    pushUndo()
    addKeyframeImpl(parameterPath, frame, value, easing)
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
  ) {
    addKeyframeImpl(parameterPath, frame, value, easing)
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
    )
    addKeyframeImpl(parameterPath, splitFrame, keyframe.value, keyframe.easing)

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
    return resolveKeyframeValue(track.keyframes, frame)
  }

  function advanceFrame() {
    const cfg = config()
    const next = currentFrame() + 1
    if (next > cfg.endFrame) {
      if (cfg.loop) {
        setCurrentFrame(cfg.startFrame)
      } else {
        setCurrentFrame(cfg.startFrame)
        setIsPlaying(false)
      }
    } else {
      setCurrentFrame(next)
    }
  }

  function goBackFrame() {
    const cfg = config()
    const prev = currentFrame() - 1
    if (prev < cfg.startFrame) {
      setCurrentFrame(cfg.loop ? cfg.endFrame : cfg.startFrame)
    } else {
      setCurrentFrame(prev)
    }
  }

  function goToFrame(frame: number) {
    setCurrentFrame(clamp(frame, config().startFrame, config().endFrame))
  }

  function play() {
    const cfg = config()
    if (!cfg.loop && currentFrame() >= cfg.endFrame) {
      setCurrentFrame(cfg.startFrame)
    }
    setIsPlaying(true)
  }

  function pause() {
    setIsPlaying(false)
  }

  function togglePlay() {
    setIsPlaying(!isPlaying())
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
      pushUndo()
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
    addKeyframeImpl(parameterPath, newFrame, keyframe.value, keyframe.easing)
  }

  function clearAllTracks() {
    if (tracks().length === 0) return
    pushUndo()
    setTracks([])
  }

  /** Replace all tracks with deep-cloned copies (unified with addKeyframeImpl). */
  function loadTracks(incoming: readonly TimelineTrack[]) {
    setTracks(() =>
      incoming.map((t) => ({
        parameterPath: t.parameterPath,
        keyframes: t.keyframes.map((kf) => ({
          frame: kf.frame,
          value: kf.value,
          easing: kf.easing,
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
    isPlaying,
    setIsPlaying,
    isScrubbing,
    setIsScrubbing,
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
    getKeysForFrame,
    hasKeyframeAtFrame,
    getKeyframeAtFrame,
    getOverlappingKeyframes,
    addKeyframeWithOverlapCheck,
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
    loadTracks,
    clearAllTracks,
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

function applyTracksToFlame(
  tracks: TimelineTrack[],
  flame: FlameDescriptor,
  frame: number,
): void {
  const trackMap = new Map(tracks.map((t) => [t.parameterPath, t] as const))

  function applyNumber(path: string, setter: (v: number) => void) {
    const track = trackMap.get(path)
    if (!track) return
    const value = resolveKeyframeValue(track.keyframes, frame)
    if (value !== null && typeof value === 'number') setter(value)
  }

  function applyString(path: string, setter: (v: string) => void) {
    const track = trackMap.get(path)
    if (!track) return
    const value = resolveKeyframeValue(track.keyframes, frame)
    if (value !== null && typeof value === 'string') setter(value)
  }

  // Camera
  if (flame.renderSettings.camera?.position) {
    applyNumber('camera.x', (v) => {
      flame.renderSettings.camera!.position[0] = v
    })
    applyNumber('camera.y', (v) => {
      flame.renderSettings.camera!.position[1] = v
    })
  }
  if (flame.renderSettings.camera) {
    applyNumber('camera.zoom', (v) => {
      flame.renderSettings.camera!.zoom = v
    })
    applyNumber('camera.rotation', (v) => {
      flame.renderSettings.camera!.rotation = v
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
  applyNumber('palettePhase', (v) => {
    flame.renderSettings.palettePhase = v
  })
  applyNumber('paletteSpeed', (v) => {
    flame.renderSettings.paletteSpeed = v
  })
  applyNumber('densityEstimationQuality', (v) => {
    flame.renderSettings.densityEstimationQuality = v
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
    flame.renderSettings.pointInitMode = v as PointInitMode
  })

  // Color arrays
  {
    const track = trackMap.get('backgroundColor')
    if (track) {
      const value = resolveKeyframeValue(track.keyframes, frame)
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
      const value = resolveKeyframeValue(track.keyframes, frame)
      if (value !== null && Array.isArray(value) && value.length === 4) {
        flame.edgeFadeColor = value
      }
    }
  }

  // Transform and variation paths
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transforms = flame.transforms as Record<string, any>
  for (const [path, track] of trackMap) {
    if (typeof path !== 'string') continue
    const value = resolveKeyframeValue(track.keyframes, frame)
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
}

/**
 * Applies timeline values to a flame descriptor for the current frame.
 */
export function applyTimelineToFlame(
  timeline: TimelineState,
  flame: FlameDescriptor,
): void {
  applyTracksToFlame(timeline.tracks(), flame, timeline.currentFrame())
}

/**
 * Applies timeline values to a flame descriptor for a specific frame number.
 */
export function applyTimelineToFlameAtFrame(
  timeline: TimelineState,
  flame: FlameDescriptor,
  frame: number,
): void {
  applyTracksToFlame(timeline.tracks(), flame, frame)
}
