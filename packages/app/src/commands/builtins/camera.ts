import { vec2f } from 'typegpu/data'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { registerCommand } from '../registry'

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
  label: 'Center Camera',
  description: 'Reset camera position to (0, 0) and zoom to 1',
  shortcut: 'Ctrl+0',
  execute(ctx) {
    ctx.setPosition(vec2f(0, 0))
    ctx.setZoom(1)
  },
})

registerCommand({
  id: 'camera.zoomTo',
  label: 'Zoom To',
  description: 'Set camera zoom to a specific level',
  execute(ctx, zoom?: unknown) {
    ctx.setZoom(clampZoom(finite(zoom, 1)))
  },
})

registerCommand({
  id: 'camera.zoomBy',
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
  label: 'Frame Camera',
  description: 'Pan and zoom in one step, so the move reads as one beat',
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
