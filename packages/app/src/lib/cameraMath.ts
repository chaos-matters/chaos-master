import { vec3 } from 'wgpu-matrix'
import type { Vec3 } from 'wgpu-matrix'

const WORLD_UP = vec3.fromValues(0, 1, 0)
// Used when forward is (almost) parallel to world-up (looking straight up/down),
// where cross(forward, worldUp) degenerates.
const WORLD_UP_FALLBACK = vec3.fromValues(0, 0, 1)

/**
 * Orthonormal camera basis for a forward direction + roll (radians).
 *
 * `forward` need not be normalized. With roll = 0 the basis matches the previous
 * fixed-world-up camera (right = forward × up, up = right × forward), so
 * non-rolled cameras are unchanged. Roll rotates the right/up pair around the
 * forward axis, giving a dynamic up vector for fly-mode roll + roll-aware
 * local-space movement.
 */
export function cameraBasis(
  forward: Vec3,
  roll: number,
): { forward: Vec3; right: Vec3; up: Vec3 } {
  const f = vec3.normalize(forward)
  // right = forward × world-up. Only fall back to an alternate reference when
  // that cross product is essentially zero (forward almost exactly parallel to
  // world-up — i.e. looking straight up/down). A looser threshold would flip the
  // up vector a few degrees off the pole and make the view "clap" mid-orbit.
  let rightRaw = vec3.cross(f, WORLD_UP)
  if (vec3.length(rightRaw) < 1e-4) {
    rightRaw = vec3.cross(f, WORLD_UP_FALLBACK)
  }
  const right0 = vec3.normalize(rightRaw)
  const up0 = vec3.normalize(vec3.cross(right0, f))
  const c = Math.cos(roll)
  const s = Math.sin(roll)
  // Rotate the (right0, up0) frame by `roll` around forward (both ⊥ forward).
  const right = vec3.add(vec3.scale(right0, c), vec3.scale(up0, s))
  const up = vec3.sub(vec3.scale(up0, c), vec3.scale(right0, s))
  return { forward: f, right, up }
}

/** Up vector to feed mat4.lookAt for a given forward + roll. */
export function rolledUpVector(forward: Vec3, roll: number): Vec3 {
  return cameraBasis(forward, roll).up
}

/**
 * Map a screen-space pointer delta (dx right, dy down) into the camera's
 * un-rolled right/up axes, so fly-mode look turns around the camera's own
 * (rolled) frame instead of the world azimuth. `dRight` drives yaw (theta),
 * `dUp` drives pitch (phi). With roll = 0 it is the identity: `{ dRight: dx,
 * dUp: -dy }`. Without this, any non-zero roll sends mouse-look off in the wrong
 * direction (the screen axes no longer line up with theta/phi).
 */
export function rollAdjustLookDelta(
  dx: number,
  dy: number,
  roll: number,
): { dRight: number; dUp: number } {
  const c = Math.cos(roll)
  const s = Math.sin(roll)
  return { dRight: dx * c + dy * s, dUp: dx * s - dy * c }
}
