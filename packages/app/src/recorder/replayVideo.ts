// Register every command a session may contain before building the isolated
// replay world. MainWorkspace imports the same barrel, but background exports
// must not depend on the editor having mounted first.
import '@/commands/builtins'
import { vec2f } from 'typegpu/data'
import { executeReplayCommand, preflightReplayCommand, } from '@/commands/registry'
import { qualityPresets } from '@/components/Quality/QualityPresets'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { defaultTimelineConfig } from '@/flame/schema/timeline'
import { deepClone } from '@/utils/clone'
import { applyTracksToFlame, getUserEndFrame, loopOptsFromConfig, resolveLoopValue, } from '@/utils/timeline'
import { narrationHoldFor, stepGapMs } from './player'
import { paletteRestoreColorsAfterReplayCommand } from './replayPaletteState'
import { validateSession } from './schema'
import type { RecordedAction, RecordedSession, SessionViewSnapshot, TransformColorSnapshot, } from './schema'
import type { SonificationSnapshot } from './sonificationState'
import type { CommandContext } from '@/commands/types'
import type { Palette } from '@/flame/colorMap'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { HistorySetter } from '@/utils/createStoreHistory'
import type { AnimationJobSpec } from '@/utils/exportJobs'

export const REPLAY_VIDEO_FPS = 24
/**
 * Artwork replays use the same landscape framing the editor is authored in.
 * Camera2D fixes the vertical world extent and widens horizontally with the
 * canvas aspect, so rendering onto a square plate crops the left and right of
 * an otherwise unchanged flame. Keep this explicit until composition presets
 * can offer deliberate fit/crop controls for square and portrait exports.
 */
export const REPLAY_VIDEO_DIMENSIONS = {
  width: 1920,
  height: 1080,
} as const
export const REPLAY_VIDEO_LEAD_IN_MS = 650
export const REPLAY_VIDEO_TAIL_MS = 1400
export const MAX_REPLAY_VIDEO_DURATION_MS = 120_000

// Custom variation definitions are global, executable WGSL today; they are not
// part of the portable recorder schema. Publishing a take that references one
// would therefore depend on whichever local registry happens to render it.
const CUSTOM_VARIATION_TYPE_PREFIX = 'custom_'

export type ReplayVideoSpec = {
  version: 1
  playbackSpeed: number
  leadInMs: number
  tailMs: number
}

export type ReplayVideoSchedule = {
  fps: number
  actionTimesMs: number[]
  /** One distinct output frame per authored step, even for zero-gap actions. */
  actionFrames: number[]
  durationMs: number
  totalFrames: number
}

export type ReplayVideoFrameState = {
  flame: FlameDescriptor
  palette: Palette | undefined
  blendFlame: FlameDescriptor | undefined
  blendWeight: number
  adaptiveFilter: boolean
  stochasticFilter: boolean
  action: RecordedAction | undefined
  actionIndex: number
}

export type ReplayVideoDriver = {
  readonly session: RecordedSession
  /** State after action `index`; -1 is the recorded baseline. */
  advanceTo: (index: number) => ReplayVideoFrameState
  reset: () => ReplayVideoFrameState
}

/** State identity that actually requires a fresh GPU render. Captions and
 * presentation-only commands intentionally do not participate, so the video
 * renderer can reuse the last artwork frame for those steps. */
export function replayVideoVisualFingerprint(
  state: ReplayVideoFrameState,
): string {
  return JSON.stringify({
    renderSettings: state.flame.renderSettings,
    transforms: state.flame.transforms,
    finalTransform: state.flame.finalTransform,
    palette: state.palette,
    blendFlame: state.blendFlame,
    blendWeight: state.blendWeight,
    adaptiveFilter: state.adaptiveFilter,
    stochasticFilter: state.stochasticFilter,
  })
}

type TimelineSnapshotKeyframe =
  TimelineSnapshot['tracks'][number]['keyframes'][number]
type TimelineSnapshotValue = TimelineSnapshotKeyframe['value']

type MutableTimeline = {
  snapshot: TimelineSnapshot
}

function nextSetterValue<T>(current: T, next: T | ((value: T) => T)): T {
  return typeof next === 'function' ? (next as (value: T) => T)(current) : next
}

