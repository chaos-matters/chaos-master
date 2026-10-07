/**
 * Affine interpolation by decomposition.
 *
 * Lerping the linear part component-wise is the single most visible artefact a
 * naive tween produces: for a half turn `M_A = I` and `M_B = -I` pass through
 * the ZERO matrix at t = 0.5, so the flame implodes to a point and re-expands.
 * Decomposing first removes that failure by construction — the rotation goes
 * round, the scales never cross zero, and `|det M(t)|` stays bounded away from
 * it. `affine.test.ts` asserts exactly that.
 *
 * Convention (the one the resolver's seeded identity confirms:
 * `{a:1,b:0,c:0,d:0,e:1,f:0}`):
 *
 *     x' = a·x + b·y + c        M = [[a, b],       translation = (c, f)
 *     y' = d·x + e·y + f             [d, e]]
 *
 * and the QR factorisation used here is `M = R(θ) · [[sx, k], [0, sy]]`, with
 * `sx > 0` and the sign of `sy` carrying any reflection.
 */

import type { GlideAffine } from './types'

/** Below this the decomposition is numerically meaningless. */
export const NEAR_SINGULAR_DET = 1e-6
const TINY = 1e-12

export type AffineDecomposition = {
  /** Rotation in radians, in (-π, π] before unwrapping. */
  rotation: number
  /** Length of the first column. Always positive for a non-singular matrix. */
  scaleX: number
  /** `det / scaleX`. Negative exactly when the matrix reflects. */
  scaleY: number
  shear: number
  translateX: number
  translateY: number
  determinant: number
}

export function decomposeAffine2D(m: GlideAffine): AffineDecomposition {
  const { a, b, c, d, e, f } = m
  const determinant = a * e - b * d
  const scaleX = Math.hypot(a, d)
  if (scaleX < TINY) {
    // A zero first column has no rotation to speak of. Report the degenerate
    // decomposition rather than an angle invented out of atan2(0, 0); callers
    // check `isNearSingular` and fall back to a component lerp.
    return {
      rotation: 0,
      scaleX: 0,
      scaleY: 0,
      shear: 0,
      translateX: c,
      translateY: f,
      determinant,
    }
  }
  return {
    rotation: Math.atan2(d, a),
    scaleX,
    scaleY: determinant / scaleX,
    shear: (a * b + d * e) / scaleX,
    translateX: c,
    translateY: f,
    determinant,
  }
}

export function composeAffine2D(parts: AffineDecomposition): GlideAffine {
  const cos = Math.cos(parts.rotation)
  const sin = Math.sin(parts.rotation)
  return {
    a: cos * parts.scaleX,
    b: cos * parts.shear - sin * parts.scaleY,
    c: parts.translateX,
    d: sin * parts.scaleX,
    e: sin * parts.shear + cos * parts.scaleY,
    f: parts.translateY,
  }
}

/** True when either side is too close to singular for a stable decomposition. */
export function isNearSingular(m: GlideAffine): boolean {
  const determinant = m.a * m.e - m.b * m.d
  return (
    Math.abs(determinant) < NEAR_SINGULAR_DET || Math.hypot(m.a, m.d) < TINY
  )
}

/** The signed difference `to - from` folded into (-π, π]. */
export function shortestAngleDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2
  let delta = (to - from) % twoPi
  if (delta > Math.PI) delta -= twoPi
  if (delta <= -Math.PI) delta += twoPi
  return delta
}

/**
 * Rotation that takes the short way round.
 *
 * Exact at both ends: travelling the short arc from 359° to 1° arrives at
 * 361°, which is the same rotation but not the same NUMBER, and a glide has to
 * land on the target's stored value rather than a coterminal one. The snap at
 * t = 1 is invisible because the two angles are the same angle.
 */
export function lerpAngleShortest(from: number, to: number, t: number): number {
  if (t <= 0) return from
  if (t >= 1) return to
  return from + shortestAngleDelta(from, to) * t
}

/**
 * Scale interpolation that never passes through zero.
 *
 * 1 → 4 goes through 2, not 2.5, which is what "twice as big" looks like
 * halfway. A sign change (a reflection in that axis) has no such path, so it
 * is the one case that IS linear: a genuine squash through zero and out the
 * other side, which is what the transform actually does.
 */
export function lerpScaleLog(from: number, to: number, t: number): number {
  if (from === 0 || to === 0 || Math.sign(from) !== Math.sign(to)) {
    return from + (to - from) * t
  }
  const sign = Math.sign(from)
  return (
    sign *
    Math.exp(Math.log(Math.abs(from)) * (1 - t) + Math.log(Math.abs(to)) * t)
  )
}

export function lerpNumber(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/** `to - from` crosses a reflection: no rotation-plus-positive-scale path exists. */
export function isReflection(from: GlideAffine, to: GlideAffine): boolean {
  const detA = from.a * from.e - from.b * from.d
  const detB = to.a * to.e - to.b * to.d
  return detA !== 0 && detB !== 0 && Math.sign(detA) !== Math.sign(detB)
}

export function lerpAffineLinear(
  from: GlideAffine,
  to: GlideAffine,
  t: number,
): GlideAffine {
  return {
    a: lerpNumber(from.a, to.a, t),
    b: lerpNumber(from.b, to.b, t),
    c: lerpNumber(from.c, to.c, t),
    d: lerpNumber(from.d, to.d, t),
    e: lerpNumber(from.e, to.e, t),
    f: lerpNumber(from.f, to.f, t),
  }
}

/**
 * The decomposed path from `from` to `to` at eased time `t`.
 *
 * Exact at both ends — `t <= 0` and `t >= 1` return the endpoint itself rather
 * than a recomposition of it, so a component that does not differ between the
 * two is written back bit-for-bit and the baked keyframes agree with the
 * sampler at frame 0 and at the last frame.
 */
export function interpolateAffine(
  from: GlideAffine,
  to: GlideAffine,
  t: number,
): GlideAffine {
  if (t <= 0) return { ...from }
  if (t >= 1) return { ...to }
  if (isNearSingular(from) || isNearSingular(to)) {
    return lerpAffineLinear(from, to, t)
  }
  const a = decomposeAffine2D(from)
  const b = decomposeAffine2D(to)
  return composeAffine2D({
    rotation: lerpAngleShortest(a.rotation, b.rotation, t),
    scaleX: lerpScaleLog(a.scaleX, b.scaleX, t),
    scaleY: lerpScaleLog(a.scaleY, b.scaleY, t),
    shear: lerpNumber(a.shear, b.shear, t),
    translateX: lerpNumber(a.translateX, b.translateX, t),
    translateY: lerpNumber(a.translateY, b.translateY, t),
    determinant: 0,
  })
}

export const AFFINE_COMPONENTS = ['a', 'b', 'c', 'd', 'e', 'f'] as const

/**
 * How far the decomposed path strays from the straight one, as an absolute
 * component distance sampled across the transition.
 *
 * A pure translation, a pure shear or an unchanged linear part all score zero,
 * which is the cheap precheck that keeps the common edit down to two keyframes
 * per coefficient instead of one per frame.
 */
export function decomposedDeviation(
  from: GlideAffine,
  to: GlideAffine,
  samples = 8,
): number {
  let worst = 0
  for (let index = 1; index < samples; index++) {
    const t = index / samples
    const curved = interpolateAffine(from, to, t)
    const straight = lerpAffineLinear(from, to, t)
    for (const key of AFFINE_COMPONENTS) {
      worst = Math.max(worst, Math.abs(curved[key] - straight[key]))
    }
  }
  return worst
}
