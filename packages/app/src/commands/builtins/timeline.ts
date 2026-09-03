import { isTimelineParameterPath, MAX_TIMELINE_FRAME, MAX_TIMELINE_KEYFRAME_NUMBER_MAGNITUDE, MAX_TIMELINE_KEYFRAME_STRING_LENGTH, MAX_TIMELINE_PLAYBACK_FPS, MAX_TIMELINE_TIME_SCALE, MAX_TIMELINE_TRACKS, tryValidateTimelineSnapshot, } from '@/flame/schema/timeline'
import { snapshotOriginForCommand, snapshotOriginLabel, tryValidateSnapshotOrigin, } from '@/recorder/snapshotOrigin'
import { registerCommand } from '../registry'
import { num, str } from './describeArgs'

type ReplayArgGuard = (value: unknown) => boolean

function exactReplayArgs(
  args: readonly unknown[],
  guards: readonly ReplayArgGuard[],
): string | undefined {
  if (args.length !== guards.length) return 'arguments do not match signature'
  return guards.every((guard, index) => guard(args[index]))
    ? undefined
    : 'arguments do not match signature'
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isFrame(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_TIMELINE_FRAME
  )
}

function isPositiveFrame(value: unknown): value is number {
  return isFrame(value) && value >= 1
}

function isFps(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_TIMELINE_PLAYBACK_FPS
  )
}

function isEasing(value: unknown): value is string {
  return (
    value === 'linear' ||
    value === 'easeIn' ||
    value === 'easeOut' ||
    value === 'easeInOut' ||
    value === 'bounce' ||
    value === 'elastic'
  )
}

function isInterpolation(value: unknown): value is string {
  return value === 'linear' || value === 'constant' || value === 'spline'
}

function isOptionalReplayValue(value: unknown, guard: ReplayArgGuard): boolean {
  return value === undefined || value === null || guard(value)
}

function isKeyframeNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_TIMELINE_KEYFRAME_NUMBER_MAGNITUDE
  )
}

function isKeyframeValue(
  value: unknown,
): value is
  | number
  | string
  | [number, number, number]
  | [number, number, number, number] {
  if (isKeyframeNumber(value)) return true
  if (typeof value === 'string') {
    return value.length <= MAX_TIMELINE_KEYFRAME_STRING_LENGTH
  }
  return (
    Array.isArray(value) &&
    (value.length === 3 || value.length === 4) &&
    value.every(isKeyframeNumber)
  )
}

function validateOptionalBoolean(args: readonly unknown[]): string | undefined {
  return args.length === 0 ||
    (args.length === 1 && typeof args[0] === 'boolean')
    ? undefined
    : 'expected no arguments or one boolean'
}

function validateAddKeyframeArgs(args: readonly unknown[]): string | undefined {
  if (args.length < 3 || args.length > 5) {
    return 'add keyframe expects path, value, frame, optional easing and optional interpolation'
  }
  if (
    !isTimelineParameterPath(args[0]) ||
    !isKeyframeValue(args[1]) ||
    !isFrame(args[2]) ||
    (args.length >= 4 && !isOptionalReplayValue(args[3], isEasing)) ||
    (args.length === 5 && !isOptionalReplayValue(args[4], isInterpolation))
  ) {
    return 'add keyframe arguments are invalid'
  }
  return undefined
}

function validateScalarWithOptionalCoalescing(
  args: readonly unknown[],
  guard: ReplayArgGuard,
): string | undefined {
  if (args.length !== 1 && args.length !== 2) {
    return 'expected a value and optional gesture-coalescing flag'
  }
  return guard(args[0]) && (args.length === 1 || isBoolean(args[1]))
    ? undefined
    : 'arguments do not match signature'
}

type KeyframeWrite = readonly [
  string,
  number | string | [number, number, number] | [number, number, number, number],
]

function asKeyframeWrites(value: unknown): KeyframeWrite[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_TIMELINE_TRACKS
  ) {
    return undefined
  }
  const writes: KeyframeWrite[] = []
  const paths = new Set<string>()
  for (const entry of value) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !isTimelineParameterPath(entry[0]) ||
      !isKeyframeValue(entry[1]) ||
      paths.has(entry[0])
    ) {
      return undefined
    }
    paths.add(entry[0])
    writes.push([entry[0], entry[1]])
  }
  return writes
}

