import { vec2f } from 'typegpu/data'
import { camera3DDefault, MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { executeCommand, registerCommand } from '../registry'
import { num } from './describeArgs'

/**
 * Framing as commands, so both a person and an agent reach the camera the
 * same way.
 *
 * Dragging the canvas and the zoom buttons write `camera.position` /
 * `camera.zoom` through `flame.setRenderSetting`, which records fine but says
 * nothing about intent. These say what the move was for, which is what a
 * replay caption and a lesson brief need. Every one clamps to the schema's
 * own camera range, so a replayed file cannot push the viewport somewhere the
 * validator would reject.
 */

/** Far enough out to frame any flame anyone has built, near enough that a
 *  malformed session file cannot send the viewport to infinity. */
const MAX_CAMERA_OFFSET = 10_000

function clampZoom(value: number): number {
  return Math.min(MAX_CAMERA_ZOOM_VALUE, Math.max(MIN_CAMERA_ZOOM_VALUE, value))
}

function clampOffset(value: number): number {
  return Math.min(MAX_CAMERA_OFFSET, Math.max(-MAX_CAMERA_OFFSET, value))
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

registerCommand({
  id: 'camera.center',
  describe: () => 'Centre the camera',
  label: 'Center Camera',
  description:
    'Reset the camera: position (0, 0) and zoom 1 in 2D, the default orbit in 3D',
  shortcut: 'Ctrl+0',
  execute(ctx) {
    // In 3D the camera is an orbit and `position`/`zoom` are unused, so this
    // was a no-op there. The orbit only: fov and roll are the lens, and Centre
    // leaves the 2D rotation alone for the same reason. Through the same
    // render-setting path as the 2D setters, so a held timeline frame lets go.
    if ((ctx.flameDescriptor().renderSettings.dimensions ?? 2) === 3) {
      const { theta, phi, radius } = camera3DDefault
      executeCommand('flame.setRenderSetting', ctx, 'camera3D', {
        theta,
        phi,
        radius,
        target: [0, 0, 0],
      })
      return
    }
    ctx.setPosition(vec2f(0, 0))
    ctx.setZoom(1)
  },
})

registerCommand({
  id: 'camera.zoomTo',
  describe: ([zoom]) => {
    const z = num(zoom, 3)
    return z === undefined ? 'Zoom the camera' : `Zoom to ${z}`
  },
  label: 'Zoom To',
  description: 'Set camera zoom to a specific level',
  execute(ctx, zoom?: unknown) {
    ctx.setZoom(clampZoom(finite(zoom, 1)))
  },
})

registerCommand({
  id: 'camera.zoomBy',
  describe: ([factor]) => {
    const f = num(factor, 3)
    return f === undefined ? 'Zoom the camera' : `Zoom by ${f}x`
  },
  label: 'Zoom By',
  description: 'Multiply the current zoom by a factor (2 = twice as close)',
  execute(ctx, factor?: unknown) {
    const f = finite(factor, 1)
    // A zero or negative factor is not a zoom, and would leave the viewport
    // in a state the schema rejects. Treat it as "no change".
    if (f <= 0) return
    ctx.setZoom(clampZoom(ctx.zoom() * f))
  },
})

registerCommand({
  id: 'camera.panTo',
  describe: ([x, y]) => {
    const px = num(x, 3)
    const py = num(y, 3)
    return px === undefined || py === undefined
      ? 'Pan the camera'
      : `Pan to ${px}, ${py}`
  },
  label: 'Pan To',
  description: 'Move the camera centre to a world position',
  execute(ctx, x?: unknown, y?: unknown) {
    const current = ctx.position()
    ctx.setPosition(
      vec2f(
        clampOffset(finite(x, current.x)),
        clampOffset(finite(y, current.y)),
      ),
    )
  },
})

registerCommand({
  id: 'camera.panBy',
  describe: ([dx, dy]) => {
    const px = num(dx, 3)
    const py = num(dy, 3)
    return px === undefined || py === undefined
      ? 'Pan the camera'
      : `Pan by ${px}, ${py}`
  },
  label: 'Pan By',
  description: 'Move the camera centre by a world-space offset',
  execute(ctx, dx?: unknown, dy?: unknown) {
    const current = ctx.position()
    ctx.setPosition(
      vec2f(
        clampOffset(current.x + finite(dx, 0)),
        clampOffset(current.y + finite(dy, 0)),
      ),
    )
  },
})

registerCommand({
  id: 'camera.frame',
  describe: ([x, y, zoom]) => {
    const px = num(x, 3)
    const py = num(y, 3)
    const z = num(zoom, 3)
    return px === undefined || py === undefined || z === undefined
      ? 'Frame the camera'
      : `Frame ${px}, ${py} at zoom ${z}`
  },
  label: 'Frame Camera',
  // The three arguments were nowhere an agent could read them: the replay
  // guard rejects anything but exactly three, and the description said only
  // what the command was for. An agent reading this reached for an empty call
  // expecting auto-framing and got "expected exactly 3 arguments".
  description:
    'Pan and zoom in one step, so the move reads as one beat. Takes exactly three arguments: [x, y, zoom] — the world position to centre on and the zoom to land at. Does not auto-frame; use camera.center for a known starting point.',
  execute(ctx, x?: unknown, y?: unknown, zoom?: unknown) {
    const current = ctx.position()
    ctx.setPosition(
      vec2f(
        clampOffset(finite(x, current.x)),
        clampOffset(finite(y, current.y)),
      ),
    )
    ctx.setZoom(clampZoom(finite(zoom, ctx.zoom())))
  },
})