export function replayVideoInitialTimelineSnapshot(
  session: RecordedSession,
): TimelineSnapshot {
  if (session.initialTimeline) return deepClone(session.initialTimeline)
  return {
    config: { ...defaultTimelineConfig(), timeScale: 1 },
    currentFrame: 0,
    animationEnabled: false,
    autoKeyframe: true,
    previewHeld: false,
    tracks: [],
  }
}

function initialViewSnapshot(session: RecordedSession): SessionViewSnapshot {
  return deepClone(
    session.initialView ?? {
      qualityPreset: 'high',
      pixelRatio: 1,
      adaptiveFilter: true,
      stochasticFilter: false,
      flyMode: false,
      showTimeline: false,
      sidebarOpen: true,
      paletteRestoreColors: {},
    },
  )
}

function initialAudioSnapshot(session: RecordedSession): AudioWiringSnapshot {
  return deepClone(
    session.initialAudio ?? {
      mapping: { preset: 'custom', mappings: [] },
      enabled: false,
      source: 'file',
    },
  )
}

function findKeyframe(
  timeline: MutableTimeline,
  path: string,
  frame: number,
): TimelineSnapshotKeyframe | undefined {
  return timeline.snapshot.tracks
    .find((track) => track.parameterPath === path)
    ?.keyframes.find((keyframe) => keyframe.frame === frame)
}

function setKeyframe(
  timeline: MutableTimeline,
  path: string,
  frame: number,
  value: TimelineSnapshotValue,
  easing?: string,
  interp?: string,
): void {
  const tracks = timeline.snapshot.tracks
  let track = tracks.find((candidate) => candidate.parameterPath === path)
  if (!track) {
    track = { parameterPath: path, keyframes: [] }
    tracks.push(track)
  }
  const existing = track.keyframes.find((keyframe) => keyframe.frame === frame)
  if (existing) {
    existing.value = deepClone(value)
    if (easing !== undefined) {
      existing.easing = easing as TimelineSnapshotKeyframe['easing']
    }
    if (interp !== undefined) {
      existing.interp = interp as TimelineSnapshotKeyframe['interp']
    }
  } else {
    track.keyframes.push({
      frame,
      value: deepClone(value),
      easing: easing as TimelineSnapshotKeyframe['easing'],
      interp: interp as TimelineSnapshotKeyframe['interp'],
    })
  }
}

function removeKeyframe(
  timeline: MutableTimeline,
  path: string,
  frame: number,
): void {
  timeline.snapshot.tracks = timeline.snapshot.tracks
    .map((track) =>
      track.parameterPath === path
        ? {
            ...track,
            keyframes: track.keyframes.filter(
              (keyframe) => keyframe.frame !== frame,
            ),
          }
        : track,
    )
    .filter((track) => track.keyframes.length > 0)
}

function writeTimelineValue(
  flame: FlameDescriptor,
  path: string,
  value: TimelineSnapshotValue,
): void {
  // Reuse the renderer's canonical path application for camera, transform,
  // variation and final-transform tracks.
  applyTracksToFlame(
    [
      {
        parameterPath: path,
        keyframes: [{ frame: 0, value }],
      },
    ],
    flame,
    0,
  )

  // A few first-level settings are intentionally generic in the editor and
  // are newer than applyTracksToFlame's explicit list. Preserve those too.
  if (path === 'blendWeight' && typeof value === 'number') {
    flame.renderSettings.blendWeight = value
    return
  }
  if (!path.includes('.') && path in flame.renderSettings) {
    ;(flame.renderSettings as unknown as Record<string, unknown>)[path] =
      deepClone(value)
  }
}

function applyTimelinePose(
  base: FlameDescriptor,
  timeline: TimelineSnapshot,
): FlameDescriptor {
  const posed = deepClone(base)
  if (!timeline.animationEnabled || !timeline.previewHeld) return posed
  const frame = timeline.currentFrame ?? timeline.config.startFrame
  applyTracksToFlame(
    timeline.tracks,
    posed,
    frame,
    loopOptsFromConfig(timeline.config, timeline.tracks),
  )

  // Keep generic first-level render settings and blendWeight in sync with the
  // live editor. applyTracksToFlame owns the structured path vocabulary.
  for (const track of timeline.tracks) {
    if (track.parameterPath.includes('.')) continue
    const value = resolveLoopValue(
      track.keyframes,
      frame,
      loopOptsFromConfig(timeline.config, timeline.tracks),
    )
    if (
      value !== null &&
      (track.parameterPath === 'blendWeight' ||
        track.parameterPath in posed.renderSettings)
    ) {
      ;(posed.renderSettings as unknown as Record<string, unknown>)[
        track.parameterPath
      ] = deepClone(value)
    }
  }
  return posed
}

