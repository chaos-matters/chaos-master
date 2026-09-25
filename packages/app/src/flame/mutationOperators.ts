/**
 * The per-transform steps of `mutateFlame`: resolving the effective rates,
 * structural removal and addition, and mutating one transform's affine,
 * color and variations. Every draw comes from the ambient source in
 * randomSource.ts, directly or through randomPrimitives.ts.
 */

import { recordEntries } from '@/utils/record'
import { MUTATION_RATE_DEFAULTS } from './mutationRates'
import { buildRandomVariation, normalizeVariationWeights, perturbVariationInPlace, pickRandomVariationType, randomizeAffineCoef, randomizeVariationParams, smartMutateAffine2D, smartMutateAffine3D, } from './randomPrimitives'
import { random01, randomPerturbation, randomRange } from './randomSource'
import { generateVariationId } from './transformFunction'
import { isParametricVariationType, variationTypes } from './variations'
import { getVariationDefault } from './variations/utils'
import { isParametricVariationType3D, isVariationType3D, variationTypes3D, } from './variations3D'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from './mutationRates'
import type { RandomVariationLike } from './randomPrimitives'
import type { TransformVariationType } from './variations'
import type { TransformVariationType3D } from './variations3D'

export type VariationPool = (
  | TransformVariationType
  | TransformVariationType3D
)[]

export interface EffectiveMutationRates {
  affineRate: number
  weightRate: number
  swapChance: number
  colorRate: number
  addChance: number
  removeChance: number
  affineStrength: number
  pool: VariationPool
}

/**
 * Resolves effective mutation rates from options, falling back to defaults.
 */
export function resolveEffectiveMutationRates(
  config: GenerateRandomFlameConfig,
  options: MutateFlameOptions,
): EffectiveMutationRates {
  const { strength, allowedVariations } = config
  const dims = config.dimensions ?? 2

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

  const affineStrength = strength * affineRate
  const pool: VariationPool =
    allowedVariations.length > 0
      ? allowedVariations
      : dims === 3
        ? [...variationTypes3D]
        : [...variationTypes]

  return {
    affineRate,
    weightRate,
    swapChance,
    colorRate,
    addChance,
    removeChance,
    affineStrength,
    pool,
  }
}

/**
 * Symmetry copies carry the reserved `_sym__` id prefix. They are generated
 * from the symmetry settings, the transform list does not show them, and a
 * mutation neither removes them nor counts them.
 */
export function isSymmetryCopyId(tid: string): boolean {
  return tid.startsWith('_sym__')
}

/**
 * The transform entries a mutation keeps: each targeted transform is removed
 * at `removeChance`.
 *
 * One draw per targeted entry, symmetry copies included, so the draws that
 * follow line up the same way whether or not a removal takes effect. A draw
 * is refused, and the transform kept, when it would remove a symmetry copy
 * or leave fewer user transforms than `minTransforms` (and never fewer than
 * one, whatever the minimum says).
 */
export function applyStructuralRemoval<T>(
  allEntries: [string, T][],
  targetIds: string[] | undefined,
  removeChance: number,
  minTransforms = 1,
): [string, T][] {
  if (removeChance <= 0 || allEntries.length <= 1) return allEntries
  const floor = Math.max(1, minTransforms)
  let userCount = allEntries.filter(([tid]) => !isSymmetryCopyId(tid)).length
  return allEntries.filter(([tid]) => {
    if (targetIds && !targetIds.includes(tid)) return true
    const drawn = random01() < removeChance
    if (!drawn || isSymmetryCopyId(tid) || userCount <= floor) return true
    userCount--
    return false
  })
}

/**
 * Determine how many transforms to add (up to 3).
 */
export function countStructuralAdditions(addChance: number): number {
  let count = 0
  if (addChance > 0) {
    while (random01() < addChance && count < 3) {
      count++
    }
  }
  return count
}

/**
 * Occasionally swap a variation's type for another from the pool.
 */
export function maybeSwapVariationType(
  v: RandomVariationLike,
  swapChance: number,
  pool: VariationPool,
  strength: number,
): void {
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

/**
 * Create a new random transform for structural additions.
 */
export function createRandomMutatedTransform(
  minVariations: number,
  maxVariations: number,
  pool: VariationPool,
  dims: number,
  strength: number,
): Record<string, unknown> {
  const varCount = Math.floor(randomRange(minVariations, maxVariations + 1))
  const usedTypes = new Set<TransformVariationType | TransformVariationType3D>()
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

/**
 * Mutate transform affine matrices in-place (preAffine and postAffine).
 */
export function mutateTransformAffine(
  t: {
    preAffine?: Record<string, number>
    postAffine?: Record<string, number>
  },
  dims: number,
  affineStrength: number,
  affineMode?: 'smart' | 'full',
): void {
  const mutateOne = (affine: Record<string, number>) => {
    if (affineMode === 'smart') {
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

/**
 * Mutate transform color in-place.
 */
export function mutateTransformColor(
  t: { color?: { x: number; y: number } },
  strength: number,
  colorRate: number,
): void {
  if (!t.color) return
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

export interface VariationMutationConfig {
  strength: number
  weightRate: number
  swapChance: number
  pool: VariationPool
  minVariations: number
  maxVariations: number
}

/**
 * Mutate variations on a transform in-place according to mode ('modify', 'all', or 'none').
 */
export function mutateTransformVariations(
  t: { variations?: Record<string, unknown> },
  mode: 'modify' | 'all' | 'none' | undefined,
  config: VariationMutationConfig,
): void {
  if (!mode || mode === 'none' || !t.variations) return

  const {
    strength,
    weightRate,
    swapChance,
    pool,
    minVariations,
    maxVariations,
  } = config

  if (mode === 'modify') {
    const vars = t.variations as Record<string, RandomVariationLike>
    for (const vid of Object.keys(vars)) {
      perturbVariationInPlace(vars[vid]!, strength, weightRate)
      maybeSwapVariationType(vars[vid]!, swapChance, pool, strength)
    }
    normalizeVariationWeights(
      t.variations as Record<string, { weight: number }>,
    )
    return
  }

  // mode === 'all'
  const vars = (t.variations ?? {}) as Record<string, RandomVariationLike>
  const currentVars = Object.entries(vars).map(([vid, v]) => ({ vid, v }))

  for (const item of currentVars) {
    perturbVariationInPlace(item.v, strength, weightRate)
    maybeSwapVariationType(item.v, swapChance, pool, strength)
  }

  let targetVarCount = Math.floor(randomRange(minVariations, maxVariations + 1))
  targetVarCount = Math.min(targetVarCount, pool.length)

  const variations: Record<string, RandomVariationLike> = {}

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
    while (Object.keys(variations).length < targetVarCount && attempts < 20) {
      attempts++
      const available = pool.filter((vt) => !usedTypes.has(vt))
      if (available.length === 0) break
      const vtype = pickRandomVariationType(available)
      usedTypes.add(vtype)

      const vid = generateVariationId()
      variations[vid] = buildRandomVariation(
        vtype,
        strength,
      ) as RandomVariationLike
    }
  }

  normalizeVariationWeights(variations)
  t.variations = variations
}

/**
 * Assign equal probabilities to all final surviving transforms.
 */
export function normalizeTransformProbabilities(
  transforms: Record<string, unknown>,
): void {
  const finalEntries = recordEntries(transforms)
  if (finalEntries.length > 0) {
    const p = 1 / finalEntries.length
    for (const [, ft] of finalEntries) {
      ;(ft as { probability: number }).probability = p
    }
  }
}
