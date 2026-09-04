import { vec2f } from 'typegpu/data'
import { camera3DDefault, MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { executeCommand, registerCommand } from '../registry'
import { num } from './describeArgs'
import type { CommandContext } from '../types'
import type { Camera3DObj } from '@/flame/schema/flameSchema'

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

/** The range the orbit's own R control offers. The schema leaves radius
 *  unbounded, and a radius of zero puts the eye inside the flame. */
const MIN_CAMERA_RADIUS = 0.1
const MAX_CAMERA_RADIUS = 100

function clampZoom(value: number): number {
  return Math.min(MAX_CAMERA_ZOOM_VALUE, Math.max(MIN_CAMERA_ZOOM_VALUE, value))
}

function clampOffset(value: number): number {
  return Math.min(MAX_CAMERA_OFFSET, Math.max(-MAX_CAMERA_OFFSET, value))
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampRadius(value: number): number {
  return Math.min(MAX_CAMERA_RADIUS, Math.max(MIN_CAMERA_RADIUS, value))
}

/**
 * 2 unless the flame says otherwise.
 *
 * Read defensively: a context assembled for the camera alone carries no
 * descriptor, and a viewport with no flame behind it is 2D by definition.
 */
function dimensionsOf(ctx: CommandContext): 2 | 3 {
  const read = ctx.flameDescriptor as
    | CommandContext['flameDescriptor']
    | undefined
  return read?.().renderSettings.dimensions === 3 ? 3 : 2
}

/**
 * Zoom, in three dimensions, is how close the orbit sits.
 *
 * The default radius of 5 is zoom 1, and twice the zoom is half the radius —
 * so the same five commands drive both viewports and an agent that has
 * learned `camera.zoomBy 2` does not need a second verb for a 3D flame.
 * Orbit angle is the one thing with no 2D counterpart, so it stays on
 * `flame.setRenderSetting camera3D.theta` / `camera3D.phi`.
 */
function radiusForZoom(zoom: number): number {
  return clampRadius(camera3DDefault.radius / clampZoom(zoom))
}

function zoomForRadius(radius: number): number {
  return camera3DDefault.radius / radius
}

/** The orbit as the commands need it, with anything malformed replaced.
 *
 *  Defensively, because a descriptor can say `dimensions: 3` and carry no
 *  orbit at all: `flame.setRenderSetting dimensions 3` writes the number
 *  straight into the store, and the schema only fills the default in on a
 *  parse. */
function orbitOf(ctx: CommandContext): {
  radius: number
  target: [number, number, number]
} {
  const stored: Camera3DObj | undefined =
    ctx.flameDescriptor().renderSettings.camera3D
  const camera = stored ?? camera3DDefault
  const [x, y, z] = camera.target
  return {
    radius: clampRadius(finite(camera.radius, camera3DDefault.radius)),
    target: [finite(x, 0), finite(y, 0), finite(z, 0)],
  }
}

/**
 * Through the render-setting path, exactly as the 2D setters go: it merges
 * the container, releases a held timeline frame, and — being nested inside a
 * command that is already recording — adds no step of its own.
 */
function setOrbit(ctx: CommandContext, patch: Partial<Camera3DObj>): void {
  executeCommand('flame.setRenderSetting', ctx, 'camera3D', patch)
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
    if (dimensionsOf(ctx) === 3) {
      const { theta, phi, radius } = camera3DDefault
      setOrbit(ctx, { theta, phi, radius, target: [0, 0, 0] })
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
  description:
    'Set camera zoom to a specific level. In 3D that is how close the orbit sits: zoom 1 is the default distance, zoom 2 is twice as close.',
  execute(ctx, zoom?: unknown) {
    const zoomValue = clampZoom(finite(zoom, 1))
    if (dimensionsOf(ctx) === 3) {
      setOrbit(ctx, { radius: radiusForZoom(zoomValue) })
      return
    }
    ctx.setZoom(zoomValue)
  },
})

registerCommand({
  id: 'camera.zoomBy',
  describe: ([factor]) => {
    const f = num(factor, 3)
    return f === undefined ? 'Zoom the camera' : `Zoom by ${f}x`
  },
  label: 'Zoom By',
  description:
    'Multiply the current zoom by a factor (2 = twice as close). In 3D it halves or doubles the orbit distance.',
  execute(ctx, factor?: unknown) {
    const f = finite(factor, 1)
    // A zero or negative factor is not a zoom, and would leave the viewport
    // in a state the schema rejects. Treat it as "no change".
    if (f <= 0) return
    if (dimensionsOf(ctx) === 3) {
      setOrbit(ctx, { radius: clampRadius(orbitOf(ctx).radius / f) })
      return
    }
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
  description:
    'Move the camera centre to a world position. In 3D that is the point the orbit looks at, moved in x and y; its depth is left where it is.',
  execute(ctx, x?: unknown, y?: unknown) {
    if (dimensionsOf(ctx) === 3) {
      const [tx, ty, tz] = orbitOf(ctx).target
      setOrbit(ctx, {
        target: [clampOffset(finite(x, tx)), clampOffset(finite(y, ty)), tz],
      })
      return
    }
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
  description:
    'Move the camera centre by a world-space offset. In 3D it slides the point the orbit looks at along x and y.',
  execute(ctx, dx?: unknown, dy?: unknown) {
    if (dimensionsOf(ctx) === 3) {
      const [tx, ty, tz] = orbitOf(ctx).target
      setOrbit(ctx, {
        target: [
          clampOffset(tx + finite(dx, 0)),
          clampOffset(ty + finite(dy, 0)),
          tz,
        ],
      })
      return
    }
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
    'Pan and zoom in one step, so the move reads as one beat. Takes exactly three arguments: [x, y, zoom] — the world position to centre on and the zoom to land at. Works in 3D too, where it moves the orbit target and its distance. Does not auto-frame; use camera.center for a known starting point.',
  execute(ctx, x?: unknown, y?: unknown, zoom?: unknown) {
    if (dimensionsOf(ctx) === 3) {
      const orbit = orbitOf(ctx)
      const [tx, ty, tz] = orbit.target
      setOrbit(ctx, {
        target: [clampOffset(finite(x, tx)), clampOffset(finite(y, ty)), tz],
        radius: radiusForZoom(finite(zoom, zoomForRadius(orbit.radius))),
      })
      return
    }
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
