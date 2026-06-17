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
  const upRef =
    Math.abs(vec3.dot(f, WORLD_UP)) > 0.999 ? WORLD_UP_FALLBACK : WORLD_UP
  const right0 = vec3.normalize(vec3.cross(f, upRef))
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
