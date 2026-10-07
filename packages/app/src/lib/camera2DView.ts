import { mat3x3f, vec3f } from 'typegpu/data'
import { NO_SHIFT } from './canvasFraming'
import type { ViewShift } from './canvasFraming'

/**
 * What the 2D camera does to the picture, as a matrix.
 *
 * Every point the IFS renderer plots goes through `camera2DWorldToClip`, and
 * that function is nothing but this matrix (see `flame/ifsPipeline.ts`). Kept
 * out of the component so the framing can be checked with numbers instead of
 * with a GPU and a screenshot.
 */
export type Camera2DView = {
  /** Camera centre in world units: what sits in the middle of the canvas. */
  x: number
  y: number
  /** Zoom 1 shows two world units of height; zoom 2 shows one. */
  zoom: number
  /** Radians. Turns the camera, so the picture turns the other way. */
  rotation: number
  /** Canvas width / height. */
  aspect: number
  /**
   * Where the camera centre lands on the canvas, in clip units: none puts it
   * in the middle. The view's framing around chrome that floats over the
   * canvas (lib/canvasFraming.ts), which moves the whole picture on screen
   * and nothing in the flame.
   */
  shift?: ViewShift
}

/**
 * World -> clip, column-major: `clip = c0 * world.x + c1 * world.y + c2`.
 *
 * In order: the pan picks the centre, the rotation turns the world around that
 * centre, the zoom scales what is left, and the aspect division comes last, in
 * screen space — a rotation applied after it would squash the turn on any
 * canvas that is not square. Positive rotation turns the camera, so the picture
 * turns the other way, which is what `cameraBasis`'s roll does in 3D. The shift
 * is added after all of it, in clip space, so it moves the finished picture
 * without turning or scaling it; the inverse undoes it, so a pointer still
 * finds the world point under it.
 */
export function camera2DViewMatrix({
  x,
  y,
  zoom,
  rotation,
  aspect,
  shift = NO_SHIFT,
}: Camera2DView) {
  // At rotation 0 this is the orthographic box the camera has always been:
  // x over [x - aspect/zoom, x + aspect/zoom], y over [y - 1/zoom, y + 1/zoom].
  const sx = zoom / aspect
  const sy = zoom
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  // prettier-ignore
  return mat3x3f(
    vec3f(sx * c, -sy * s, 0),
    vec3f(sx * s, sy * c, 0),
    vec3f(-sx * (c * x + s * y) + shift.x, sy * (s * x - c * y) + shift.y, 1),
  )
}

/**
 * Where the camera's position goes when it zooms by `ratio`, the old zoom
 * over the new, about the world point `world` under the pointer: towards the
 * point by 1 - ratio of the way, so the point stays under the pointer. The
 * view shift takes no part: it moves the finished picture, the point under
 * the pointer included (camera2DView.test.ts). WheelZoomCamera2D zooms by it.
 */
export function zoomedPosition(
  position: { readonly x: number; readonly y: number },
  world: { readonly x: number; readonly y: number },
  ratio: number,
): { x: number; y: number } {
  return {
    x: position.x + (world.x - position.x) * (1 - ratio),
    y: position.y + (world.y - position.y) * (1 - ratio),
  }
}
