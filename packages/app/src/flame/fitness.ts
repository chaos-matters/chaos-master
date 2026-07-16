import { recordEntries } from '@/utils/record'
import type { FlameDescriptor } from './schema/flameSchema'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FitnessScores {
  /** 0–1 composite fitness (higher = better) */
  composite: number
  /** 0–1 variation type diversity (Shannon entropy) */
  variationDiversity: number
  /** 0–1 transform weight balance (1 – CV) */
  transformBalance: number
  /** 0–1 color spread across transforms */
  colorSpread: number
  /** 0–1 structural complexity */
  structuralComplexity: number
}

// ── Weights ──────────────────────────────────────────────────────────────────

export const FITNESS_WEIGHTS = {
  variationDiversity: 0.25,
  transformBalance: 0.2,
  colorSpread: 0.25,
  structuralComplexity: 0.3,
} as const

// ── OkLab helpers ────────────────────────────────────────────────────────────

/** sRGB → linear → OkLab (simplified — accurate enough for relative distances) */
function srgbToOklab(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  // sRGB gamma expansion: gamma-encoded → linear
  const linearize = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  const rl = linearize(r)
  const gl = linearize(g)
  const bl = linearize(b)

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

/** OkLab color distance between two sRGB colors */
function oklabDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const oa = srgbToOklab(a[0], a[1], a[2])
  const ob = srgbToOklab(b[0], b[1], b[2])
  return Math.sqrt(
    (oa[0] - ob[0]) ** 2 + (oa[1] - ob[1]) ** 2 + (oa[2] - ob[2]) ** 2,
  )
}

/** Convert flame color {x, y} (0–1) to sRGB triplet via hue wheel */
function flameColorToSrgb(x: number, y: number): [number, number, number] {
  // Determine hue from the x coordinate (maps to 0–360 hue)
  const hue = ((x % 1) + 1) % 1
  const saturation = Math.max(0, Math.min(1, y * 2)) // y 0–1 → saturation 0–2 clamped to 1
  // Simple HSL→RGB conversion at lightness 0.5
  const c = (1 - Math.abs(0.5 * 2 - 1)) * saturation
  const xVal = c * (1 - Math.abs(((hue * 6) % 2) - 1))
  const m = 0.5 - c / 2
  let rp: number, gp: number, bp: number
  const segment = Math.floor(hue * 6) % 6
  switch (segment) {
    case 0:
      rp = c
      gp = xVal
      bp = 0
      break
    case 1:
      rp = xVal
      gp = c
      bp = 0
      break
    case 2:
      rp = 0
      gp = c
      bp = xVal
      break
    case 3:
      rp = 0
      gp = xVal
      bp = c
      break
    case 4:
      rp = xVal
      gp = 0
      bp = c
      break
    default:
      rp = c
      gp = 0
      bp = xVal
      break
  }
  return [rp + m, gp + m, bp + m]
}

// ── Heuristic 1: Variation Type Diversity ────────────────────────────────────

function scoreVariationDiversity(flame: FlameDescriptor): number {
  const transforms = recordEntries(flame.transforms)
  if (transforms.length === 0) return 0

  // Count each variation type across all transforms
  const typeCounts = new Map<string, number>()
  let totalVariations = 0

  for (const [, t] of transforms) {
    const vars = recordEntries(t.variations)
    for (const [, v] of vars) {
      const count = typeCounts.get(v.type) ?? 0
      typeCounts.set(v.type, count + 1)
      totalVariations++
    }
  }

  if (totalVariations === 0) return 0

  // Shannon entropy
  let entropy = 0
  for (const count of typeCounts.values()) {
    const p = count / totalVariations
    entropy -= p * Math.log(p)
  }

  // Normalize: max entropy is log(uniqueTypes), but also consider the total
  // number of possible types. Use log(uniqueTypes + 1) as ceiling, but also
  // reward having more unique types up to a reasonable cap.
  const uniqueTypes = typeCounts.size
  const maxEntropy = Math.log(Math.max(uniqueTypes, 1) + 1)
  if (maxEntropy === 0) return 0

  // Blend entropy with a bonus for having variety count > 1
  const varietyBonus = Math.min(uniqueTypes / 6, 1)
  return Math.min((entropy / maxEntropy) * 0.7 + varietyBonus * 0.3, 1)
}