function validateSetKeyframeValueArgs(
  args: readonly unknown[],
): string | undefined {
  if (args.length < 3 || args.length > 5) {
    return 'set keyframe value expects three to five arguments'
  }
  if (
    !isTimelineParameterPath(args[0]) ||
    !isFrame(args[1]) ||
    !isKeyframeValue(args[2]) ||
    (args.length >= 4 && !isOptionalReplayValue(args[3], isEasing)) ||
    (args.length === 5 && !isOptionalReplayValue(args[4], isInterpolation))
  ) {
    return 'set keyframe value arguments are invalid'
  }
  return undefined
}

registerCommand({
  id: 'timeline.setAnimationEnabled',
  describe: ([enabled]) =>
    enabled === false ? 'Disable animation' : 'Enable animation',
  label: 'Toggle Animation',
  description: 'Enable or disable timeline animation playback',
  shortcut: 'Ctrl+T',
  validateReplayArgs: validateOptionalBoolean,
  execute(ctx, enabled?: unknown) {
    if (typeof enabled === 'boolean') {
      ctx.timeline.setAnimationEnabled(enabled)
    } else {
      ctx.timeline.setAnimationEnabled((prev) => !prev)
    }
  },
})

registerCommand({
  id: 'timeline.setDuration',
  describe: ([frames]) => {
    const f = num(frames, 0)
    return f === undefined
      ? 'Set the animation duration'
      : `Duration: ${f} frames`
  },
  label: 'Set Animation Duration',
  description: 'Set the animation duration in frames',
  coalesceKey: ([, coalesce]) => (coalesce === true ? 'duration' : undefined),
  validateReplayArgs: (args) =>
    validateScalarWithOptionalCoalescing(args, isPositiveFrame),
  execute(ctx, duration?: unknown, coalesce?: unknown) {
    if (isPositiveFrame(duration)) {
      ctx.timeline.setDuration(
        duration,
        coalesce === true ? 'endFrame' : undefined,
      )
    }
  },
})

registerCommand({
  id: 'timeline.setLoop',
  describe: ([loop]) => (loop === false ? 'Loop off' : 'Loop on'),
  label: 'Set Animation Loop',
  description: 'Enable or disable timeline animation loop',
  validateReplayArgs: (args) => exactReplayArgs(args, [isBoolean]),
  execute(ctx, loop?: unknown) {
    if (typeof loop === 'boolean') {
      ctx.timeline.setLoop(loop)
    }
  },
})

registerCommand({
  id: 'timeline.setFps',
  describe: ([fps]) => {
    const f = num(fps, 0)
    return f === undefined ? 'Set the animation FPS' : `Animation FPS: ${f}`
  },
  label: 'Set Animation FPS',
  description: 'Set the frames per second for timeline playback',
  coalesceKey: ([, coalesce]) => (coalesce === true ? 'fps' : undefined),
  validateReplayArgs: (args) =>
    validateScalarWithOptionalCoalescing(args, isFps),
  execute(ctx, fps?: unknown, coalesce?: unknown) {
    if (isFps(fps)) {
      ctx.timeline.setFps(fps, coalesce === true ? 'fps' : undefined)
    }
  },
})

registerCommand({
  id: 'timeline.setAutoFps',
  describe: ([enabled]) => (enabled === false ? 'Auto FPS off' : 'Auto FPS on'),
  label: 'Set Auto FPS',
  description: 'Wait for render quality before advancing each frame',
  validateReplayArgs: (args) => exactReplayArgs(args, [isBoolean]),
  execute(ctx, enabled?: unknown) {
    if (typeof enabled === 'boolean') ctx.timeline.setAutoFps?.(enabled)
  },
})

