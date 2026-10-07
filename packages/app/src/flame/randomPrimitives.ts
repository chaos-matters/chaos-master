/**
 * The randomizing building blocks that generation and the mutation operators
 * share: variation params, weights and types, transform colors, and affine
 * coefficients, including the "smart" 2D and 3D affine mutations. Every draw
 * goes through the ambient source in randomSource.ts.
 */

import { random01, randomPerturbation, randomRange } from './randomSource'
import { isParametricVariationType, transformVariations, variationTypes, } from './variations'
import { getVariationDefault } from './variations/utils'
import { isParametricVariationType3D, isVariationType3D, transformVariations3D, } from './variations3D'
import type { TransformVariationType } from './variations'
import type { TransformVariationType3D } from './variations3D'

/**
 * Sigma for perturbing a variation parameter, scaled off its default magnitude.
 * Many params (offsets, angles) default to 0, which would otherwise force
 * sigma to 0 and permanently exclude them from randomization — so a minimum
 * base magnitude is used as a floor.
 */
const MIN_PARAM_SIGMA_BASE = 1

function paramSigma(defaultValue: number, sigmaScale: number): number {
  return (
    Math.max(Math.abs(defaultValue), MIN_PARAM_SIGMA_BASE) * 0.5 * sigmaScale
  )
}

/**
 * Loose view of a variation used while randomizing: the precise per-type param
 * unions can't be expressed here, so the mutation helpers treat every variation
 * through this shape. Values remain valid descriptors at runtime.
 */
export type RandomVariationLike = {
  type: string
  weight: number
  params?: Record<string, number>
}

/** Whether a variation type is 3D and/or parametric, resolved in one place. */
function variationDimInfo(vtype: string): {
  is3D: boolean
  isParametric: boolean
} {
  const is3D = isVariationType3D(vtype)
  const isParametric = is3D
    ? isParametricVariationType3D(vtype)
    : isParametricVariationType(vtype)
  return { is3D, isParametric }
}

/** Maps strength to a sigma scale from 5% (strength=0) to 100% (strength=1). */
function paramSigmaScale(strength: number): number {
  return 0.05 + strength * 0.95
}

/**
 * Perturb the parametric params of one variation type. Each param starts from
 * `existing` (when present) or falls back to the type's default, then is nudged
 * by a strength-scaled gaussian. Returns a fresh object.
 */
function perturbParametricParams(
  vtype: string,
  is3D: boolean,
  existing: Record<string, number> | undefined,
  strength: number,
  rateScale = 1,
): Record<string, number> {
  const defaults = (
    is3D
      ? transformVariations3D[vtype as TransformVariationType3D]
      : transformVariations[vtype]
  ) as { paramDefaults: Record<string, number> }
  const params: Record<string, number> = existing ? { ...existing } : {}
  const sigmaScale = paramSigmaScale(strength)
  for (const key of Object.keys(defaults.paramDefaults)) {
    const d = params[key] ?? defaults.paramDefaults[key]!
    params[key] = randomPerturbation(d, paramSigma(d, sigmaScale) * rateScale)
  }
  return params
}

/**
 * Randomize variation params with optional strength control.
 * strength=0 → mild perturbation, strength=1 → wild randomization.
 */
export function randomizeVariationParams(
  variationType: TransformVariationType | TransformVariationType3D,
  strength = 0.5,
): Record<string, number> | undefined {
  const { is3D, isParametric } = variationDimInfo(variationType)
  if (!isParametric) return undefined
  return perturbParametricParams(variationType, is3D, undefined, strength)
}

/**
 * In-place perturbation of an existing variation: randomize its parametric
 * params (when parametric) and nudge its weight. `rateScale` scales both
 * sigmas — the Mutation Lab's per-kind rate multiplier (1 = neutral).
 */
export function perturbVariationInPlace(
  v: RandomVariationLike,
  strength: number,
  rateScale = 1,
): void {
  const { is3D, isParametric } = variationDimInfo(v.type)
  if (isParametric) {
    v.params = perturbParametricParams(
      v.type,
      is3D,
      v.params,
      strength,
      rateScale,
    )
  }
  v.weight = randomPerturbation(
    v.weight,
    0.2 * strength * rateScale,
    [0.05, 1.0],
  )
}

/**
 * Build a fresh variation of `vtype`: its default descriptor at a random
 * weight, with randomized params when the type is parametric.
 */
export function buildRandomVariation(
  vtype: string,
  strength: number,
): Record<string, unknown> {
  const weight = randomRange(0.3, 1)
  const base = getVariationDefault(vtype, weight) as Record<string, unknown>
  const randomizedParams = randomizeVariationParams(vtype, strength)
  return randomizedParams ? { ...base, params: randomizedParams } : base
}

