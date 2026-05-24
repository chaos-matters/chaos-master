import { generateTransformId, generateVariationId } from './transformFunction'
import { isParametricVariationType, transformVariations, variationTypes, } from './variations'
import { getVariationDefault } from './variations/utils'
import type { FlameDescriptor } from './schema/flameSchema'
import type { TransformVariationType } from './variations'

export function random01(): number {
  return Math.random()
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function randomPerturbation(
  current: number,
  sigma: number,
  clampRange?: [number, number],
): number {
  let sum = 0
  for (let i = 0; i < 6; i++) sum += Math.random()
  const gaussian = (sum - 3) * sigma
  const result = current + gaussian
  if (clampRange)
    return Math.max(clampRange[0], Math.min(clampRange[1], result))
  return result
}

/**
 * Randomize variation params with optional strength control.
 * strength=0 → mild perturbation, strength=1 → wild randomization.
 */
export function randomizeVariationParams(
  variationType: TransformVariationType,
  strength = 0.5,
): Record<string, number> | undefined {
  if (!isParametricVariationType(variationType)) return undefined
  const def = transformVariations[variationType]
  const defaults = def.paramDefaults as Record<string, number>
  const result: Record<string, number> = {}
  // strength maps sigma from 5% to 100% of param magnitude
  const sigmaScale = 0.05 + strength * 0.95
  for (const key of Object.keys(defaults)) {
    const d = defaults[key]!
    result[key] = randomPerturbation(d, Math.abs(d) * 0.5 * sigmaScale)
  }
  return result
}

export function randomizeVariationType(
  currentType: TransformVariationType,
): TransformVariationType {
  const others = variationTypes.filter((t) => t !== currentType)
  return others[Math.floor(Math.random() * others.length)]!
}

/**
 * Pick a random variation type from a pool.
 */
export function pickRandomVariationType(
  pool: TransformVariationType[],
): TransformVariationType {
  return pool[Math.floor(Math.random() * pool.length)]!
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
  const anchor0Idx = Math.floor(Math.random() * keys.length)
  let anchor1Idx: number
  do {
    anchor1Idx = Math.floor(Math.random() * keys.length)
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
        x: randomRange(0.2, 0.35) * (Math.random() > 0.5 ? 1 : -1),
        y: randomRange(0.2, 0.35) * (Math.random() > 0.5 ? 1 : -1),
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
): number {
  const range: [number, number] =
    coefKey === 'e' || coefKey === 'f' ? [-3, 3] : [-2, 2]
  // sigma goes from 0.03 (strength=0) to 0.9 (strength=1)
  const sigma = 0.03 + strength * 0.87
  return randomPerturbation(current, sigma, range)
}

export interface GenerateRandomFlameConfig {
  strength: number
  minTransforms: number
  maxTransforms: number
  minVariations: number
  maxVariations: number
  allowedVariations: TransformVariationType[]
}

/**
 * Generate a completely random flame descriptor based on configuration.
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

  const pool =
    allowedVariations.length > 0 ? allowedVariations : [...variationTypes]

  const transformCount = Math.floor(
    randomRange(minTransforms, maxTransforms + 1),
  )

  const transforms: Record<string, unknown> = {}

  for (let t = 0; t < transformCount; t++) {
    const tid = generateTransformId(`logo_${t}`)

    const varCount = Math.floor(randomRange(minVariations, maxVariations + 1))
    const usedTypes = new Set<TransformVariationType>()
    const variations: Record<string, unknown> = {}

    for (let v = 0; v < varCount; v++) {
      const available = pool.filter((vt) => !usedTypes.has(vt))
      if (available.length === 0) break
      const vtype = pickRandomVariationType(available)
      usedTypes.add(vtype)

      const vid = generateVariationId()
      const weight = randomRange(0.3, 1)
      const base = getVariationDefault(vtype, weight) as Record<string, unknown>
      // Randomize params for parametric variations
      if (isParametricVariationType(vtype)) {
        const randomizedParams = randomizeVariationParams(vtype, strength)
        if (randomizedParams) {
          variations[vid] = { ...base, params: randomizedParams }
          continue
        }
      }
      variations[vid] = base
    }

    // Normalize variation weights to sum to 1
    const varEntries = Object.entries(variations)
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

    transforms[tid] = {
      probability: 1 / transformCount,
      preAffine: {
        a: randomizeAffineCoef(1, 'a', strength),
        b: randomizeAffineCoef(0, 'b', strength),
        c: randomizeAffineCoef(0, 'c', strength),
        d: randomizeAffineCoef(0, 'd', strength),
        e: randomizeAffineCoef(1, 'e', strength),
        f: randomizeAffineCoef(0, 'f', strength),
      },
      postAffine: {
        a: randomizeAffineCoef(1, 'a', strength),
        b: randomizeAffineCoef(0, 'b', strength),
        c: randomizeAffineCoef(0, 'c', strength),
        d: randomizeAffineCoef(0, 'd', strength),
        e: randomizeAffineCoef(1, 'e', strength),
        f: randomizeAffineCoef(0, 'f', strength),
      },
      color: { x: randomRange(-0.4, 0.4), y: randomRange(-0.4, 0.4) },
      variations,
      visible: true,
    }
  }

  const coloredTransforms = randomizeAllColors(transforms, strength)

  return {
    version: '1.0',
    metadata: { author: 'logo-generator' },
    renderSettings: {
      exposure: 0.3,
      skipIters: 1,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      camera: { zoom: 1, position: [0, 0] },
      colorInitMode: 'colorInitPosition',
      pointInitMode: 'pointInitUnitDisk',
      vibrancy: 0.5,
      contrast: 1,
      gamma: 2.2,
      highlightPower: 0.5,
      palettePhase: 0,
      paletteSpeed: 0.5,
      densityEstimationQuality: 0.8,
      paletteMode: 0,
    },
    transforms: coloredTransforms as FlameDescriptor['transforms'],
  }
}
