import { deepClone } from '@/utils/clone'
import { breakRecordingCoalescing, invalidateLastFinishedSession, recordSyntheticAction, withRecordingSuppressed, } from './recorder'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { EasingCurve, KeyframeInterpolation, TimelineConfig, TimelineState, } from '@/utils/timeline'

type TimelineCommandDispatcher = (id: string, ...args: unknown[]) => void

type KeyframeValue =
  | number
  | string
  | [number, number, number]
  | [number, number, number, number]

/** Capture exactly the state `timeline.loadTimeline` restores. */
export function snapshotTimeline(timeline: TimelineState): TimelineSnapshot {
  return {
    config: deepClone(timeline.config()),
    currentFrame: timeline.currentFrame(),
    animationEnabled: timeline.animationEnabled(),
    autoKeyframe: timeline.autoKeyframe(),
    previewHeld: timeline.previewHeld(),
    tracks: deepClone(timeline.tracks()),
  }
}

function nextSetterValue<T>(current: T, value: T | ((previous: T) => T)): T {
  return typeof value === 'function'
    ? (value as (previous: T) => T)(current)
    : value
}

/**
 * Recorder-aware view of a timeline state for UI consumers.
 *
 * Reads, transient history and system/load setters remain raw. Authored
 * atomic mutations dispatch semantic commands. Wall-clock transport remains
 * intentionally unrecorded, but crosses `beforeMutation` so a user pressing
 * Play/Pause takes ownership away from an in-flight replay before either
 * clock can advance. Bulk helpers retain their original single-undo behavior,
 * run invisibly to the recorder, then emit one value-pinned
 * `timeline.loadTimeline` action for deterministic replay.
 *
 * The command context used by `dispatch` must point at `raw`, never this
 * facade, otherwise a command would recursively dispatch itself.
 */