registerCommand({
  id: 'timeline.setTimeScale',
  describe: ([scale]) => {
    const s = num(scale, 2)
    return s === undefined ? 'Set the playback speed' : `Playback speed: ${s}x`
  },
  label: 'Set Playback Speed',
  description: 'Set the timeline playback speed multiplier',
  coalesceKey: ([, coalesce]) => (coalesce === true ? 'time-scale' : undefined),
  validateReplayArgs: (args) =>
    validateScalarWithOptionalCoalescing(
      args,
      (value) =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= MAX_TIMELINE_TIME_SCALE,
    ),
  execute(ctx, scale?: unknown, coalesce?: unknown) {
    if (
      typeof scale === 'number' &&
      Number.isFinite(scale) &&
      scale >= 0 &&
      scale <= MAX_TIMELINE_TIME_SCALE
    ) {
      ctx.timeline.setTimeScale?.(
        scale,
        coalesce === true ? 'timeScale' : undefined,
      )
    }
  },
})

registerCommand({
  id: 'timeline.setCurrentFrame',
  describe: ([frame]) => {
    const f = num(frame, 0)
    return f === undefined ? 'Jump to a frame' : `Go to frame ${f}`
  },
  label: 'Set Current Frame',
  description: 'Jump to a specific frame in the timeline',
  coalesceKey: ([, coalesce]) => (coalesce === true ? 'playhead' : undefined),
  validateReplayArgs: (args) =>
    validateScalarWithOptionalCoalescing(args, isFrame),
  execute(ctx, frame?: unknown) {
    if (isFrame(frame)) {
      ctx.timeline.setCurrentFrame(frame)
    }
  },
})

registerCommand({
  id: 'timeline.addKeyframe',
  describe: ([path, , frame]) => {
    const p = str(path)
    if (p === undefined) return 'Add a keyframe'
    const f = num(frame, 0)
    return f === undefined ? `Keyframe ${p}` : `Keyframe ${p} @${f}`
  },
  label: 'Add Keyframe',
  description: 'Add a keyframe at the current or specified frame',
  validateReplayArgs: validateAddKeyframeArgs,
  execute(
    ctx,
    parameterPath?: unknown,
    value?: unknown,
    frame?: unknown,
    easing?: unknown,
    interp?: unknown,
  ) {
    const path = isTimelineParameterPath(parameterPath) ? parameterPath : ''
    if (!path) return
    const val = isKeyframeValue(value) ? value : 0
    const f = isFrame(frame) ? frame : ctx.timeline.currentFrame()
    const e = isEasing(easing) ? easing : undefined
    ctx.timeline.addKeyframe(
      path,
      f,
      val,
      e,
      isInterpolation(interp) ? interp : undefined,
    )
  },
})

registerCommand({
  id: 'timeline.addKeyframes',
  describe: ([writes, frame]) => {
    const count = Array.isArray(writes) ? writes.length : 0
    const f = num(frame, 0)
    const what = count === 1 ? '1 keyframe' : `${count} keyframes`
    return f === undefined ? `Add ${what}` : `Add ${what} @${f}`
  },
  label: 'Add Keyframes',
  description: 'Keyframe multiple parameter values as one authored edit',
  coalesceKey: ([writes, frame, coalesce]) => {
    const parsed = asKeyframeWrites(writes)
    return coalesce === true && parsed
      ? `${parsed.map(([path]) => path).join('\0')}@${String(frame)}`
      : undefined
  },
  validateReplayArgs(args) {
    if (args.length !== 3) {
      return 'add keyframes expects writes, frame and coalescing flag'
    }
    return asKeyframeWrites(args[0]) && isFrame(args[1]) && isBoolean(args[2])
      ? undefined
      : 'add keyframes arguments are invalid'
  },
  execute(ctx, entries?: unknown, frame?: unknown, coalesce?: unknown) {
    const writes = asKeyframeWrites(entries)
    if (!writes || !isFrame(frame) || typeof coalesce !== 'boolean') return
    ctx.timeline.edit?.addKeyframeValuesAtFrame?.(writes, frame, { coalesce })
  },
})

registerCommand({
  id: 'timeline.play',
  describe: () => 'Play the timeline',
  label: 'Play Timeline',
  description: 'Start timeline playback',
  recordable: false,
  replayable: false,
  execute(ctx) {
    ctx.timeline.play()
  },
})

/**
 * The rest of the keyframe verbs.
 *
 * The timeline keeps its own undo stack, so before these existed every dope
 * sheet edit landed on that stack as an unnamed write: counted (once the
 * recorder learned to watch it) but not replayable. A recording of an
 * animation session was a recording of half the work.
 *
 * All of them validate their own arguments, because a `.steps.json` is user
 * data and a parameter path is a write target.
 */