/** Normalize a variation record's weights so they sum to 1 (no-op if all 0). */
export function normalizeVariationWeights(
  variations: Record<string, { weight: number }>,
): void {
  const values = Object.values(variations)
  const totalWeight = values.reduce((sum, v) => sum + v.weight, 0)
  if (totalWeight > 0) {
    for (const v of values) {
      v.weight = v.weight / totalWeight
    }
  }
}

export function randomizeVariationType(
  currentType: TransformVariationType,
): TransformVariationType {
  const others = variationTypes.filter((t) => t !== currentType)
  return others[Math.floor(random01() * others.length)]!
}

/**
 * Pick a random variation type from a pool.
 */
export function pickRandomVariationType(
  pool: TransformVariationType[],
): TransformVariationType {
  return pool[Math.floor(random01() * pool.length)]!
}

export function randomizeAllColors<T extends Record<string, unknown>>(
  transforms: T,
  strength = 0.5,
): T {
  const keys = Object.keys(transforms)
  if (keys.length === 0) return transforms

  const result = { ...transforms }

  for (const tid of keys) {
    const t = (transforms as Record<string, unknown>)[tid] as Record<
      string,
      unknown
    >
    const existingColor = t.color as { x: number; y: number } | undefined
    // At strength 0: keep current color. At strength 1: fully random.
    const color = {
      x:
        existingColor && strength < 1
          ? randomPerturbation(existingColor.x, 0.15 * strength, [-0.4, 0.4])
          : randomRange(-0.4, 0.4),
      y:
        existingColor && strength < 1
          ? randomPerturbation(existingColor.y, 0.15 * strength, [-0.4, 0.4])
          : randomRange(-0.4, 0.4),
    }
    ;(result as Record<string, unknown>)[tid] = {
      ...t,
      color,
    }
  }

  // Anchor one transform at (0,0) and another at (1,1) for spread
  const anchor0Idx = Math.floor(random01() * keys.length)
  let anchor1Idx: number
  do {
    anchor1Idx = Math.floor(random01() * keys.length)
  } while (anchor1Idx === anchor0Idx && keys.length > 1)

  const tid0 = keys[anchor0Idx]!
  ;(result as Record<string, unknown>)[tid0] = {
    ...((result as Record<string, unknown>)[tid0] as object),
    color: { x: 0, y: 0 },
  }

  if (keys.length > 1) {
    const tid1 = keys[anchor1Idx]!
    ;(result as Record<string, unknown>)[tid1] = {
      ...((result as Record<string, unknown>)[tid1] as object),
      color: {
        x: randomRange(0.2, 0.35) * (random01() > 0.5 ? 1 : -1),
        y: randomRange(0.2, 0.35) * (random01() > 0.5 ? 1 : -1),
      },
    }
  }

  return result
}

/**
 * Perturb a single affine coefficient with strength control.
 * strength=0 → tiny nudge, strength=1 → wild across full range.
 */
export function randomizeAffineCoef(
  current: number,
  coefKey: string,
  strength = 0.5,
  is3D = false,
): number {
  const isTranslation = is3D
    ? coefKey === 'd' || coefKey === 'h' || coefKey === 'l'
    : coefKey === 'c' || coefKey === 'f'
  const range: [number, number] = isTranslation ? [-3, 3] : [-2, 2]
  // sigma goes from 0.03 (strength=0) to 0.9 (strength=1)
  const sigma = 0.03 + strength * 0.87
  return randomPerturbation(current, sigma, range)
}

/**
 * "Smart" affine mutation. Rather than perturbing each matrix coefficient
 * independently (`randomizeAffineCoef`, which easily collapses the map into a
 * degenerate, unrecognisable transform), this composes the existing affine
 * with a random similarity transform built from well-defined operations —
 * rotation, (an)isotropic scale, the occasional flip and a translation. Each
 * operation fires with its own probability and a magnitude scaled by
 * `strength`, so low strength nudges and high strength reshapes. The delta is
 * applied on the output side, keeping the linear part and translation
 * consistent. Mutates `af` in place.
 */