function paletteFromFlame(flame: FlameDescriptor): Palette | undefined {
  const palette = flame.renderSettings.palette
  if (!palette) return undefined
  return {
    id: palette.id,
    name: palette.name,
    entries: palette.entries.map((entry) => ({ ...entry })),
    source: 'imported',
  }
}

function flameUsesCustomVariation(flame: FlameDescriptor): boolean {
  return Object.values(flame.transforms).some((transform) =>
    Object.values(transform.variations).some((variation) =>
      variation.type.startsWith(CUSTOM_VARIATION_TYPE_PREFIX),
    ),
  )
}

export function assertReplayVideoStatePortable(
  state: ReplayVideoFrameState,
  actionIndex: number,
): void {
  if (
    flameUsesCustomVariation(state.flame) ||
    (state.blendFlame !== undefined &&
      flameUsesCustomVariation(state.blendFlame))
  ) {
    const atStep =
      actionIndex < 0 ? 'recording baseline' : `step ${actionIndex + 1}`
    throw new Error(
      `Replay video cannot yet package custom variation code used by the ${atStep}. Replace it with built-in variations before exporting this take.`,
    )
  }
}

function valueReferencesCustomVariation(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) {
    return value.some(valueReferencesCustomVariation)
  }
  const record = value as Record<string, unknown>
  if (
    typeof record.type === 'string' &&
    record.type.startsWith(CUSTOM_VARIATION_TYPE_PREFIX)
  ) {
    return true
  }
  return Object.values(record).some(valueReferencesCustomVariation)
}

function actionReferencesCustomVariation(action: RecordedAction): boolean {
  if (
    action.id === 'flame.addVariation' &&
    typeof action.args[1] === 'string' &&
    action.args[1].startsWith(CUSTOM_VARIATION_TYPE_PREFIX)
  ) {
    return true
  }
  // Randomizer configs carry variation ids as strings rather than descriptor
  // objects. Current UI records their finished flame, but keep imported legacy
  // actions honest too.
  if (action.id === 'flame.randomize' || action.id === 'flame.mutate') {
    const stack = [...action.args]
    while (stack.length > 0) {
      const value = stack.pop()
      if (
        typeof value === 'string' &&
        value.startsWith(CUSTOM_VARIATION_TYPE_PREFIX)
      ) {
        return true
      }
      if (Array.isArray(value)) stack.push(...value)
      else if (value !== null && typeof value === 'object') {
        stack.push(...Object.values(value))
      }
    }
  }
  return action.args.some(valueReferencesCustomVariation)
}

function buildScheduleSpec(
  playbackSpeed: number,
  leadInMs = REPLAY_VIDEO_LEAD_IN_MS,
  tailMs = REPLAY_VIDEO_TAIL_MS,
): ReplayVideoSpec {
  if (!Number.isFinite(playbackSpeed) || playbackSpeed <= 0) {
    throw new Error('Replay video speed must be greater than zero')
  }
  return {
    version: 1,
    playbackSpeed,
    leadInMs,
    tailMs,
  }
}

