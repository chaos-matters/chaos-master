import { deepClone } from '@/utils/clone'
import { recordEntries } from '@/utils/record'
import { validateFlame } from './schema/flameSchema'
import { generateTransformId, generateVariationId } from './transformFunction'
import { isParametricVariationType, transformVariations, variationTypes, } from './variations'
import { getVariationDefault } from './variations/utils'
import { isParametricVariationType3D, isVariationType3D, transformVariations3D, variationTypes3D, } from './variations3D'
import type { FlameDescriptor } from './schema/flameSchema'
import type { TransformVariationType } from './variations'
import type { TransformVariationType3D } from './variations3D'

export type RandomSource = () => number

let activeRandomSource: RandomSource = Math.random

/** Run `fn` with every random01()-based helper drawing from `source`.
 *  Exported for deterministic wrappers (seeded generate/mutate commands,
 *  benchmarks); ambient callers keep Math.random. */
export function withRandomSource<T>(source: RandomSource, fn: () => T): T {
  const previous = activeRandomSource
  activeRandomSource = source
  try {
    return fn()
  } finally {
    activeRandomSource = previous
  }
}

/** Small deterministic CPU PRNG used to snapshot reproducible generated flames. */
export function createSeededRandomSource(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

export function random01(): number {
  return activeRandomSource()
}

export function randomRange(min: number, max: number): number {
  return min + random01() * (max - min)
}

export function randomPerturbation(
  current: number,
  sigma: number,
  clampRange?: [number, number],
): number {
  let sum = 0
  for (let i = 0; i < 6; i++) sum += random01()
  const gaussian = (sum - 3) * sigma
  const result = current + gaussian
  if (clampRange)
    return Math.max(clampRange[0], Math.min(clampRange[1], result))
  return result
}

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
type RandomVariationLike = {
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
function perturbVariationInPlace(
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
function buildRandomVariation(
  vtype: string,
  strength: number,
): Record<string, unknown> {
  const weight = randomRange(0.3, 1)
  const base = getVariationDefault(vtype, weight) as Record<string, unknown>
  const randomizedParams = randomizeVariationParams(vtype, strength)
  return randomizedParams ? { ...base, params: randomizedParams } : base
}

/** Normalize a variation record's weights so they sum to 1 (no-op if all 0). */
function normalizeVariationWeights(
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

/**
 * Build a randomized identity affine for a new transform: identity coefficients
 * (2D: a,e = 1; 3D: a,f,k = 1) each perturbed by {@link randomizeAffineCoef}.
 * Pre- and post-affine share this same starting point.
 */
function makeRandomizedIdentityAffine(
  dims: number,
  strength: number,
): Record<string, number> {
  const is3D = dims === 3
  if (is3D) {
    return {
      a: randomizeAffineCoef(1, 'a', strength, true),
      b: randomizeAffineCoef(0, 'b', strength, true),
      c: randomizeAffineCoef(0, 'c', strength, true),
      d: randomizeAffineCoef(0, 'd', strength, true),
      e: randomizeAffineCoef(0, 'e', strength, true),
      f: randomizeAffineCoef(1, 'f', strength, true),
      g: randomizeAffineCoef(0, 'g', strength, true),
      h: randomizeAffineCoef(0, 'h', strength, true),
      i: randomizeAffineCoef(0, 'i', strength, true),
      j: randomizeAffineCoef(0, 'j', strength, true),
      k: randomizeAffineCoef(1, 'k', strength, true),
      l: randomizeAffineCoef(0, 'l', strength, true),
    }
  }
  return {
    a: randomizeAffineCoef(1, 'a', strength, false),
    b: randomizeAffineCoef(0, 'b', strength, false),
    c: randomizeAffineCoef(0, 'c', strength, false),
    d: randomizeAffineCoef(0, 'd', strength, false),
    e: randomizeAffineCoef(1, 'e', strength, false),
    f: randomizeAffineCoef(0, 'f', strength, false),
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

export interface GenerateRandomFlameConfig {
  strength: number
  minTransforms: number
  maxTransforms: number
  minVariations: number
  maxVariations: number
  allowedVariations: (TransformVariationType | TransformVariationType3D)[]
  dimensions?: number
}

/**
 * Point initializer ranges / defaults for 3D/2D.
 */
export function generateRandomFlame(
  config: GenerateRandomFlameConfig,
): FlameDescriptor {
  const {
    strength,
    minTransforms,
    maxTransforms,
    minVariations,
    maxVariations,
    allowedVariations,
  } = config

  const dims = config.dimensions ?? 2

  const pool =
    allowedVariations.length > 0
      ? allowedVariations
      : dims === 3
        ? [...variationTypes3D]
        : [...variationTypes]

  const transformCount = Math.floor(
    randomRange(minTransforms, maxTransforms + 1),
  )

  const transforms: Record<string, unknown> = {}

  for (let t = 0; t < transformCount; t++) {
    const tid = generateTransformId(`logo_${t}`)

    const varCount = Math.floor(randomRange(minVariations, maxVariations + 1))
    const usedTypes = new Set<
      TransformVariationType | TransformVariationType3D
    >()
    const variations: Record<string, unknown> = {}

    for (let v = 0; v < varCount; v++) {
      const available = pool.filter((vt) => !usedTypes.has(vt))
      if (available.length === 0) break
      const vtype = pickRandomVariationType(available)
      usedTypes.add(vtype)

      const vid = generateVariationId()
      variations[vid] = buildRandomVariation(vtype, strength)
    }

    // Normalize variation weights to sum to 1
    normalizeVariationWeights(variations as Record<string, { weight: number }>)

    transforms[tid] = {
      probability: 1 / transformCount,
      preAffine: makeRandomizedIdentityAffine(dims, strength),
      postAffine: makeRandomizedIdentityAffine(dims, strength),
      color: { x: randomRange(-0.4, 0.4), y: randomRange(-0.4, 0.4) },
      variations,
      visible: true,
    }
  }

  const coloredTransforms = randomizeAllColors(transforms, strength)

  return validateFlame({
    version: '1.0',
    metadata: { name: '', description: '', author: 'unknown' },
    renderSettings: {
      exposure: 0.3,
      skipIters: 15,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      camera: { zoom: 1, position: [0, 0], rotation: 0 },
      colorInitMode: 'colorInitPosition',
      pointInitMode: 'pointInitUnitDisk',
      vibrancy: 0.5,
      contrast: 1,
      gamma: 2.2,
      highlightPower: 0.5,
      palettePhase: 0,
      paletteSpeed: 0.5,
      densityEstimationQuality: 0.8,
      estimatorCurve: 0.5,
      paletteMode: 0,
      dimensions: dims,
      depthColorPower: 0.0,
      lightDirection: [-0.5, 0.5, -1.0],
      lightPower: 0.0,
      camera3D: {
        theta: 0,
        phi: Math.PI / 2,
        radius: 5,
        target: [0, 0, 0],
        fov: 60,
      },
    },
    transforms: coloredTransforms,
  })
}

/**
 * Deterministic benchmark-friendly random flame.
 *
 * The regular randomizer deliberately uses fresh UUIDs and ambient randomness.
 * Benchmarks need a stable descriptor, so this runs the same generator under a
 * seeded source and canonicalizes transform/variation ids afterward.
 */
export function generateSeededRandomFlame(
  config: GenerateRandomFlameConfig,
  seed: number,
): FlameDescriptor {
  const generated = withRandomSource(createSeededRandomSource(seed), () =>
    generateRandomFlame(config),
  )
  const transforms = Object.fromEntries(
    Object.values(generated.transforms).map((transform, transformIndex) => [
      `_benchmark_${seed >>> 0}_${transformIndex}`,
      {
        ...transform,
        variations: Object.fromEntries(
          Object.values(transform.variations).map(
            (variation, variationIndex) => [
              `benchmark_${transformIndex}_${variationIndex}`,
              variation,
            ],
          ),
        ),
      },
    ]),
  )

  return {
    ...generated,
    metadata: {
      ...generated.metadata,
      name: `Surprise ${seed >>> 0}`,
      description: `Deterministic benchmark flame generated from seed ${seed >>> 0}.`,
    },
    transforms,
  }
}

export interface MutateFlameOptions {
  mutateAffine: boolean
  /**
   * How affine coefficients are mutated when `mutateAffine` is on. `'smart'`
   * composes the affine with random rotate/scale/translate operations (see
   * {@link smartMutateAffine2D}); `'full'` perturbs every coefficient
   * independently (`randomizeAffineCoef`).
   */
  affineMode: 'smart' | 'full'
  /** 0–1, how strongly affine coefficients drift (default 0.5). */
  affineMutationRate?: number
  mutateVariations: 'modify' | 'all' | 'none'
  /** 0–1, magnitude of variation-weight perturbation (default 0.5). */
  variationWeightRate?: number
  /** 0–1, probability of swapping a variation type entirely (default 0.1). */
  variationSwapChance?: number
  mutateColors: boolean
  /** 0–1, how strongly OkLab color values shift (default 0.4). */
  colorMutationRate?: number
  /** 0–0.3, probability of adding a new random transform (default 0). */
  addTransformChance?: number
  /** 0–0.3, probability of removing a transform (default 0). */
  removeTransformChance?: number
  /** If provided, restrict mutation to only these transform IDs. */
  selectedTransformIds?: string[]
}

/** Sensible defaults for the new fine-grained rate fields. */
export const MUTATION_RATE_DEFAULTS = {
  affineMutationRate: 0.5,
  variationWeightRate: 0.5,
  variationSwapChance: 0.1,
  colorMutationRate: 0.4,
  addTransformChance: 0,
  removeTransformChance: 0,
} as const

/** Presets for common mutation styles. */
export const MUTATION_PRESETS = {
  Subtle: {
    affineMutationRate: 0.15,
    variationWeightRate: 0.15,
    variationSwapChance: 0.02,
    colorMutationRate: 0.1,
    addTransformChance: 0,
    removeTransformChance: 0,
  },
  Moderate: {
    affineMutationRate: 0.4,
    variationWeightRate: 0.4,
    variationSwapChance: 0.1,
    colorMutationRate: 0.3,
    addTransformChance: 0,
    removeTransformChance: 0,
  },
  Chaotic: {
    affineMutationRate: 0.8,
    variationWeightRate: 0.8,
    variationSwapChance: 0.35,
    colorMutationRate: 0.7,
    addTransformChance: 0.1,
    removeTransformChance: 0.05,
  },
  Structural: {
    affineMutationRate: 0.2,
    variationWeightRate: 0.2,
    variationSwapChance: 0,
    colorMutationRate: 0.1,
    addTransformChance: 0.25,
    removeTransformChance: 0.2,
  },
} as const

export type MutationPresetName = keyof typeof MUTATION_PRESETS

export function mutateFlame(
  flame: FlameDescriptor,
  config: GenerateRandomFlameConfig,
  options: MutateFlameOptions,
): FlameDescriptor {
  const { strength, minVariations, maxVariations, allowedVariations } = config
  const dims = config.dimensions ?? 2

  // Effective rates — use explicit option values, falling back to defaults.
  const affineRate =
    options.affineMutationRate ?? MUTATION_RATE_DEFAULTS.affineMutationRate
  const weightRate =
    options.variationWeightRate ?? MUTATION_RATE_DEFAULTS.variationWeightRate
  const swapChance =
    options.variationSwapChance ?? MUTATION_RATE_DEFAULTS.variationSwapChance
  const colorRate =
    options.colorMutationRate ?? MUTATION_RATE_DEFAULTS.colorMutationRate
  const addChance =
    options.addTransformChance ?? MUTATION_RATE_DEFAULTS.addTransformChance
  const removeChance =
    options.removeTransformChance ??
    MUTATION_RATE_DEFAULTS.removeTransformChance

  // Effective affine strength: base strength scaled by affine mutation rate.
  const affineStrength = strength * affineRate

  const mutated = deepClone(flame)
  const transforms = mutated.transforms

  // Loose per-transform view of variations (see RandomVariationLike): the
  // precise per-variation param unions can't be expressed here, and values stay
  // valid descriptors at runtime (mutated in place, or built via defaults).
  type RandomVariation = RandomVariationLike

  const pool =
    allowedVariations.length > 0
      ? allowedVariations
      : dims === 3
        ? [...variationTypes3D]
        : [...variationTypes]

  // Mutation Lab: occasionally swap a variation's type for another from the
  // pool (params re-randomized for the new type, or dropped when it has none).
  const maybeSwapVariationType = (v: RandomVariation) => {
    if (swapChance <= 0 || random01() >= swapChance) return
    const others = pool.filter((vt) => vt !== v.type)
    if (others.length === 0) return
    const newType = pickRandomVariationType(others)
    v.type = newType
    const randomizedParams = randomizeVariationParams(newType, strength)
    if (randomizedParams) {
      v.params = randomizedParams
    } else {
      delete v.params
    }
  }

  // Determine which transform IDs to iterate over.
  const allEntries = recordEntries(transforms)
  const targetIds = options.selectedTransformIds

  // --- Structural mutation: remove transforms ---
  const entriesAfterRemoval =
    removeChance > 0 && allEntries.length > 1
      ? allEntries.filter(([tid]) => {
          if (targetIds && !targetIds.includes(tid)) return true // keep non-targeted
          return random01() >= removeChance
        })
      : allEntries

  const transformEntries =
    targetIds && targetIds.length > 0
      ? entriesAfterRemoval.filter(([tid]) => targetIds.includes(tid as string))
      : entriesAfterRemoval

  // --- Structural mutation: add transforms ---
  let addedCount = 0
  if (addChance > 0) {
    while (random01() < addChance && addedCount < 3) {
      addedCount++
    }
  }

  // Helper to create a new random transform (used by addTransformChance).
  const createRandomTransform = () => {
    const varCount = Math.floor(randomRange(minVariations, maxVariations + 1))
    const usedTypes = new Set<
      TransformVariationType | TransformVariationType3D
    >()
    const variations: Record<string, unknown> = {}

    for (let v = 0; v < varCount; v++) {
      const available = pool.filter((vt) => !usedTypes.has(vt))
      if (available.length === 0) break
      const vtype = pickRandomVariationType(available)
      usedTypes.add(vtype)

      const vid = generateVariationId()
      const weight = randomRange(0.3, 1)
      const base = getVariationDefault(vtype, weight) as Record<string, unknown>
      const is3D = isVariationType3D(vtype)
      const isParametric = is3D
        ? isParametricVariationType3D(vtype)
        : isParametricVariationType(vtype)
      if (isParametric) {
        const randomizedParams = randomizeVariationParams(vtype, strength)
        if (randomizedParams) {
          variations[vid] = { ...base, params: randomizedParams }
          continue
        }
      }
      variations[vid] = base
    }

    const varEntries = recordEntries(variations)
    const totalWeight = varEntries.reduce(
      (sum, [, v]) => sum + ((v as Record<string, unknown>).weight as number),
      0,
    )
    if (totalWeight > 0) {
      for (const [vid] of varEntries) {
        ;(variations[vid] as Record<string, unknown>).weight =
          ((variations[vid] as Record<string, unknown>).weight as number) /
          totalWeight
      }
    }

    return {
      probability: randomRange(0.3, 1),
      preAffine:
        dims === 3
          ? {
              a: randomizeAffineCoef(1, 'a', strength, true),
              b: randomizeAffineCoef(0, 'b', strength, true),
              c: randomizeAffineCoef(0, 'c', strength, true),
              d: randomizeAffineCoef(0, 'd', strength, true),
              e: randomizeAffineCoef(0, 'e', strength, true),
              f: randomizeAffineCoef(1, 'f', strength, true),
              g: randomizeAffineCoef(0, 'g', strength, true),
              h: randomizeAffineCoef(0, 'h', strength, true),
              i: randomizeAffineCoef(0, 'i', strength, true),
              j: randomizeAffineCoef(0, 'j', strength, true),
              k: randomizeAffineCoef(1, 'k', strength, true),
              l: randomizeAffineCoef(0, 'l', strength, true),
            }
          : {
              a: randomizeAffineCoef(1, 'a', strength, false),
              b: randomizeAffineCoef(0, 'b', strength, false),
              c: randomizeAffineCoef(0, 'c', strength, false),
              d: randomizeAffineCoef(0, 'd', strength, false),
              e: randomizeAffineCoef(1, 'e', strength, false),
              f: randomizeAffineCoef(0, 'f', strength, false),
            },
      postAffine:
        dims === 3
          ? {
              a: randomizeAffineCoef(1, 'a', strength, true),
              b: randomizeAffineCoef(0, 'b', strength, true),
              c: randomizeAffineCoef(0, 'c', strength, true),
              d: randomizeAffineCoef(0, 'd', strength, true),
              e: randomizeAffineCoef(0, 'e', strength, true),
              f: randomizeAffineCoef(1, 'f', strength, true),
              g: randomizeAffineCoef(0, 'g', strength, true),
              h: randomizeAffineCoef(0, 'h', strength, true),
              i: randomizeAffineCoef(0, 'i', strength, true),
              j: randomizeAffineCoef(0, 'j', strength, true),
              k: randomizeAffineCoef(1, 'k', strength, true),
              l: randomizeAffineCoef(0, 'l', strength, true),
            }
          : {
              a: randomizeAffineCoef(1, 'a', strength, false),
              b: randomizeAffineCoef(0, 'b', strength, false),
              c: randomizeAffineCoef(0, 'c', strength, false),
              d: randomizeAffineCoef(0, 'd', strength, false),
              e: randomizeAffineCoef(1, 'e', strength, false),
              f: randomizeAffineCoef(0, 'f', strength, false),
            },
      color: { x: randomRange(-0.4, 0.4), y: randomRange(-0.4, 0.4) },
      variations,
      visible: true,
    }
  }

  for (const [, t] of transformEntries) {
    // 1. Mutate Affine
    if (options.mutateAffine) {
      const mutateOne = (affine: Record<string, number>) => {
        if (options.affineMode === 'smart') {
          if (dims === 3) {
            smartMutateAffine3D(affine, affineStrength)
          } else {
            smartMutateAffine2D(affine, affineStrength)
          }
        } else {
          for (const key of Object.keys(affine)) {
            affine[key] = randomizeAffineCoef(
              affine[key] ?? 0,
              key,
              affineStrength,
              dims === 3,
            )
          }
        }
      }
      if (t.preAffine) mutateOne(t.preAffine)
      if (t.postAffine) mutateOne(t.postAffine)
    }

    // 2. Mutate Colors
    if (options.mutateColors && t.color) {
      t.color = {
        x: randomPerturbation(
          t.color.x,
          0.15 * strength * colorRate * 2,
          [-0.4, 0.4],
        ),
        y: randomPerturbation(
          t.color.y,
          0.15 * strength * colorRate * 2,
          [-0.4, 0.4],
        ),
      }
    }

    // 3. Mutate Variations
    if (options.mutateVariations === 'modify') {
      if (t.variations) {
        const vars = t.variations as Record<string, RandomVariation>
        for (const vid of Object.keys(vars)) {
          perturbVariationInPlace(vars[vid]!, strength, weightRate)
          // Apply variationSwapChance in 'modify' mode too.
          maybeSwapVariationType(vars[vid]!)
        }
      }
    } else if (options.mutateVariations === 'all') {
      // Record-level loose view (the VariationId→string key change makes this
      // cast load-bearing, unlike a per-element widening that lint would strip).
      const vars = (t.variations ?? {}) as Record<string, RandomVariation>
      const currentVars = Object.entries(vars).map(([vid, v]) => ({ vid, v }))

      for (const item of currentVars) {
        perturbVariationInPlace(item.v, strength, weightRate)
        // Apply variation swap chance in 'all' mode.
        maybeSwapVariationType(item.v)
      }

      let targetVarCount = Math.floor(
        randomRange(minVariations, maxVariations + 1),
      )
      targetVarCount = Math.min(targetVarCount, pool.length)

      const variations: Record<string, RandomVariation> = {}

      if (currentVars.length > targetVarCount) {
        const sorted = [...currentVars].sort((a, b) => b.v.weight - a.v.weight)
        for (let i = 0; i < targetVarCount; i++) {
          const item = sorted[i]!
          variations[item.vid] = item.v
        }
      } else {
        for (const item of currentVars) {
          variations[item.vid] = item.v
        }

        const usedTypes = new Set(currentVars.map((item) => item.v.type))
        let attempts = 0
        while (
          Object.keys(variations).length < targetVarCount &&
          attempts < 20
        ) {
          attempts++
          const available = pool.filter((vt) => !usedTypes.has(vt))
          if (available.length === 0) break
          const vtype = pickRandomVariationType(available)
          usedTypes.add(vtype)

          const vid = generateVariationId()
          variations[vid] = buildRandomVariation(
            vtype,
            strength,
          ) as RandomVariation
        }
      }

      normalizeVariationWeights(variations)
      // The 'all' path rebuilds the variation set dynamically (pick types,
      // perturb params); the entries are valid descriptors at runtime but TS
      // can't track the discriminated union through that construction.
      t.variations = variations as typeof t.variations
    }

    if (options.mutateVariations !== 'none' && t.variations) {
      normalizeVariationWeights(t.variations)
    }
  }

  // --- Structural mutation: insert newly created transforms ---
  for (let i = 0; i < addedCount; i++) {
    const nt = createRandomTransform()
    const newTid = generateTransformId()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mutated.transforms as Record<string, any>)[newTid] = nt
  }

  // Normalize transform probabilities after structural changes.
  const finalEntries = recordEntries(mutated.transforms)
  if (finalEntries.length > 0) {
    const p = 1 / finalEntries.length
    for (const [, ft] of finalEntries) {
      ft.probability = p
    }
  }

  return mutated
}

/**
 * Deterministic mutation: {@link mutateFlame} under a seeded source, with the
 * ids it mints made reproducible. Mutation preserves every surviving id and
 * generates fresh UUIDs only for ADDED transforms (`addTransformChance`) and
 * ADDED variations (the 'all' mode top-up) — exactly those are renamed from
 * the seed, so one (input, config, options, seed) tuple yields one descriptor:
 * the session recorder's replay contract. Surviving ids must never be touched
 * here; timeline tracks and selections reference them.
 */
export function mutateFlameSeeded(
  flame: FlameDescriptor,
  config: GenerateRandomFlameConfig,
  options: MutateFlameOptions,
  seed: number,
): FlameDescriptor {
  const mutated = withRandomSource(createSeededRandomSource(seed), () =>
    mutateFlame(flame, config, options),
  )
  const seedTag = seed >>> 0
  const inputVariationIds = new Map(
    Object.entries(flame.transforms).map(([tid, transform]) => [
      tid,
      new Set(Object.keys(transform.variations)),
    ]),
  )

  /**
   * A stable name for a minted id, skipped past anything already in use.
   *
   * The skip matters because these names are derived from the seed alone, and
   * a script may reuse one seed across several mutates: the second run would
   * otherwise mint the exact name a survivor of the first run already holds,
   * and `Object.fromEntries` would silently drop the survivor. `taken` is
   * seeded with every id in the mutated flame, so a minted name can collide
   * neither with a survivor nor with an earlier mint in this same pass.
   */
  const nextFreeId = (
    prefix: string,
    counter: { n: number },
    taken: Set<string>,
  ): string => {
    let candidate = `${prefix}${counter.n++}`
    while (taken.has(candidate)) {
      candidate = `${prefix}${counter.n++}`
    }
    taken.add(candidate)
    return candidate
  }

  const takenTransformIds = new Set(Object.keys(mutated.transforms))
  const transformCounter = { n: 0 }
  const transforms = Object.fromEntries(
    Object.entries(mutated.transforms).map(
      ([tid, transform], transformIndex) => {
        const knownVids = inputVariationIds.get(tid)
        const takenVariationIds = new Set(Object.keys(transform.variations))
        const variationCounter = { n: 0 }
        const variations = Object.fromEntries(
          Object.entries(transform.variations).map(([vid, variation]) => [
            knownVids?.has(vid) === true
              ? vid
              : nextFreeId(
                  `mut_${seedTag}_${transformIndex}_`,
                  variationCounter,
                  takenVariationIds,
                ),
            variation,
          ]),
        )
        return [
          knownVids === undefined
            ? nextFreeId(
                `_mut_${seedTag}_`,
                transformCounter,
                takenTransformIds,
              )
            : tid,
          { ...transform, variations },
        ]
      },
    ),
  )
  return { ...mutated, transforms }
}