export function smartMutateAffine2D(
  af: Record<string, number>,
  strength: number,
): void {
  const a = af.a ?? 1
  const b = af.b ?? 0
  const c = af.c ?? 0
  const d = af.d ?? 0
  const e = af.e ?? 1
  const f = af.f ?? 0

  const angle = random01() < 0.85 ? randomRange(-1, 1) * strength * Math.PI : 0

  // Multiplicative scale, symmetric about 1 (exp of a symmetric range).
  let sx = 1
  let sy = 1
  if (random01() < 0.85) {
    const k = strength * 0.7
    const uniform = Math.exp(randomRange(-k, k))
    sx = uniform
    sy = uniform
    if (random01() < 0.5) {
      // Anisotropic squash/stretch.
      sx *= Math.exp(randomRange(-k, k) * 0.5)
      sy *= Math.exp(randomRange(-k, k) * 0.5)
    }
  }
  if (random01() < 0.12 * strength) sx = -sx // occasional flip

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // M = R(angle) · diag(sx, sy)
  const m00 = cos * sx
  const m01 = -sin * sy
  const m10 = sin * sx
  const m11 = cos * sy

  let dx = 0
  let dy = 0
  if (random01() < 0.85) {
    const tr = strength * 1.5
    dx = randomRange(-tr, tr)
    dy = randomRange(-tr, tr)
  }

  // L_new = M · L (linear part), t_new = M · t + delta (translation = c, f).
  af.a = m00 * a + m01 * d
  af.b = m00 * b + m01 * e
  af.c = m00 * c + m01 * f + dx
  af.d = m10 * a + m11 * d
  af.e = m10 * b + m11 * e
  af.f = m10 * c + m11 * f + dy
}

/**
 * 3D counterpart of {@link smartMutateAffine2D}. The 3×4 affine is laid out as
 * rows `(a b c | d)`, `(e f g | h)`, `(i j k | l)` — a 3×3 linear part plus the
 * translation column `(d, h, l)`. Composes with a random axis-angle rotation,
 * scale and translation on the output side. Mutates `af` in place.
 */
export function smartMutateAffine3D(
  af: Record<string, number>,
  strength: number,
): void {
  // Linear rows L and translation t.
  const a = af.a ?? 1
  const b = af.b ?? 0
  const cc = af.c ?? 0
  const e = af.e ?? 0
  const ff = af.f ?? 1
  const g = af.g ?? 0
  const ii = af.i ?? 0
  const j = af.j ?? 0
  const k = af.k ?? 1
  const tx = af.d ?? 0
  const ty = af.h ?? 0
  const tz = af.l ?? 0

  // Random rotation axis (uniform-ish) and angle.
  const angle = random01() < 0.85 ? randomRange(-1, 1) * strength * Math.PI : 0
  let ux = randomRange(-1, 1)
  let uy = randomRange(-1, 1)
  let uz = randomRange(-1, 1)
  const ulen = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1
  ux /= ulen
  uy /= ulen
  uz /= ulen
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const ic = 1 - cos
  // Rodrigues rotation matrix R.
  const r00 = cos + ux * ux * ic
  const r01 = ux * uy * ic - uz * sin
  const r02 = ux * uz * ic + uy * sin
  const r10 = uy * ux * ic + uz * sin
  const r11 = cos + uy * uy * ic
  const r12 = uy * uz * ic - ux * sin
  const r20 = uz * ux * ic - uy * sin
  const r21 = uz * uy * ic + ux * sin
  const r22 = cos + uz * uz * ic

  // Scale (uniform + optional anisotropy + occasional flip).
  let sx = 1
  let sy = 1
  let sz = 1
  if (random01() < 0.85) {
    const kk = strength * 0.7
    const uniform = Math.exp(randomRange(-kk, kk))
    sx = uniform
    sy = uniform
    sz = uniform
    if (random01() < 0.5) {
      sx *= Math.exp(randomRange(-kk, kk) * 0.5)
      sy *= Math.exp(randomRange(-kk, kk) * 0.5)
      sz *= Math.exp(randomRange(-kk, kk) * 0.5)
    }
  }
  if (random01() < 0.12 * strength) sx = -sx

  // M = R · diag(sx, sy, sz) → scale columns of R.
  const m00 = r00 * sx
  const m01 = r01 * sy
  const m02 = r02 * sz
  const m10 = r10 * sx
  const m11 = r11 * sy
  const m12 = r12 * sz
  const m20 = r20 * sx
  const m21 = r21 * sy
  const m22 = r22 * sz

  let dx = 0
  let dy = 0
  let dz = 0
  if (random01() < 0.85) {
    const tr = strength * 1.5
    dx = randomRange(-tr, tr)
    dy = randomRange(-tr, tr)
    dz = randomRange(-tr, tr)
  }

  // L_new = M · L
  af.a = m00 * a + m01 * e + m02 * ii
  af.b = m00 * b + m01 * ff + m02 * j
  af.c = m00 * cc + m01 * g + m02 * k
  af.e = m10 * a + m11 * e + m12 * ii
  af.f = m10 * b + m11 * ff + m12 * j
  af.g = m10 * cc + m11 * g + m12 * k
  af.i = m20 * a + m21 * e + m22 * ii
  af.j = m20 * b + m21 * ff + m22 * j
  af.k = m20 * cc + m21 * g + m22 * k
  // t_new = M · t + delta
  af.d = m00 * tx + m01 * ty + m02 * tz + dx
  af.h = m10 * tx + m11 * ty + m12 * tz + dy
  af.l = m20 * tx + m21 * ty + m22 * tz + dz
}