export function createReplayVideoSchedule(
  session: RecordedSession,
  playbackSpeed = 1,
  fps = REPLAY_VIDEO_FPS,
  leadInMs = REPLAY_VIDEO_LEAD_IN_MS,
  tailMs = REPLAY_VIDEO_TAIL_MS,
): ReplayVideoSchedule {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('Replay video FPS must be greater than zero')
  }
  const spec = buildScheduleSpec(playbackSpeed, leadInMs, tailMs)
  let cursor = spec.leadInMs
  const actionTimesMs: number[] = []
  const actionFrames: number[] = []
  let previousActionFrame = -1
  for (let index = 0; index < session.actions.length; index++) {
    const action = session.actions[index]!
    const previous = index > 0 ? session.actions[index - 1] : undefined
    // The same rule the live player uses, not a copy of it: the interface
    // exporter validates this schedule and then screen-records the player, so
    // the two drifting apart overruns the capture budget.
    cursor += stepGapMs(previous, action, spec.playbackSpeed)
    // Two companion commands can share a timestamp. A video cannot represent
    // both on one frame, so advance at least one frame and never silently skip
    // an authored step/caption.
    const frame = Math.max(
      previousActionFrame + 1,
      Math.ceil((cursor * fps) / 1000),
    )
    previousActionFrame = frame
    actionFrames.push(frame)
    actionTimesMs.push((frame * 1000) / fps)
  }
  const finalActionTime = actionTimesMs.at(-1) ?? spec.leadInMs
  // A closing sentence has no step after it to be the dwell on, so it would
  // otherwise get the bare tail — on the one line the lesson was building to.
  const closing = session.actions.at(-1)
  const effectiveTailMs = Math.max(
    spec.tailMs,
    (closing === undefined
      ? undefined
      : narrationHoldFor(closing, spec.playbackSpeed)) ?? 0,
  )
  const durationMs = Math.max(cursor, finalActionTime) + effectiveTailMs
  if (durationMs > MAX_REPLAY_VIDEO_DURATION_MS) {
    throw new Error(
      `Replay video is ${Math.ceil(durationMs / 1000)}s; the current limit is ${MAX_REPLAY_VIDEO_DURATION_MS / 1000}s. Choose a faster replay speed, shorten authored holds, or split the take — steps are paced to be watchable, so a long take runs longer than it was recorded.`,
    )
  }
  return {
    fps,
    actionTimesMs,
    actionFrames,
    durationMs,
    // Keep the final authored action representable even when a future caller
    // deliberately asks for no tail. Frame indexes are zero-based, so an
    // action landing on frame N needs at least N + 1 output frames.
    totalFrames: Math.max(
      1,
      (actionFrames.at(-1) ?? -1) + 1,
      Math.ceil((durationMs * fps) / 1000),
    ),
  }
}

export function replayActionIndexAtFrame(
  schedule: ReplayVideoSchedule,
  frameIndex: number,
): number {
  let result = -1
  for (let index = 0; index < schedule.actionFrames.length; index++) {
    if (schedule.actionFrames[index]! > frameIndex) break
    result = index
  }
  return result
}

/** Number of consecutive frames sharing the same semantic replay state. */
export function replayFramesInStateRun(
  schedule: ReplayVideoSchedule,
  frameIndex: number,
): number {
  const actionIndex = replayActionIndexAtFrame(schedule, frameIndex)
  let count = 1
  while (
    frameIndex + count < schedule.totalFrames &&
    replayActionIndexAtFrame(schedule, frameIndex + count) === actionIndex
  ) {
    count++
  }
  return count
}

