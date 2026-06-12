import { deepClone } from '@/utils/clone'
import { recordEntries } from '@/utils/record'
import { generateTransformId, generateVariationId } from './transformFunction'
import { isParametricVariationType, transformVariations, variationTypes, } from './variations'
import { getVariationDefault } from './variations/utils'
import { isParametricVariationType3D, isVariationType3D, transformVariations3D, variationTypes3D, } from './variations3D'
import type { FlameDescriptor } from './schema/flameSchema'
import type { TransformVariationType } from './variations'
import type { TransformVariationType3D } from './variations3D'

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
  variationType: TransformVariationType | TransformVariationType3D,
  strength = 0.5,
): Record<string, number> | undefined {
  const is3D = isVariationType3D(variationType)
  const isParametric = is3D
    ? isParametricVariationType3D(variationType)
    : isParametricVariationType(variationType)
  if (!isParametric) return undefined

  const def = (
    is3D
      ? transformVariations3D[variationType]
      : transformVariations[variationType]
  ) as {
    paramDefaults: Record<string, number>
  }
  const defaults = def.paramDefaults
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
      const weight = randomRange(0.3, 1)
      const base = getVariationDefault(vtype, weight) as Record<string, unknown>
      // Randomize params for parametric variations
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

    // Normalize variation weights to sum to 1
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

    transforms[tid] = {
      probability: 1 / transformCount,
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

  const coloredTransforms = randomizeAllColors(transforms, strength)

  return {
    version: '1.0',
    metadata: { name: '', description: '', author: 'unknown' },
    renderSettings: {
      exposure: 0.3,
      skipIters: 15,
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
    transforms: coloredTransforms as FlameDescriptor['transforms'],
  }
}

export interface MutateFlameOptions {
  mutateAffine: boolean
  mutateVariations: 'modify' | 'all' | 'none'
  mutateColors: boolean
}

export function mutateFlame(
  flame: FlameDescriptor,
  config: GenerateRandomFlameConfig,
  options: MutateFlameOptions,
): FlameDescriptor {
  const { strength, minVariations, maxVariations, allowedVariations } = config
  const dims = config.dimensions ?? 2

  const mutated = deepClone(flame)
  const transforms = mutated.transforms

  const pool =
    allowedVariations.length > 0
      ? allowedVariations
      : dims === 3
        ? [...variationTypes3D]
        : [...variationTypes]

  for (const tid of Object.keys(transforms)) {
    const t = transforms[tid]!

    // 1. Mutate Affine
    if (options.mutateAffine) {
      if (t.preAffine) {
        for (const key of Object.keys(t.preAffine)) {
          const val = t.preAffine[key as keyof typeof t.preAffine] as number
          t.preAffine[key as keyof typeof t.preAffine] = randomizeAffineCoef(
            val,
            key,
            strength,
            dims === 3,
          )
        }
      }
      if (t.postAffine) {
        for (const key of Object.keys(t.postAffine)) {
          const val = t.postAffine[key as keyof typeof t.postAffine] as number
          t.postAffine[key as keyof typeof t.postAffine] = randomizeAffineCoef(
            val,
            key,
            strength,
            dims === 3,
          )
        }
      }
    }

    // 2. Mutate Colors
    if (options.mutateColors && t.color) {
      t.color = {
        x: randomPerturbation(t.color.x, 0.15 * strength, [-0.4, 0.4]),
        y: randomPerturbation(t.color.y, 0.15 * strength, [-0.4, 0.4]),
      }
    }

    // 3. Mutate Variations
    if (options.mutateVariations === 'modify') {
      if (t.variations) {
        for (const vid of Object.keys(t.variations)) {
          const v = t.variations[vid]!
          const vtype = v.type as
            | TransformVariationType
            | TransformVariationType3D
          const is3D = isVariationType3D(vtype)
          const isParametric = is3D
            ? isParametricVariationType3D(vtype)
            : isParametricVariationType(vtype)
          if (isParametric) {
            const defaults = (
              is3D ? transformVariations3D[vtype] : transformVariations[vtype]
            ) as { paramDefaults: Record<string, number> }
            const params = v.params ? { ...v.params } : {}
            const sigmaScale = 0.05 + strength * 0.95
            for (const key of Object.keys(defaults.paramDefaults)) {
              const d = params[key] ?? defaults.paramDefaults[key]!
              params[key] = randomPerturbation(
                d,
                Math.abs(d) * 0.5 * sigmaScale,
              )
            }
            v.params = params
          }
          v.weight = randomPerturbation(v.weight, 0.2 * strength, [0.05, 1.0])
        }
      }
    } else if (options.mutateVariations === 'all') {
      type VariationInstance = {
        type: string
        weight: number
        params?: Record<string, number>
      }
      const varEntries = t.variations ? Object.entries(t.variations) : []
      const currentVars = varEntries.map(([vid, v]) => ({
        vid,
        v: v as VariationInstance,
      }))

      for (const item of currentVars) {
        const v = item.v
        const vtype = v.type
        const is3D = isVariationType3D(vtype)
        const isParametric = is3D
          ? isParametricVariationType3D(vtype)
          : isParametricVariationType(vtype)
        if (isParametric) {
          const defaults = (
            is3D ? transformVariations3D[vtype] : transformVariations[vtype]
          ) as { paramDefaults: Record<string, number> }
          const params = v.params ? { ...v.params } : {}
          const sigmaScale = 0.05 + strength * 0.95
          for (const key of Object.keys(defaults.paramDefaults)) {
            const d = params[key] ?? defaults.paramDefaults[key]!
            params[key] = randomPerturbation(d, Math.abs(d) * 0.5 * sigmaScale)
          }
          v.params = params
        }
        v.weight = randomPerturbation(v.weight, 0.2 * strength, [0.05, 1.0])
      }

      let targetVarCount = Math.floor(
        randomRange(minVariations, maxVariations + 1),
      )
      targetVarCount = Math.min(targetVarCount, pool.length)

      const variations: Record<string, VariationInstance> = {}

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
          const weight = randomRange(0.3, 1)
          const base = getVariationDefault(vtype, weight) as Record<
            string,
            unknown
          >

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
      }

      const nextVarEntries = Object.entries(variations)
      const totalWeight = nextVarEntries.reduce(
        (sum, [, v]) => sum + v.weight,
        0,
      )
      if (totalWeight > 0) {
        for (const vid of Object.keys(variations)) {
          variations[vid].weight = variations[vid].weight / totalWeight
        }
      }
      t.variations = variations
    }

    if (options.mutateVariations !== 'none' && t.variations) {
      type VariationInstance = {
        type: string
        weight: number
        params?: Record<string, number>
      }
      const nextVarEntries = Object.entries(t.variations)
      const totalWeight = nextVarEntries.reduce(
        (sum, [, v]) => sum + (v as VariationInstance).weight,
        0,
      )
      if (totalWeight > 0) {
        for (const vid of Object.keys(t.variations)) {
          const v = t.variations[vid] as VariationInstance
          v.weight = v.weight / totalWeight
        }
      }
    }
  }

  return mutated
}
