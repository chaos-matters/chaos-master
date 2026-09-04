import type { AffineParams } from './affineTranform'

/**
 * The fixed isometric projection the affine handles are drawn on.
 *
 * Not a camera: the handles are a diagram of the transform, not a view of the
 * scene, and a diagram that swung around with the flame's orbit would be
 * unreadable. 135 degrees at half scale is the workspace editor's choice and
 * this is that function, lifted so the duel's own grid draws the same picture.
 */
const Z_ANGLE = (135 * Math.PI) / 180
const Z_SCALE = 0.5
const Z_COS = Math.cos(Z_ANGLE) * Z_SCALE
const Z_SIN = Math.sin(Z_ANGLE) * Z_SCALE

export function project3D(
  x: number,
  y: number,
  z: number,
): { x: number; y: number } {
  return { x: x + z * Z_COS, y: y + z * Z_SIN }
}

/**
 * The exact inverse, for a known depth.
 *
 * Two screen axes cannot decide three world ones, so a drag has to hold one
 * of them: with `z` fixed this is a bijection, which is what makes dragging a
 * handle in the projection plane an honest edit rather than a guess.
 */
export function unproject3D(
  px: number,
  py: number,
  z: number,
): { x: number; y: number } {
  return { x: px - z * Z_COS, y: py - z * Z_SIN }
}

/**
 * How far a screen displacement moves a handle when depth is what is changing.
 *
 * The projection sends `+z` along one diagonal, so the depth a drag asks for
 * is that displacement's component on it, divided by the diagonal's length.
 */
export function depthFromScreenDelta(dx: number, dy: number): number {
  const lengthSquared = Z_COS * Z_COS + Z_SIN * Z_SIN
  return (dx * Z_COS + dy * Z_SIN) / lengthSquared
}

/**
 * Promote a 2D affine to the kernel's 3D layout.
 *
 * Rows are `a,b,c,d` / `e,f,g,h` / `i,j,k,l`, translation in `d,h,l`. A 2D
 * affine dragged as if it were one of these is misread — its 2D y-row
 * `(d,e,f)` lands in the 3D y-row and the transform collapses to a plane.
 * Mirrors `ifsPipeline3D`'s own 2D-to-3D mapping, and is the same function the
 * workspace's editor uses.
 */
export function ensure3DAffine(t: AffineParams): AffineParams {
  const already3D =
    t.g !== undefined ||
    t.h !== undefined ||
    t.i !== undefined ||
    t.j !== undefined ||
    t.k !== undefined ||
    t.l !== undefined
  if (already3D) return t
  return {
    a: t.a ?? 1,
    b: t.b ?? 0,
    c: 0,
    d: t.c ?? 0,
    e: t.d ?? 0,
    f: t.e ?? 1,
    g: 0,
    h: t.f ?? 0,
    i: 0,
    j: 0,
    k: 1,
    l: 0,
  }
}

/** The origin and the three basis images, in world space. */
export function basis3D(t: AffineParams) {
  const a = ensure3DAffine(t)
  const o = { x: a.d ?? 0, y: a.h ?? 0, z: a.l ?? 0 }
  return {
    o,
    x: { x: o.x + (a.a ?? 1), y: o.y + (a.e ?? 0), z: o.z + (a.i ?? 0) },
    y: { x: o.x + (a.b ?? 0), y: o.y + (a.f ?? 1), z: o.z + (a.j ?? 0) },
    z: { x: o.x + (a.c ?? 0), y: o.y + (a.g ?? 0), z: o.z + (a.k ?? 1) },
  }
}