export function createReplayVideoDriver(
  inputSession: RecordedSession,
): ReplayVideoDriver {
  const validatedSession = validateSession(deepClone(inputSession))
  if (!validatedSession) {
    throw new Error('The recording is not a valid replay session')
  }
  const session: RecordedSession = validatedSession
  for (let index = 0; index < session.actions.length; index++) {
    const action = session.actions[index]!
    const reason = preflightReplayCommand(action.id, action.args)
    if (reason !== undefined) {
      throw new Error(`Step ${index + 1}: ${reason}`)
    }
  }

  let flame = deepClone(session.initial)
  const timeline: MutableTimeline = {
    snapshot: replayVideoInitialTimelineSnapshot(session),
  }
  let view = initialViewSnapshot(session)
  let audio = initialAudioSnapshot(session)
  let sonification: SonificationSnapshot | undefined =
    session.initialSonification === undefined
      ? undefined
      : deepClone(session.initialSonification)
  let paletteRestoreColors: TransformColorSnapshot = deepClone(
    view.paletteRestoreColors ?? {},
  )
  let sidebarOpen = view.sidebarOpen
  let lastApplied = -1

  const setFlameDescriptor: HistorySetter<FlameDescriptor> = (mutate) => {
    const draft = deepClone(flame)
    const replacement = mutate(draft)
    flame = deepClone(replacement ?? draft)
  }

  const context: CommandContext = {
    flameDescriptor: () => flame,
    setFlameDescriptor,
    paletteRestoreColors: () => paletteRestoreColors,
    blendFlame: () =>
      tryValidateFlame(deepClone(flame.renderSettings.blendFlame)),
    setBlendFlame: (next) => {
      setFlameDescriptor((draft) => {
        if (next === undefined) delete draft.renderSettings.blendFlame
        else draft.renderSettings.blendFlame = deepClone(next)
      })
    },
    blendWeight: () => flame.renderSettings.blendWeight ?? 0,
    setBlendWeight: (next) => {
      setFlameDescriptor((draft) => {
        draft.renderSettings.blendWeight = next
      })
    },
    pixelRatio: () => view.pixelRatio ?? 1,
    setPixelRatio: (next) => {
      const value = nextSetterValue(view.pixelRatio ?? 1, next)
      view.pixelRatio = value as 1 | 0.5 | 0.25
      return value
    },
    zoom: () => flame.renderSettings.camera.zoom,
    setZoom: (next) => {
      const value = nextSetterValue(flame.renderSettings.camera.zoom, next)
      setFlameDescriptor((draft) => {
        draft.renderSettings.camera.zoom = value
      })
      return value
    },
    position: () => vec2f(...flame.renderSettings.camera.position),
    setPosition: (next) => {
      const current = vec2f(...flame.renderSettings.camera.position)
      const value = nextSetterValue(current, next)
      setFlameDescriptor((draft) => {
        draft.renderSettings.camera.position = [value[0], value[1]]
      })
      return value
    },
    sidebar: {
      open: () => sidebarOpen,
      setOpen: (next) => {
        sidebarOpen = nextSetterValue(sidebarOpen, next)
        return sidebarOpen
      },
    },
    timeline: {
      tracks: () => timeline.snapshot.tracks,
      setTracks: (next) => {
        timeline.snapshot.tracks = deepClone(
          nextSetterValue(timeline.snapshot.tracks, next),
        )
        return timeline.snapshot.tracks
      },
      animationEnabled: () => timeline.snapshot.animationEnabled ?? false,
      setAnimationEnabled: (next) => {
        const value = nextSetterValue(
          timeline.snapshot.animationEnabled ?? false,
          next,
        )
        timeline.snapshot.animationEnabled = value
        return value
      },
      duration: () => timeline.snapshot.config.endFrame,
      setDuration: (duration) => {
        timeline.snapshot.config.endFrame = duration
      },
      currentFrame: () =>
        timeline.snapshot.currentFrame ?? timeline.snapshot.config.startFrame,
      setCurrentFrame: (next) => {
        const current =
          timeline.snapshot.currentFrame ?? timeline.snapshot.config.startFrame
        const value = Math.max(
          timeline.snapshot.config.startFrame,
          Math.min(
            timeline.snapshot.config.endFrame,
            nextSetterValue(current, next),
          ),
        )
        timeline.snapshot.currentFrame = value
        timeline.snapshot.previewHeld = true
        return value
      },
      setPreviewHeld: (next) => {
        const value = nextSetterValue(
          timeline.snapshot.previewHeld ?? false,
          next,
        )
        timeline.snapshot.previewHeld = value
        return value
      },
      play: () => {},
      setLoop: (loop) => {
        timeline.snapshot.config.loop = loop
      },
      setFps: (fps) => {
        timeline.snapshot.config.fps = fps
      },
      setAutoFps: (enabled) => {
        timeline.snapshot.config.autoFps = enabled
      },
      setTimeScale: (scale) => {
        timeline.snapshot.config.timeScale = scale
      },
      addKeyframe: (path, frame, value, easing, interp) => {
        setKeyframe(timeline, path, frame, value, easing, interp)
        if (frame === timeline.snapshot.currentFrame) {
          writeTimelineValue(flame, path, value)
        }
      },
      edit: {
        removeKeyframe: (path, frame) => {
          removeKeyframe(timeline, path, frame)
        },
        setKeyframeValue: (path, frame, value, easing, interp) => {
          setKeyframe(timeline, path, frame, value, easing, interp)
          if (frame === timeline.snapshot.currentFrame) {
            writeTimelineValue(flame, path, value)
          }
        },
        setKeyframeInterp: (path, frame, interp) => {
          const keyframe = findKeyframe(timeline, path, frame)
          if (keyframe) {
            keyframe.interp = interp as TimelineSnapshotKeyframe['interp']
          }
        },
        moveKeyframe: (path, from, to) => {
          const keyframe = findKeyframe(timeline, path, from)
          if (!keyframe) return
          removeKeyframe(timeline, path, from)
          setKeyframe(
            timeline,
            path,
            to,
            keyframe.value,
            keyframe.easing,
            keyframe.interp,
          )
        },
        relocateKeyframe: (path, from, to) => {
          if (findKeyframe(timeline, path, to)) return
          const keyframe = findKeyframe(timeline, path, from)
          if (!keyframe) return
          removeKeyframe(timeline, path, from)
          setKeyframe(
            timeline,
            path,
            to,
            keyframe.value,
            keyframe.easing,
            keyframe.interp,
          )
        },
        addKeyframeValuesAtFrame: (writes, frame) => {
          for (const [path, value] of writes) {
            setKeyframe(timeline, path, frame, value)
            if (frame === timeline.snapshot.currentFrame) {
              writeTimelineValue(flame, path, value)
            }
          }
        },
        removeTrack: (path) => {
          timeline.snapshot.tracks = timeline.snapshot.tracks.filter(
            (track) => track.parameterPath !== path,
          )
        },
        clearTracks: () => {
          timeline.snapshot.tracks = []
          timeline.snapshot.previewHeld = false
        },
        setLoopMode: (mode) => {
          const config = timeline.snapshot.config
          config.loopMode = mode
          if (mode !== 'off') config.loop = true
          if (mode === 'seamless') {
            const userEnd = getUserEndFrame(
              timeline.snapshot.tracks,
              config.startFrame,
            )
            const span = Math.max(1, userEnd - config.startFrame)
            if (config.endFrame <= userEnd) config.endFrame = userEnd + span
          }
        },
        setAutoKeyframe: (enabled) => {
          timeline.snapshot.autoKeyframe = enabled
        },
        snapshot: () => deepClone(timeline.snapshot),
        load: (snapshot) => {
          timeline.snapshot = deepClone(snapshot)
        },
      },
    },
    audio: {
      snapshot: () => deepClone(audio),
      canEnable: () => false,
      setMapping: (mapping) => {
        audio.mapping = deepClone(mapping)
      },
      setEnabled: (enabled) => {
        // Session files carry no resource bytes. Keep the data state but never
        // attach an unrelated runtime resource to a deterministic export.
        audio.enabled = enabled
      },
      setSource: (source) => {
        audio.source = source
      },
    },
    sonification: {
      snapshot: () =>
        deepClone(
          sonification ?? {
            version: 1,
            enabled: false,
            config: {
              model: 'orchestral',
              volume: 0.5,
              updateRate: 30,
              scale: 'pentatonicMajor',
              voiceCount: 6,
              harmonicDensity: 1,
              triggerRate: 4,
              spatialSpread: 0.5,
              reverbMix: 0.25,
            },
          },
        ),
      setConfig: (config) => {
        sonification = {
          version: 1,
          enabled: sonification?.enabled ?? false,
          config: deepClone(config),
        }
      },
      setEnabled: (enabled) => {
        if (sonification) sonification.enabled = enabled
      },
    },
    view: {
      setQualityPreset: (key) => {
        if (key in qualityPresets) view.qualityPreset = key
      },
      setAdaptiveFilter: (enabled) => {
        view.adaptiveFilter = enabled
      },
      setStochasticFilter: (enabled) => {
        view.stochasticFilter = enabled
      },
      setFlyMode: (enabled) => {
        view.flyMode = enabled
      },
      setShowTimeline: (shown) => {
        view.showTimeline = shown
      },
    },
    camera: {
      center: () => {
        setFlameDescriptor((draft) => {
          draft.renderSettings.camera.position = [0, 0]
          draft.renderSettings.camera.zoom = 1
        })
      },
    },
    modal: { open: () => {} },
  }

  function frameState(index: number): ReplayVideoFrameState {
    const posed = applyTimelinePose(flame, timeline.snapshot)
    const blendDescriptor = posed.renderSettings.blendFlame
    const blendFlame =
      blendDescriptor === undefined
        ? undefined
        : tryValidateFlame(deepClone(blendDescriptor))
    return {
      flame: posed,
      palette: paletteFromFlame(posed),
      blendFlame,
      blendWeight: posed.renderSettings.blendWeight ?? 0,
      adaptiveFilter: view.adaptiveFilter,
      stochasticFilter: view.stochasticFilter,
      action: index < 0 ? undefined : session.actions[index],
      actionIndex: index,
    }
  }

  function reset(): ReplayVideoFrameState {
    flame = deepClone(session.initial)
    timeline.snapshot = replayVideoInitialTimelineSnapshot(session)
    view = initialViewSnapshot(session)
    audio = initialAudioSnapshot(session)
    sonification =
      session.initialSonification === undefined
        ? undefined
        : deepClone(session.initialSonification)
    paletteRestoreColors = deepClone(view.paletteRestoreColors ?? {})
    sidebarOpen = view.sidebarOpen
    lastApplied = -1
    return frameState(-1)
  }

  function advanceTo(index: number): ReplayVideoFrameState {
    const target = Math.min(
      session.actions.length - 1,
      Math.max(-1, Math.floor(index)),
    )
    if (target < lastApplied) reset()
    for (
      let actionIndex = lastApplied + 1;
      actionIndex <= target;
      actionIndex++
    ) {
      const action = session.actions[actionIndex]!
      const nextPaletteRestoreColors = paletteRestoreColorsAfterReplayCommand(
        action.id,
        action.args,
        flame,
        paletteRestoreColors,
      )
      if (
        !executeReplayCommand(action.id, context, ...deepClone(action.args))
      ) {
        throw new Error(`Step ${actionIndex + 1} could not be replayed`)
      }
      paletteRestoreColors = deepClone(nextPaletteRestoreColors)
      lastApplied = actionIndex
    }
    return frameState(target)
  }

  return { session, advanceTo, reset }
}