// ── Heuristic 2: Transform Weight Balance ────────────────────────────────────

function scoreTransformBalance(flame: FlameDescriptor): number {
  const transforms = recordEntries(flame.transforms)
  if (transforms.length <= 1) return 0.5 // single transform is neutral

  const probabilities = transforms.map(([, t]) => t.probability)
  const n = probabilities.length
  const mean = probabilities.reduce((s, p) => s + p, 0) / n

  if (mean === 0) return 0

  // Coefficient of variation
  const variance = probabilities.reduce((s, p) => s + (p - mean) ** 2, 0) / n
  const cv = Math.sqrt(variance) / mean

  // Score: 1 – CV, clamped. CV near 0 (perfectly balanced) → score near 1.
  // CV > 1 (very unbalanced) → score near 0.
  return Math.max(0, Math.min(1 - cv, 1))
}

// ── Heuristic 3: Color Spread ────────────────────────────────────────────────

function scoreColorSpread(flame: FlameDescriptor): number {
  const transforms = recordEntries(flame.transforms)
  if (transforms.length <= 1) return 0

  const colors = transforms.map(([, t]) =>
    flameColorToSrgb(t.color.x, t.color.y),
  )

  // Average pairwise OkLab distance
  let totalDistance = 0
  let pairs = 0
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      totalDistance += oklabDistance(colors[i]!, colors[j]!)
      pairs++
    }
  }

  if (pairs === 0) return 0

  const avgDistance = totalDistance / pairs
  // Max reasonable OkLab distance is ~0.5 (between distant hues at high sat)
  // But map generously so good spreads get high scores
  return Math.min(avgDistance / 0.3, 1)
}

// ── Heuristic 4: Structural Complexity ───────────────────────────────────────

function scoreStructuralComplexity(flame: FlameDescriptor): number {
  const transforms = recordEntries(flame.transforms)
  const transformCount = transforms.length

  // Transform count component: bell curve peaking at 4–5, tapering gently
  // Score is 0 for 1 or >12 transforms, peaks at 4–5
  let countScore: number
  if (transformCount <= 1) {
    countScore = 0
  } else if (transformCount <= 4) {
    countScore = (transformCount - 1) / 3 // ramp 0→1 from 1→4
  } else if (transformCount <= 6) {
    countScore = 1 // peak
  } else if (transformCount <= 12) {
    countScore = 1 - (transformCount - 6) / 6 // ramp 1→0 from 6→12
  } else {
    countScore = 0
  }

  // Variations per transform component
  let totalVars = 0
  let parametricCount = 0
  for (const [, t] of transforms) {
    const vars = recordEntries(t.variations)
    totalVars += vars.length
    parametricCount += vars.filter(
      ([, v]) => 'params' in v && v.params && Object.keys(v.params).length > 0,
    ).length
  }

  const avgVarsPerTransform = totalVars / Math.max(transformCount, 1)
  // Score: 0 vars = 0, 1 var = 0.3, 2 vars = 0.6, 3+ vars = 0.9+
  const varsScore = Math.min(avgVarsPerTransform / 3.5, 1)

  // Parametric bonus: having parametric variations adds complexity
  const parametricScore =
    Math.min(parametricCount / Math.max(transformCount * 2, 1), 1) * 0.2

  return Math.min(countScore * 0.5 + varsScore * 0.3 + parametricScore, 1)
}

// ── Composite ────────────────────────────────────────────────────────────────

/**
 * Score a flame descriptor for fitness in genetic algorithms.
 * All scores are 0–1. Higher = "better" by aesthetic heuristics.
 */
export function scoreFlame(flame: FlameDescriptor): FitnessScores {
  const variationDiversity = scoreVariationDiversity(flame)
  const transformBalance = scoreTransformBalance(flame)
  const colorSpread = scoreColorSpread(flame)
  const structuralComplexity = scoreStructuralComplexity(flame)

  const composite =
    FITNESS_WEIGHTS.variationDiversity * variationDiversity +
    FITNESS_WEIGHTS.transformBalance * transformBalance +
    FITNESS_WEIGHTS.colorSpread * colorSpread +
    FITNESS_WEIGHTS.structuralComplexity * structuralComplexity

  return {
    composite,
    variationDiversity,
    transformBalance,
    colorSpread,
    structuralComplexity,
  }
}
