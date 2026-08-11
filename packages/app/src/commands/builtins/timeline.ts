import { TimelineSnapshot } from '@/flame/schema/timeline'
import * as v from '@/valibot'
import { registerCommand } from '../registry'

registerCommand({
  id: 'timeline.setAnimationEnabled',
  label: 'Toggle Animation',
  description: 'Enable or disable timeline animation playback',
  shortcut: 'Ctrl+T',
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
  execute(ctx, duration?: unknown) {
    if (typeof duration === 'number' && duration > 0) {
      ctx.timeline.setDuration(duration)
    }
  },
})

registerCommand({
  id: 'timeline.setLoop',
  label: 'Set Animation Loop',
  description: 'Enable or disable timeline animation loop',
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
  execute(ctx, fps?: unknown) {
    if (typeof fps === 'number' && fps > 0) {
      ctx.timeline.setFps(fps)
    }
  },
})

registerCommand({
  id: 'timeline.setCurrentFrame',
  label: 'Set Current Frame',
  description: 'Jump to a specific frame in the timeline',
  execute(ctx, frame?: unknown) {
    if (typeof frame === 'number' && frame >= 0) {
      ctx.timeline.setCurrentFrame(frame)
    }
  },
})

registerCommand({
  id: 'timeline.addKeyframe',
  label: 'Add Keyframe',
  description: 'Add a keyframe at the current or specified frame',
  execute(
    ctx,
    parameterPath?: unknown,
    value?: unknown,
    frame?: unknown,
    easing?: unknown,
  ) {
    const path = typeof parameterPath === 'string' ? parameterPath : ''
    if (!path) return
    const val =
      typeof value === 'number' ||
      typeof value === 'string' ||
      (Array.isArray(value) && value.length >= 3)
        ? (value as number | string | [number, number, number])
        : 0
    const f = typeof frame === 'number' ? frame : ctx.timeline.currentFrame()
    const e = typeof easing === 'string' ? easing : undefined
    ctx.timeline.addKeyframe(path, f, val, e)
  },
})

registerCommand({
  id: 'timeline.play',
  label: 'Play Timeline',
  description: 'Start timeline playback',
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
  return typeof value === 'string' && value !== '' ? value : undefined
}

function asFrame(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function asKeyframeValue(
  value: unknown,
): number | string | [number, number, number] | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') return value
  if (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  ) {
    return value as [number, number, number]
  }
  return undefined
}

registerCommand({
  id: 'timeline.removeKeyframe',
  label: 'Remove Keyframe',
  description: 'Delete the keyframe at a frame on one parameter track',
  describe: ([path, frame]) =>
    typeof path === 'string'
      ? `Remove keyframe ${path} @${String(frame)}`
      : undefined,
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
      typeof easing === 'string' ? easing : undefined,
      typeof interp === 'string' ? interp : undefined,
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
  execute(ctx, data?: unknown) {
    const parsed = v.safeParse(TimelineSnapshot, data)
    if (!parsed.success) {
      console.warn('[cmd] timeline.loadTimeline: rejected', data)
      return
    }
    ctx.timeline.edit?.load(parsed.output)
  },
})

registerCommand({
  id: 'timeline.setAutoKeyframe',
  label: 'Toggle Auto-Keyframe',
  description: 'Record a keyframe automatically whenever a parameter changes',
  execute(ctx, on?: unknown) {
    if (typeof on !== 'boolean') return
    ctx.timeline.edit?.setAutoKeyframe(on)
  },
})
