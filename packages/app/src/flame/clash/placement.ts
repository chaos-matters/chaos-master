/**
 * Placing a Flame Clash fighter in the shared 3D arena without changing its
 * shape.
 *
 * Each map f of a fighter becomes G . f . G^-1 for its placement G (where it
 * stands, which way it faces, how big it is, how squashed by a hit). The chaos
 * game then draws exactly G applied to the fighter's own attractor, whatever
 * its variations are, because every variation still sees the point in the
 * fighter's own space: the pre-affine undoes G first and the post-affine
 * applies it last. A fighter's final transform is folded into G when it can be
 * inverted, so what the fighter plots alone is what it plots placed.
 *
 * One exception: wavesVar, popcornVar, fanVar and ringsVar read their
 * transform's affine coefficients as parameters, and placing rewrites those,
 * so a fighter that uses them bends a little differently while placed.
 */
import { toAffine3D } from '../transformFunction3D'

/** A 3D affine map: rows (a b c | d), (e f g | h), (i j k | l). */
export type Affine3 = ReturnType<typeof toAffine3D>
/** Any affine a flame stores: 2D, 3D, or partly filled. */
type AffineLike = Parameters<typeof toAffine3D>[0]
export type Vec3 = readonly [number, number, number]

export const IDENTITY_AFFINE: Affine3 = toAffine3D(undefined)

/** The map p -> outer(inner(p)). */
export function composeAffine(outer: Affine3, inner: Affine3): Affine3 {
  const o = outer
  const n = inner
  return {
    a: o.a * n.a + o.b * n.e + o.c * n.i,
    b: o.a * n.b + o.b * n.f + o.c * n.j,
    c: o.a * n.c + o.b * n.g + o.c * n.k,
    d: o.a * n.d + o.b * n.h + o.c * n.l + o.d,
    e: o.e * n.a + o.f * n.e + o.g * n.i,
    f: o.e * n.b + o.f * n.f + o.g * n.j,
    g: o.e * n.c + o.f * n.g + o.g * n.k,
    h: o.e * n.d + o.f * n.h + o.g * n.l + o.h,
    i: o.i * n.a + o.j * n.e + o.k * n.i,
    j: o.i * n.b + o.j * n.f + o.k * n.j,
    k: o.i * n.c + o.j * n.g + o.k * n.k,
    l: o.i * n.d + o.j * n.h + o.k * n.l + o.l,
  }
}

export function applyAffine(m: Affine3, [x, y, z]: Vec3): Vec3 {
  return [
    m.a * x + m.b * y + m.c * z + m.d,
    m.e * x + m.f * y + m.g * z + m.h,
    m.i * x + m.j * y + m.k * z + m.l,
  ]
}

/** Below this determinant a map squashes space flat and has no inverse. */
const SINGULAR = 1e-9

/** The inverse map, or undefined for one that flattens space. */
export function invertAffine(m: Affine3): Affine3 | undefined {
  // Cofactors of the linear part, as the rows of its adjugate.
  const A = m.f * m.k - m.g * m.j
  const B = m.c * m.j - m.b * m.k
  const C = m.b * m.g - m.c * m.f
  const det = m.a * A + m.e * B + m.i * C
  if (!Number.isFinite(det) || Math.abs(det) < SINGULAR) return undefined
  const s = 1 / det
  const linear = {
    a: A * s,
    b: B * s,
    c: C * s,
    e: (m.g * m.i - m.e * m.k) * s,
    f: (m.a * m.k - m.c * m.i) * s,
    g: (m.c * m.e - m.a * m.g) * s,
    i: (m.e * m.j - m.f * m.i) * s,
    j: (m.b * m.i - m.a * m.j) * s,
    k: (m.a * m.f - m.b * m.e) * s,
  }
  const [d, h, l] = applyAffine({ ...linear, d: 0, h: 0, l: 0 }, [
    m.d,
    m.h,
    m.l,
  ])
  return { ...linear, d: -d, h: -h, l: -l }
}

/**
 * Where a fighter stands and how. Angles are radians. `yaw` turns it about
 * the vertical axis (0 faces the camera's starting side, +z); `lean` tips its
 * top along the fight line, toward +x when positive. A hit `squash` below 1
 * compresses it along the fight line (the x axis) and swells it across,
 * keeping its volume; above 1 it stretches.
 */
export type Placement = {
  position: Vec3
  yaw: number
  lean: number
  scale: number
  squash: number
}

export const PLACEMENT_AT_ORIGIN: Placement = {
  position: [0, 0, 0],
  yaw: 0,
  lean: 0,
  scale: 1,
  squash: 1,
}

/** The placement as one map: translate . squash . lean . yaw . scale. */
export function placementAffine(p: Placement): Affine3 {
  const cy = Math.cos(p.yaw)
  const sy = Math.sin(p.yaw)
  const cl = Math.cos(p.lean)
  const sl = Math.sin(p.lean)
  const s = p.scale
  // Yaw about y, then the lean about z (top toward +x), then the scale.
  const turned: Affine3 = {
    a: cl * cy * s,
    b: sl * s,
    c: cl * sy * s,
    d: 0,
    e: -sl * cy * s,
    f: cl * s,
    g: -sl * sy * s,
    h: 0,
    i: -sy * s,
    j: 0,
    k: cy * s,
    l: 0,
  }
  const q = p.squash > 0 ? p.squash : 1
  const across = 1 / Math.sqrt(q)
  // The squash acts about the fighter's own centre, along the world x axis.
  const squashed: Affine3 = {
    ...IDENTITY_AFFINE,
    a: q,
    f: across,
    k: across,
  }
  const [x, y, z] = p.position
  return composeAffine(
    { ...IDENTITY_AFFINE, d: x, h: y, l: z },
    composeAffine(squashed, turned),
  )
}

/**
 * The map that takes a fighter from its own space to its place in the arena:
 * the placement after its final transform, or the placement alone when the
 * final transform has no inverse (and so cannot be folded in).
 */
export function fighterFrame(
  placement: Affine3,
  finalTransform: Affine3 | undefined,
): Affine3 {
  if (!finalTransform || !invertAffine(finalTransform)) return placement
  return composeAffine(placement, finalTransform)
}

/**
 * One transform conjugated by `frame`: its attractor contribution moves with
 * the frame and keeps its shape. `frameInverse` is passed in because every
 * transform of a fighter shares it.
 */
export function placeTransform<
  T extends { preAffine: AffineLike; postAffine: AffineLike },
>(
  transform: T,
  frame: Affine3,
  frameInverse: Affine3,
): T & { preAffine: Affine3; postAffine: Affine3 } {
  return {
    ...transform,
    preAffine: composeAffine(toAffine3D(transform.preAffine), frameInverse),
    postAffine: composeAffine(frame, toAffine3D(transform.postAffine)),
  }
}
