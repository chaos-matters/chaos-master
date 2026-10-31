import { ensure3DAffine } from '@/flame/affine3DView'
import type { AffineParams } from '@/flame/affineTranform'

/**
 * The maths of the affine editor's 3D drags, out of the component so a drag
 * can be replayed against a real store without a GPU.
 *
 * Every drag here is measured from pointer-down: the pointer's offset from
 * where it grabbed, applied to the transform as it was when it grabbed.
 */

/**
 * The transform at pointer-down, in the 3D layout, as a plain copy.
 *
 * The copy is the point. The editor's `transform` prop is a node of the flame
 * store, and `ensure3DAffine` hands an affine that is already 3D back as that
 * same node. Each move's write reaches the store through `reconcile`, which
 * updates the node in place, so a grab that kept the node would read the
 * previous move's result as "the transform at pointer-down" and add the whole
 * offset to it again: a small drag ran the handle off the grid and a small
 * turn spun it round several times (affineDrag3D.test.ts). The 2D drags copy
 * with a spread for the same reason.
 */
export function grab3DAffine(transform: AffineParams): AffineParams {
  return { ...ensure3DAffine(transform) }
}

/** The grabbed transform moved by a world-space offset in the projection plane. */
export function translated3D(
  grab: AffineParams,
  dx: number,
  dy: number,
): AffineParams {
  return { ...grab, d: (grab.d ?? 0) + dx, h: (grab.h ?? 0) + dy }
}

export type LocalAxis = 'X' | 'Y' | 'Z'

/**
 * Each local axis's column of the linear part, as its x, y and z
 * coefficients, with the identity's value for each.
 */
export const LOCAL_AXIS_COEFS = {
  X: [
    ['a', 1],
    ['e', 0],
    ['i', 0],
  ],
  Y: [
    ['b', 0],
    ['f', 1],
    ['j', 0],
  ],
  Z: [
    ['c', 0],
    ['g', 0],
    ['k', 1],
  ],
} as const satisfies Record<
  LocalAxis,
  readonly (readonly [keyof AffineParams, number])[]
>

/**
 * The grabbed transform with one local axis turned in the projection plane
 * and scaled: `cos` and `sin` turn its x and y coefficients, `scale` scales
 * all three (negative for the dashed end, which flips the axis).
 */
export function scaledRotated3D(
  grab: AffineParams,
  axis: LocalAxis,
  cos: number,
  sin: number,
  scale: number,
): AffineParams {
  const [[px, dx], [py, dy], [pz, dz]] = LOCAL_AXIS_COEFS[axis]
  const x = grab[px] ?? dx
  const y = grab[py] ?? dy
  const z = grab[pz] ?? dz
  return {
    ...grab,
    [px]: (x * cos - y * sin) * scale,
    [py]: (x * sin + y * cos) * scale,
    [pz]: z * scale,
  }
}

type Vec2 = { readonly x: number; readonly y: number }

/**
 * The turn and stretch from the grab point to the pointer, both measured from
 * the handle's centre in world space (y up): `cos` and `sin` of the angle
 * from grab to pointer, counter-clockwise positive, and the ratio of their
 * distances. `scaledRotated3D` turns the axis by exactly this angle, so the
 * end handle stays under the pointer.
 */
export function pointerTurn(grab: Vec2, pointer: Vec2) {
  const grabLength = Math.hypot(grab.x, grab.y)
  const pointerLength = Math.hypot(pointer.x, pointer.y)
  const ratio = pointerLength / (grabLength || 0.001)
  const g = { x: grab.x / (grabLength || 1), y: grab.y / (grabLength || 1) }
  const p = {
    x: pointer.x / (pointerLength || 1),
    y: pointer.y / (pointerLength || 1),
  }
  // grab x pointer, not pointer x grab: the 2D drag's operand order, copied
  // here, read every turn backwards and the axis swung away from the pointer.
  return {
    cos: g.x * p.x + g.y * p.y,
    sin: g.x * p.y - g.y * p.x,
    ratio,
  }
}