function asPath(value: unknown): string | undefined {
  return isTimelineParameterPath(value) ? value : undefined
}

function asFrame(value: unknown): number | undefined {
  return isFrame(value) ? value : undefined
}

function asKeyframeValue(
  value: unknown,
):
  | number
  | string
  | [number, number, number]
  | [number, number, number, number]
  | undefined {
  return isKeyframeValue(value) ? value : undefined
}

registerCommand({
  id: 'timeline.removeKeyframe',
  label: 'Remove Keyframe',
  description: 'Delete the keyframe at a frame on one parameter track',
  describe: ([path, frame]) =>
    typeof path === 'string'
      ? `Remove keyframe ${path} @${String(frame)}`
      : undefined,
  validateReplayArgs: (args) =>
    exactReplayArgs(args, [isTimelineParameterPath, isFrame]),
  execute(ctx, parameterPath?: unknown, frame?: unknown) {
    const path = asPath(parameterPath)
    const f = asFrame(frame)
    if (path === undefined || f === undefined) return
    ctx.timeline.edit?.removeKeyframe(path, f)
  },
})

registerCommand({
  id: 'timeline.setKeyframeValue',
  label: 'Set Keyframe Value',
  description:
    'Change the value (and optionally easing/interpolation) of a keyframe',
  // Dragging a keyframe's value in the curve editor re-fires per pointer-move
  // and may move through several frames. Gesture boundaries are supplied by
  // the editors, so one path becomes one final recorded value per drag.
  coalesceKey: ([path]) => (typeof path === 'string' ? path : undefined),
  describe: ([path, frame]) =>
    typeof path === 'string'
      ? `Set keyframe ${path} @${String(frame)}`
      : undefined,
  validateReplayArgs: validateSetKeyframeValueArgs,
  execute(
    ctx,
    parameterPath?: unknown,
    frame?: unknown,
    value?: unknown,
    easing?: unknown,
    interp?: unknown,
  ) {
    const path = asPath(parameterPath)
    const f = asFrame(frame)
    const val = asKeyframeValue(value)
    if (path === undefined || f === undefined || val === undefined) return
    ctx.timeline.edit?.setKeyframeValue(
      path,
      f,
      val,
      isEasing(easing) ? easing : undefined,
      isInterpolation(interp) ? interp : undefined,
    )
  },
})

registerCommand({
  id: 'timeline.setKeyframeInterp',
  label: 'Set Keyframe Interpolation',
  description: 'Switch a keyframe between linear, constant and spline',
  describe: ([path, , interp]) =>
    typeof path === 'string' && typeof interp === 'string'
      ? `Set ${path} to ${interp}`
      : undefined,
  validateReplayArgs: (args) =>
    exactReplayArgs(args, [isTimelineParameterPath, isFrame, isInterpolation]),
  execute(ctx, parameterPath?: unknown, frame?: unknown, interp?: unknown) {
    const path = asPath(parameterPath)
    const f = asFrame(frame)
    if (path === undefined || f === undefined) return
    if (interp !== 'linear' && interp !== 'constant' && interp !== 'spline') {
      return
    }
    ctx.timeline.edit?.setKeyframeInterp(path, f, interp)
  },
})

registerCommand({
  id: 'timeline.moveKeyframe',
  label: 'Move Keyframe',
  description: 'Drag a keyframe to a different frame',
  // Dope-sheet dragging dispatches once on pointer-up. Repeated moves are
  // separate authored gestures and must remain chronological.
  describe: ([path, , to]) =>
    typeof path === 'string'
      ? `Move ${path} keyframe to ${String(to)}`
      : undefined,
  validateReplayArgs: (args) =>
    exactReplayArgs(args, [isTimelineParameterPath, isFrame, isFrame]),
  execute(ctx, parameterPath?: unknown, from?: unknown, to?: unknown) {
    const path = asPath(parameterPath)
    const fromFrame = asFrame(from)
    const toFrame = asFrame(to)
    if (
      path === undefined ||
      fromFrame === undefined ||
      toFrame === undefined
    ) {
      return
    }
    ctx.timeline.edit?.moveKeyframe(path, fromFrame, toFrame)
  },
})

