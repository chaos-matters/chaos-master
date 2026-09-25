import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

// Module scope, not per call: the duel HUD scores both flames continuously,
// and these were being rebuilt every time.
//
// Both sets are keyed by registered variation TYPE and read with
// `variation.type`. A variation's key in `transform.variations` is its id (a
// generated UUID in the editor), which never matches a type name.
//
// Linear variations excluded from chaos accumulator: the 2D registry's two and
// the 3D registry's one, as in flame/stats.ts.
const LINEAR = new Set(['linearVar', 'linearTVar', 'linear3D'])

// Symmetry indicators
const SYMMETRY = new Set([
  // radial / kaleidoscopic
  'juliaVar',
  'juliaNVar',
  'juliaScopeVar',
  'kaleidoscopeVar',
  'ngonVar',
  'archVar',
  'cylinderVar',
  'cylinder2Var',
  'cylinderApoVar',
  'polarVar',
  'polar2Var',
  'nPolarVar',
  // explicit symmetry-group variations
  'symBandG1Var',
  'symBandG2Var',
  'symBandG3Var',
  'symBandG4Var',
  'symBandG5Var',
  'symBandG6Var',
  'symBandG7Var',
  'symNetG1Var',
  'symNetG2Var',
  'symNetG3Var',
  'symNetG4Var',
  'symNetG5Var',
  'symNetG6Var',
  'symNetG7Var',
  'symNetG8Var',
  'symNetG9Var',
  'symNetG10Var',
  'symNetG11Var',
  'symNetG12Var',
  'symNetG13Var',
  'symNetG14Var',
  'symNetG15Var',
  'symNetG16Var',
  'symNetG17Var',
  // post-transform symmetry
  'postMirrorWfVar',
  'postAxisSymmetryWfVar',
  'postPointSymmetryWfVar',
  'postRotateVar',
  'preRotateVar',
  /*
   * The 3D registry, which had no entry here at all — so every 3D flame
   * scored 0.0 symmetry by construction and lost a quarter of the duel
   * score's range.
   *
   * The rule is the same one the 2D list follows: the direct counterparts of
   * names already above (julia, polar, the cylinder family), plus the radial
   * maps about a point that only exist in three dimensions and are the
   * strongest symmetry there is here. Deliberately not `spiral3D`, `swirl3D`
   * or `curl3D` — rotational is not symmetric — nor `disc3D`/`fan3D`, whose
   * 2D counterparts are not in the list either.
   */
  'julia3D',
  'polar3D',
  'cylinder3D',
  'cylindrical3D',
  'spherical3D',
  'sphere3D',
  'hemisphere3D',
])

export interface VariationMetrics {
  variationCount: number
  nonLinearWeightSum: number
  symmetryHits: number
  colorSpeedSum: number
}

export function calculateVariationMetrics(
  transforms: TransformFunction[],
): VariationMetrics {
  let variationCount = 0
  let nonLinearWeightSum = 0
  let symmetryHits = 0
  let colorSpeedSum = 0

  for (const t of transforms) {
    if (!t.visible) continue
    colorSpeedSum += Math.abs(t.colorSpeed ?? 0.4)
    const vars = Object.values(t.variations || {})
    variationCount += vars.length

    for (const { type, weight: signedWeight } of vars) {
      const weight = Math.abs(signedWeight)
      if (!LINEAR.has(type)) {
        nonLinearWeightSum += weight
      }
      if (SYMMETRY.has(type)) {
        symmetryHits += weight
      }
    }
  }

  return { variationCount, nonLinearWeightSum, symmetryHits, colorSpeedSum }
}

export function calculateStructuralSymmetry(
  transforms?: Record<string, TransformFunction>,
): number {
  const symTransforms = Object.entries(transforms ?? {}).filter(
    ([k, t]) => k.startsWith('_sym__') && (t.visible ?? true),
  ).length

  return symTransforms > 0 ? Math.min(10, 2.5 + (symTransforms - 1) * 1.25) : 0
}