export function createReplayVideoSpec(playbackSpeed = 1): ReplayVideoSpec {
  return buildScheduleSpec(playbackSpeed)
}

/** Build a detached, background-export job from the edited replay session. */
export function createReplayVideoJobSpec(
  inputSession: RecordedSession,
  playbackSpeed = 1,
): AnimationJobSpec {
  const session = validateSession(deepClone(inputSession))
  if (!session) throw new Error('The recording is not a valid replay session')
  if (session.unnamedWriteCount > 0) {
    throw new Error(
      `This take has ${session.unnamedWriteCount} uncaptured edit${session.unnamedWriteCount === 1 ? '' : 's'}. Record a clean take before publishing it as video.`,
    )
  }
  if (session.actions.length === 0) {
    throw new Error('This take has no authored steps to publish as video.')
  }
  if (valueReferencesCustomVariation(session.initial)) {
    throw new Error(
      'Replay video cannot yet package custom variation code used by the recording baseline. Replace it with built-in variations before exporting this take.',
    )
  }
  const customVariationStep = session.actions.findIndex(
    actionReferencesCustomVariation,
  )
  if (customVariationStep >= 0) {
    throw new Error(
      `Replay video cannot yet package custom variation code used by the step ${customVariationStep + 1}. Replace it with built-in variations before exporting this take.`,
    )
  }
  const schedule = createReplayVideoSchedule(session, playbackSpeed)
  const replayVideo = createReplayVideoSpec(playbackSpeed)
  const driver = createReplayVideoDriver(session)
  const initial = driver.reset()
  assertReplayVideoStatePortable(initial, -1)
  const timeline = replayVideoInitialTimelineSnapshot(session)
  return {
    name: replayVideoFileName(session),
    flame: deepClone(session.initial),
    quality: 0.9,
    dimensions: { ...REPLAY_VIDEO_DIMENSIONS },
    fps: schedule.fps,
    frameStart: 0,
    frameEnd: schedule.totalFrames - 1,
    playCount: 1,
    codec: 'avc',
    embedMetadata: true,
    palette: initial.palette,
    blendFlame: initial.blendFlame,
    blendWeight: initial.blendWeight,
    tracks: deepClone(timeline.tracks),
    config: deepClone(timeline.config),
    session: deepClone(session),
    replayVideo,
  }
}