registerCommand({
  id: 'timeline.relocateKeyframe',
  label: 'Retime Keyframe',
  description: 'Move a keyframe inside an already-open edit gesture',
  coalesceKey: ([path]) => (typeof path === 'string' ? path : undefined),
  coalesceArgs: (existing, next) => [existing[0], existing[1], next[2]],
  describe: ([path, , to]) =>
    typeof path === 'string'
      ? `Retime ${path} keyframe to ${String(to)}`
      : undefined,
  validateReplayArgs: (args) =>
    exactReplayArgs(args, [isTimelineParameterPath, isFrame, isFrame]),
  execute(ctx, parameterPath?: unknown, from?: unknown, to?: unknown) {
    const path = asPath(parameterPath)
    const fromFrame = asFrame(from)
    const toFrame = asFrame(to)
    if (
      path === undefined ||
      fromFrame === undefined ||
      toFrame === undefined
    ) {
      return
    }
    ctx.timeline.edit?.relocateKeyframe?.(path, fromFrame, toFrame)
  },
})

registerCommand({
  id: 'timeline.removeTrack',
  label: 'Remove Track',
  description: 'Delete a whole parameter track and all of its keyframes',
  describe: ([path]) =>
    typeof path === 'string' ? `Remove track ${path}` : undefined,
  validateReplayArgs: (args) =>
    exactReplayArgs(args, [isTimelineParameterPath]),
  execute(ctx, parameterPath?: unknown) {
    const path = asPath(parameterPath)
    if (path === undefined) return
    ctx.timeline.edit?.removeTrack(path)
  },
})

registerCommand({
  id: 'timeline.clearTracks',
  describe: () => 'Clear the timeline',
  label: 'Clear Timeline',
  description: 'Remove every track and keyframe',
  validateReplayArgs: (args) => exactReplayArgs(args, []),
  execute(ctx) {
    ctx.timeline.edit?.clearTracks()
  },
})

registerCommand({
  id: 'timeline.setLoopMode',
  label: 'Set Loop Mode',
  description: 'Off, seamless (ramp back to the start) or cycle',
  describe: ([mode]) =>
    typeof mode === 'string' ? `Set loop mode to ${mode}` : undefined,
  validateReplayArgs: (args) =>
    exactReplayArgs(args, [
      (value) => value === 'off' || value === 'seamless' || value === 'cycle',
    ]),
  execute(ctx, mode?: unknown) {
    if (mode !== 'off' && mode !== 'seamless' && mode !== 'cycle') return
    ctx.timeline.edit?.setLoopMode(mode)
  },
})

registerCommand({
  id: 'timeline.loadTimeline',
  label: 'Load Animation',
  description: 'Replace every track and the timeline config wholesale',
  describe: (args) =>
    snapshotOriginLabel(
      snapshotOriginForCommand('timeline.loadTimeline', args),
    ),
  // Carries the tracks themselves, like flame.load carries the descriptor, so
  // a session that swaps animations still replays without depending on what
  // the viewer happened to have.
  validateReplayArgs(args) {
    if (args.length < 1 || args.length > 2) {
      return 'timeline load expects a snapshot and optional semantic origin'
    }
    if (!tryValidateTimelineSnapshot(args[0])) {
      return 'timeline snapshot is invalid'
    }
    if (args.length === 2 && !tryValidateSnapshotOrigin(args[1])) {
      return 'timeline semantic origin is invalid'
    }
    return undefined
  },
  execute(ctx, data?: unknown) {
    const parsed = tryValidateTimelineSnapshot(data)
    if (!parsed) {
      console.warn('[cmd] timeline.loadTimeline: rejected', data)
      return
    }
    ctx.timeline.edit?.load(parsed)
  },
})

registerCommand({
  id: 'timeline.setAutoKeyframe',
  describe: ([enabled]) =>
    enabled === false ? 'Auto-keyframe off' : 'Auto-keyframe on',
  label: 'Toggle Auto-Keyframe',
  description: 'Record a keyframe automatically whenever a parameter changes',
  validateReplayArgs: (args) => exactReplayArgs(args, [isBoolean]),
  execute(ctx, on?: unknown) {
    if (typeof on !== 'boolean') return
    ctx.timeline.edit?.setAutoKeyframe(on)
  },
})
