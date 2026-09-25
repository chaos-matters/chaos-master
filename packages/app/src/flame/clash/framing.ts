/**
 * Bringing two fighters of any size to the same scale, from the camera each
 * one was saved with.
 *
 * Flames are posed at wildly different scales, and nothing cheap measures an
 * attractor. But every flame carries the view its author framed it in, so the
 * clash reads the fighter's middle and size off that: a 3D flame's orbit
 * target and the half-height its orbit radius and field of view show, a 2D
 * flame's camera centre and the half-height its zoom shows. The framing map
 * moves that middle to the origin, turns the fighter so the side its author
 * looked at faces the arena's front, and scales the shown half-height to 1.
 */
import { camera3DDefault } from '../schema/flameSchema'
import { composeAffine, IDENTITY_AFFINE } from './placement'
import type { FlameDescriptor } from '../schema/flameSchema'
import type { Affine3 } from './placement'

/** Scales outside this range mean a broken camera, not a real framing. */
const MIN_SCALE = 0.02
const MAX_SCALE = 50

const finite = (x: number | undefined, fallback: number) =>
  x !== undefined && Number.isFinite(x) ? x : fallback

function scaled(affine: Affine3, s: number): Affine3 {
  const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
  return composeAffine({ ...IDENTITY_AFFINE, a: k, f: k, k }, affine)
}

/** The map from a fighter's own space to the arena's unit framing. */
export function authoredFraming(flame: FlameDescriptor): Affine3 {
  const settings = flame.renderSettings
  if (settings.dimensions === 3) {
    const cam = { ...camera3DDefault, ...settings.camera3D }
    const [tx, ty, tz] = cam.target
    const radius = finite(cam.radius, camera3DDefault.radius)
    const fov = finite(cam.fov, camera3DDefault.fov)
    const halfHeight = radius * Math.tan(((fov / 2) * Math.PI) / 180)
    // Turn about the vertical axis so the author's viewing side faces +z,
    // where the arena camera starts.
    const theta = finite(cam.theta, 0)
    const c = Math.cos(-theta)
    const s = Math.sin(-theta)
    const turn: Affine3 = { ...IDENTITY_AFFINE, a: c, c: s, i: -s, k: c }
    const centred = composeAffine(turn, {
      ...IDENTITY_AFFINE,
      d: -tx,
      h: -ty,
      l: -tz,
    })
    return scaled(centred, halfHeight > 0 ? 1 / halfHeight : 1)
  }
  const camera = settings.camera
  const [x, y] = camera.position
  const zoom = finite(camera.zoom, 1)
  // The 2D view turns the world by -rotation around its centre.
  const rotation = finite(camera.rotation, 0)
  const c = Math.cos(-rotation)
  const s = Math.sin(-rotation)
  const turn: Affine3 = { ...IDENTITY_AFFINE, a: c, b: -s, e: s, f: c }
  const centred = composeAffine(turn, { ...IDENTITY_AFFINE, d: -x, h: -y })
  return scaled(centred, zoom > 0 ? zoom : 1)
}