/**
 * Energy on 0..10, like the other three measurements. Exposure goes down to
 * -8, so the sum alone reaches -16, and below 0 it put the Duel verdict's
 * curve 10 E / (E + 4) on its pole at E = -4: exposure -3.5 at the default
 * vibrancy and colour speed scored -Infinity, -3.55 scored 10,474, and dark
 * flames, most of them 3D, scored below 0 (arcade audit, finding 3). A flame
 * darker than that has no energy, and every reader (the verdict, the HUD,
 * the Arena card's bar, the Clash stances, the taste profile) sees the same
 * floor.
 */
export function calculateEnergyIntensity(
  rs: FlameDescriptor['renderSettings'],
  transformCount: number,
  colorSpeedSum: number,
): number {
  const exposure = rs?.exposure ?? 0.25
  const vibrancy = rs?.vibrancy ?? 0.5
  const avgColorSpeed = transformCount > 0 ? colorSpeedSum / transformCount : 0
  const sum = exposure * 2 + vibrancy * 2 + avgColorSpeed * 5
  return Math.max(0, Math.min(10, sum))
}

export function classifyFlameType(
  complexity: number,
  chaosLevel: number,
  symmetryScore: number,
  energyIntensity: number,
): string {
  if (chaosLevel > 7 && symmetryScore < 3) return 'Chaotic Vortex'
  if (symmetryScore > 6 && chaosLevel < 5) return 'Structured Mandala'
  if (energyIntensity > 8) return 'Energy Burst'
  if (complexity > 8) return 'Neural Web'
  return 'Hybrid'
}

export function calculateFlameStats(flame: FlameDescriptor) {
  const transforms = Object.values(flame.transforms ?? {})
  const transformCount = transforms.length

  const { variationCount, nonLinearWeightSum, symmetryHits, colorSpeedSum } =
    calculateVariationMetrics(transforms)

  // 1. Complexity
  const complexity = Math.min(10, transformCount * 0.5 + variationCount * 0.2)

  // 2. Chaos Level (How non-linear is it?)
  const chaosLevel = Math.min(10, nonLinearWeightSum * 1.5)

  // 3. Symmetry Score
  const structuralSymScore = calculateStructuralSymmetry(flame.transforms)
  const symmetryScore = Math.min(
    10,
    Math.max(symmetryHits * 2.5, structuralSymScore),
  )

  // 4. Energy Intensity
  const energyIntensity = calculateEnergyIntensity(
    flame.renderSettings,
    transformCount,
    colorSpeedSum,
  )

  // Overall Power Level (Weighted sum of the stats)
  const overallPower = Math.round(
    complexity * 100 +
      chaosLevel * 150 +
      symmetryScore * 80 +
      energyIntensity * 120,
  )

  // Classify Type
  const type = classifyFlameType(
    complexity,
    chaosLevel,
    symmetryScore,
    energyIntensity,
  )

  return {
    powerLevel: overallPower,
    type,
    metrics: {
      complexity: Number(complexity.toFixed(1)),
      chaosLevel: Number(chaosLevel.toFixed(1)),
      symmetryScore: Number(symmetryScore.toFixed(1)),
      energyIntensity: Number(energyIntensity.toFixed(1)),
    },
    rawStats: {
      transformCount,
      variationCount,
    },
  }
}

export const scoreFlame: WebMcpTool = {
  name: 'score_flame',
  description:
    'Evaluates a flame mathematically to generate RPG/Arena-style stats (Power Level, Complexity, Chaos, Symmetry, Energy). If no flame is provided, evaluates the current workspace flame.',
  inputSchema: {
    type: 'object',
    properties: {
      flame: {
        type: 'object',
        description:
          'Optional. The flame descriptor to score. Omit to score the current workspace flame.',
      },
    },
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown) => {
    const rawInput = input as { flame?: unknown } | undefined
    let flame = rawInput?.flame as FlameDescriptor | undefined

    if (!flame) {
      const ctx = getWebMcpContext()
      if (!ctx) {
        return {
          error:
            'No active workspace context available, and no flame provided in input.',
        }
      }
      flame = ctx.flameDescriptor()
      if (!flame) {
        return {
          error: 'No active flame descriptor found in workspace context.',
        }
      }
    }

    try {
      const stats = calculateFlameStats(flame)
      return {
        success: true,
        stats,
      }
    } catch (err) {
      return {
        error: `Failed to score flame: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
