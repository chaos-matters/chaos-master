import { mat3x3f, vec3f } from 'typegpu/data'

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
}

/**
 * World -> clip, column-major: `clip = c0 * world.x + c1 * world.y + c2`.
 *
 * In order: the pan picks the centre, the rotation turns the world around that
 * centre, the zoom scales what is left, and the aspect division comes last, in
 * screen space — a rotation applied after it would squash the turn on any
 * canvas that is not square. Positive rotation turns the camera, so the picture
 * turns the other way, which is what `cameraBasis`'s roll does in 3D.
 */
export function camera2DViewMatrix({
  x,
  y,
  zoom,
  rotation,
  aspect,
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
    vec3f(-sx * (c * x + s * y), sy * (s * x - c * y), 1),
  )
}
