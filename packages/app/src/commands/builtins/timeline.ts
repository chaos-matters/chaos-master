import { isTimelineParameterPath, MAX_TIMELINE_FRAME, MAX_TIMELINE_KEYFRAME_NUMBER_MAGNITUDE, MAX_TIMELINE_KEYFRAME_STRING_LENGTH, MAX_TIMELINE_PLAYBACK_FPS, tryValidateTimelineSnapshot, } from '@/flame/schema/timeline'
import { registerCommand } from '../registry'

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
  if (args.length !== 3 && args.length !== 4) {
    return 'add keyframe expects path, value, frame, and optional easing'
  }
  if (
    !isTimelineParameterPath(args[0]) ||
    !isKeyframeValue(args[1]) ||
    !isFrame(args[2]) ||
    (args.length === 4 && !isOptionalReplayValue(args[3], isEasing))
  ) {
    return 'add keyframe arguments are invalid'
  }
  return undefined
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
  label: 'Set Animation Duration',
  description: 'Set the animation duration in frames',
  validateReplayArgs: (args) => exactReplayArgs(args, [isPositiveFrame]),
  execute(ctx, duration?: unknown) {
    if (isPositiveFrame(duration)) {
      ctx.timeline.setDuration(duration)
    }
  },
})

registerCommand({
  id: 'timeline.setLoop',
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
  label: 'Set Animation FPS',
  description: 'Set the frames per second for timeline playback',
  validateReplayArgs: (args) => exactReplayArgs(args, [isFps]),
  execute(ctx, fps?: unknown) {
    if (isFps(fps)) {
      ctx.timeline.setFps(fps)
    }
  },
})

registerCommand({
  id: 'timeline.setCurrentFrame',
  label: 'Set Current Frame',
  description: 'Jump to a specific frame in the timeline',
  validateReplayArgs: (args) => exactReplayArgs(args, [isFrame]),
  execute(ctx, frame?: unknown) {
    if (isFrame(frame)) {
      ctx.timeline.setCurrentFrame(frame)
    }
  },
})

registerCommand({
  id: 'timeline.addKeyframe',
  label: 'Add Keyframe',
  description: 'Add a keyframe at the current or specified frame',
  validateReplayArgs: validateAddKeyframeArgs,
  execute(
    ctx,
    parameterPath?: unknown,
    value?: unknown,
    frame?: unknown,
    easing?: unknown,
  ) {
    const path = isTimelineParameterPath(parameterPath) ? parameterPath : ''
    if (!path) return
    const val = isKeyframeValue(value) ? value : 0
    const f = isFrame(frame) ? frame : ctx.timeline.currentFrame()
    const e = isEasing(easing) ? easing : undefined
    ctx.timeline.addKeyframe(path, f, val, e)
  },
})

registerCommand({
  id: 'timeline.play',
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
  // and is one timeline undo entry; it is one recorded step too.
  coalesceKey: ([path, frame]) =>
    typeof path === 'string' ? `${path}@${String(frame)}` : undefined,
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
  // A dope-sheet drag is one undo entry however many frames it crosses. The
  // key is the ORIGIN frame, which is what stays constant through the drag.
  coalesceKey: ([path, from]) =>
    typeof path === 'string' ? `${path}@${String(from)}` : undefined,
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
  // Carries the tracks themselves, like flame.load carries the descriptor, so
  // a session that swaps animations still replays without depending on what
  // the viewer happened to have.
  validateReplayArgs(args) {
    if (args.length !== 1) return 'timeline load expects one snapshot'
    return tryValidateTimelineSnapshot(args[0])
      ? undefined
      : 'timeline snapshot is invalid'
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
  label: 'Toggle Auto-Keyframe',
  description: 'Record a keyframe automatically whenever a parameter changes',
  validateReplayArgs: (args) => exactReplayArgs(args, [isBoolean]),
  execute(ctx, on?: unknown) {
    if (typeof on !== 'boolean') return
    ctx.timeline.edit?.setAutoKeyframe(on)
  },
})