export type ReplayVideoOverlayFrame = {
  action: RecordedAction | undefined
  actionIndex: number
  totalActions: number
  progress: number
  flameName?: string
}

function fitCaptionLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate
      continue
    }
    if (current !== '') lines.push(current)
    current = word
    if (lines.length === maxLines - 1) break
  }
  if (current !== '' && lines.length < maxLines) lines.push(current)
  const fitWithEllipsis = (line: string): string => {
    if (context.measureText(line).width <= maxWidth) return line
    const characters = Array.from(line)
    let low = 0
    let high = characters.length
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (
        context.measureText(`${characters.slice(0, middle).join('')}…`).width <=
        maxWidth
      ) {
        low = middle
      } else {
        high = middle - 1
      }
    }
    return `${characters.slice(0, low).join('').trimEnd()}…`
  }

  for (let index = 0; index < lines.length; index++) {
    lines[index] = fitWithEllipsis(lines[index]!)
  }
  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length
  if (consumed < words.length && lines.length > 0) {
    const last = lines.at(-1)?.replace(/…$/, '') ?? ''
    lines[lines.length - 1] = fitWithEllipsis(`${last}…`)
  }
  return lines
}

/** Burn the replay identity, caption and progress into one publishable frame. */
export function drawReplayVideoOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: ReplayVideoOverlayFrame,
): void {
  const unit = Math.min(width, height)
  const margin = unit * 0.047
  const tagFont = Math.max(13, Math.round(unit * 0.018))
  const captionFont = Math.max(22, Math.round(unit * 0.038))
  const detailFont = Math.max(12, Math.round(unit * 0.016))
  const caption =
    frame.action?.note ??
    frame.action?.label ??
    frame.action?.id ??
    frame.flameName ??
    'Starting flame'

  context.save()
  context.textBaseline = 'top'
  context.shadowColor = 'rgba(0, 0, 0, 0.72)'
  context.shadowBlur = unit * 0.012

  context.font = `700 ${tagFont}px ui-sans-serif, system-ui, sans-serif`
  // Match the orange identity used by Benchmark Lab share cards so exported
  // replays read as part of the same Lumen Apeiron publishing system.
  context.fillStyle = 'rgba(255, 116, 72, 0.98)'
  context.fillText('LUMEN APEIRON', margin, margin)
  context.font = `600 ${detailFont}px ui-sans-serif, system-ui, sans-serif`
  context.fillStyle = 'rgba(217, 231, 255, 0.78)'
  context.fillText('CREATION REPLAY', margin, margin + tagFont * 1.45)

  const textWidth = width - margin * 2
  context.font = `650 ${captionFont}px ui-sans-serif, system-ui, sans-serif`
  const lines = fitCaptionLines(context, caption, textWidth, 2)
  const lineHeight = captionFont * 1.18
  const blockHeight = Math.max(1, lines.length) * lineHeight
  const captionY = height - margin - blockHeight - unit * 0.045
  const gradient = context.createLinearGradient(
    0,
    captionY - unit * 0.08,
    0,
    height,
  )
  gradient.addColorStop(0, 'rgba(3, 7, 14, 0)')
  gradient.addColorStop(0.42, 'rgba(3, 7, 14, 0.58)')
  gradient.addColorStop(1, 'rgba(3, 7, 14, 0.9)')
  context.shadowBlur = 0
  context.fillStyle = gradient
  context.fillRect(
    0,
    captionY - unit * 0.08,
    width,
    height - captionY + unit * 0.08,
  )

  context.shadowColor = 'rgba(0, 0, 0, 0.8)'
  context.shadowBlur = unit * 0.012
  context.font = `650 ${captionFont}px ui-sans-serif, system-ui, sans-serif`
  context.fillStyle = 'rgba(255, 255, 255, 0.98)'
  lines.forEach((line, index) => {
    context.fillText(line, margin, captionY + index * lineHeight)
  })

  const step = Math.max(0, frame.actionIndex + 1)
  context.font = `600 ${detailFont}px ui-monospace, SFMono-Regular, monospace`
  context.fillStyle = 'rgba(217, 231, 255, 0.78)'
  context.textAlign = 'right'
  context.fillText(
    `${String(step).padStart(2, '0')} / ${String(frame.totalActions).padStart(2, '0')}`,
    width - margin,
    height - margin - detailFont,
  )

  const progressY = height - unit * 0.012
  context.shadowBlur = 0
  context.fillStyle = 'rgba(255, 255, 255, 0.18)'
  context.fillRect(0, progressY, width, unit * 0.012)
  context.fillStyle = 'rgba(255, 116, 72, 0.96)'
  context.fillRect(
    0,
    progressY,
    width * Math.min(1, Math.max(0, frame.progress)),
    unit * 0.012,
  )
  context.restore()
}

export function replayVideoFileName(
  session: RecordedSession,
  mode: 'artwork' | 'interface' = 'artwork',
): string {
  const raw = session.initial.metadata?.name?.trim() || 'flame'
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${safe || 'flame'}-${mode === 'interface' ? 'interface' : 'creation'}-replay`
}