export function createRecorderAwareTimeline(
  raw: TimelineState,
  dispatch: TimelineCommandDispatcher,
  beforeMutation?: () => void,
): TimelineState {
  let compoundDepth = 0

  function recordSnapshotMutation<R>(label: string, mutate: () => R): R {
    if (compoundDepth > 0) return raw.runWithSingleUndo(mutate)

    // Compound helpers mutate the raw timeline first and only emit their
    // synthetic snapshot afterwards. Relinquish timed replay before that raw
    // write, otherwise the user's result becomes replay's captured side state
    // before the later synthetic action reaches any command boundary.
    beforeMutation?.()
    const before = JSON.stringify(snapshotTimeline(raw))
    compoundDepth++
    try {
      return withRecordingSuppressed(() => raw.runWithSingleUndo(mutate))
    } finally {
      compoundDepth--
      const after = snapshotTimeline(raw)
      // Avoid a phantom replay step (and stale-session invalidation) for a
      // guarded/no-op bulk operation.
      if (JSON.stringify(after) !== before) {
        invalidateLastFinishedSession()
        recordSyntheticAction('timeline.loadTimeline', [after], label)
      }
    }
  }

  function dispatchScalar(command: string, value: number, coalesceId?: string) {
    if (coalesceId === undefined) dispatch(command, value)
    else dispatch(command, value, true)
  }

  function resolvedWrites(paths: readonly string[]) {
    const writes: [string, KeyframeValue][] = []
    const seen = new Set<string>()
    for (const path of paths) {
      if (seen.has(path)) continue
      seen.add(path)
      const value = raw.getResolvedValue(path)
      if (value !== null) writes.push([path, value])
    }
    return writes
  }

  const facade: TimelineState = {
    ...raw,

    play() {
      beforeMutation?.()
      raw.play()
    },

    pause() {
      beforeMutation?.()
      raw.pause()
    },

    togglePlay() {
      beforeMutation?.()
      raw.togglePlay()
    },

    setAnimationEnabled(value) {
      const next = nextSetterValue(raw.animationEnabled(), value)
      if (next !== raw.animationEnabled()) {
        dispatch('timeline.setAnimationEnabled', next)
      }
      return next
    },

    setAutoKeyframe(value) {
      const next = nextSetterValue(raw.autoKeyframe(), value)
      if (next !== raw.autoKeyframe())
        dispatch('timeline.setAutoKeyframe', next)
      return next
    },

    setCurrentFrame(value) {
      const frame = nextSetterValue(raw.currentFrame(), value)
      if (raw.isScrubbing()) {
        dispatch('timeline.setCurrentFrame', frame, true)
      } else {
        dispatch('timeline.setCurrentFrame', frame)
      }
      return raw.currentFrame()
    },

    goToFrame(frame) {
      if (raw.isScrubbing()) {
        dispatch('timeline.setCurrentFrame', frame, true)
      } else {
        dispatch('timeline.setCurrentFrame', frame)
      }
    },

    advanceFrame() {
      // The render loop owns wall-clock playback and must stay outside the
      // semantic log. A button press while paused, however, is a deterministic
      // authored seek and should replay just like clicking the ruler.
      if (raw.isPlaying()) {
        raw.advanceFrame()
        return
      }
      const config = raw.config()
      const next = raw.currentFrame() + 1
      facade.goToFrame(next > config.endFrame ? config.startFrame : next)
    },

    goBackFrame() {
      const config = raw.config()
      const previous = raw.currentFrame() - 1
      facade.goToFrame(
        previous < config.startFrame
          ? config.loop
            ? config.endFrame
            : config.startFrame
          : previous,
      )
    },

    setIsScrubbing(value) {
      const next = nextSetterValue(raw.isScrubbing(), value)
      const result = raw.setIsScrubbing(next)
      if (!next) {
        raw.breakUndoCoalescing()
        breakRecordingCoalescing()
      }
      return result
    },

    updateConfigUndoable(
      partial: Partial<TimelineConfig>,
      coalesceId?: string,
    ) {
      const entries = Object.entries(partial).filter(
        ([key, value]) => raw.config()[key as keyof TimelineConfig] !== value,
      )
      if (entries.length === 0) return

      if (entries.length === 1) {
        const [key, value] = entries[0]!
        if (key === 'fps' && typeof value === 'number') {
          dispatchScalar('timeline.setFps', value, coalesceId)
          return
        }
        if (key === 'endFrame' && typeof value === 'number') {
          dispatchScalar('timeline.setDuration', value, coalesceId)
          return
        }
        if (key === 'timeScale' && typeof value === 'number') {
          dispatchScalar('timeline.setTimeScale', value, coalesceId)
          return
        }
        if (key === 'loop' && typeof value === 'boolean') {
          dispatch('timeline.setLoop', value)
          return
        }
        if (key === 'autoFps' && typeof value === 'boolean') {
          dispatch('timeline.setAutoFps', value)
          return
        }
      }

      recordSnapshotMutation('Update timeline settings', () => {
        raw.updateConfigUndoable(partial, coalesceId)
      })
    },

    breakUndoCoalescing() {
      raw.breakUndoCoalescing()
      breakRecordingCoalescing()
    },

    addKeyframe(
      parameterPath: string,
      frame: number,
      value: KeyframeValue,
      easing?: EasingCurve,
      interp?: KeyframeInterpolation,
    ) {
      dispatch(
        'timeline.addKeyframe',
        parameterPath,
        value,
        frame,
        easing ?? null,
        interp ?? null,
      )
    },

    addKeyframesAtCurrentFrame(paths, options = {}) {
      const writes = resolvedWrites(paths)
      if (writes.length === 0) return
      dispatch(
        'timeline.addKeyframes',
        writes,
        raw.currentFrame(),
        options.coalesce !== false,
      )
    },

    addKeyframeValuesAtFrame(writes, frame, options = {}) {
      if (writes.length === 0) return
      dispatch(
        'timeline.addKeyframes',
        writes,
        frame,
        options.coalesce !== false,
      )
    },

    addKeyframeAtCurrentFrame(path) {
      facade.addKeyframesAtCurrentFrame([path])
    },

    toggleKeyframeAtCurrentFrame(path) {
      const frame = raw.currentFrame()
      if (raw.hasKeyframeAtFrame(path, frame)) {
        dispatch('timeline.removeKeyframe', path, frame)
      } else {
        const writes = resolvedWrites([path])
        if (writes.length > 0) {
          dispatch('timeline.addKeyframes', writes, frame, false)
        }
      }
    },

    addKeyframeWithOverlapCheck(path, frame, value, easing) {
      if (raw.getOverlappingKeyframes(path, frame).length > 0) return false
      facade.addKeyframe(path, frame, value, easing)
      return true
    },

    removeKeyframe(path, frame) {
      if (raw.hasKeyframeAtFrame(path, frame)) {
        dispatch('timeline.removeKeyframe', path, frame)
      }
    },

    setKeyframeValue(path, frame, value, easing, interp) {
      dispatch(
        'timeline.setKeyframeValue',
        path,
        frame,
        value,
        easing ?? null,
        interp ?? null,
      )
    },

    setKeyframeInterp(path, frame, interp) {
      if (raw.hasKeyframeAtFrame(path, frame)) {
        dispatch('timeline.setKeyframeInterp', path, frame, interp)
      }
    },

    moveKeyframe(path, from, to) {
      if (raw.hasKeyframeAtFrame(path, from)) {
        dispatch('timeline.moveKeyframe', path, from, to)
      }
    },

    relocateKeyframe(path, from, to) {
      if (raw.hasKeyframeAtFrame(path, from)) {
        dispatch('timeline.relocateKeyframe', path, from, to)
      }
    },

    removeTrack(path) {
      if (raw.hasAnyKeyframes(path)) dispatch('timeline.removeTrack', path)
    },

    removeAllKeyframesForPath(path) {
      facade.removeTrack(path)
    },

    clearAllTracks() {
      if (raw.tracks().length > 0) dispatch('timeline.clearTracks')
    },

    setLoopMode(mode) {
      if ((raw.config().loopMode ?? 'off') !== mode) {
        dispatch('timeline.setLoopMode', mode)
      }
    },

    removeTracks(paths) {
      const existing = paths.filter((path) => raw.hasAnyKeyframes(path))
      if (existing.length === 0) return
      recordSnapshotMutation('Remove animation tracks', () => {
        raw.removeTracks(existing)
      })
    },

    removeKeyframesAtFrame(path, frame) {
      if (!raw.hasKeyframeAtFrame(path, frame)) return
      recordSnapshotMutation('Remove animation keyframes', () => {
        raw.removeKeyframesAtFrame(path, frame)
      })
    },

    splitKeyframeAtFrame(path, originalFrame, splitFrame) {
      if (!raw.hasKeyframeAtFrame(path, originalFrame)) return false
      return recordSnapshotMutation('Split animation keyframe', () =>
        raw.splitKeyframeAtFrame(path, originalFrame, splitFrame),
      )
    },

    applyMirroredValueFromTrack(source, target, frame) {
      return recordSnapshotMutation('Mirror animation keyframe', () =>
        raw.applyMirroredValueFromTrack(source, target, frame),
      )
    },

    runWithSingleUndo<R>(fn: () => R): R {
      return recordSnapshotMutation('Update animation', fn)
    },
  }

  return facade
}
