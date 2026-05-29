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
