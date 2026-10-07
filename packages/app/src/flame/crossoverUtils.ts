import { deepClone } from '@/utils/clone'
import { random01, randomPerturbation, randomRange } from './randomize'
import { generateVariationId } from './transformFunction'

export type LooseVariation = {
  type: string
  weight: number
  params?: Record<string, number>
}

export type LooseTransform = {
  /** The parent it came from, which decides the child's symmetry set
   *  (breedSymmetry.ts). A cross-bred pair of both parents has none. */
  parent?: 'a' | 'b'
  probability: number
  colorSpeed?: number
  visible?: boolean
  preAffine: Record<string, number>
  postAffine: Record<string, number>
  color: { x: number; y: number }
  variations: Record<string, LooseVariation>
}

/**
 * Cross-breed variation parameters between two variations of the same type.
 * Each param is randomly inherited from either parent A or parent B.
 */
export function crossVariationParams(
  vA: LooseVariation,
  vB: LooseVariation,
): Record<string, number> | undefined {
  if (!vA.params && !vB.params) return undefined
  const keys = new Set([
    ...Object.keys(vA.params ?? {}),
    ...Object.keys(vB.params ?? {}),
  ])
  if (keys.size === 0) return undefined

  const result: Record<string, number> = {}
  for (const key of keys) {
    if (random01() < 0.5) {
      result[key] = vA.params?.[key] ?? vB.params?.[key] ?? 0
    } else {
      result[key] = vB.params?.[key] ?? vA.params?.[key] ?? 0
    }
  }
  return result
}

/** Determine dominant variation type for a transform based on highest weight. */
export function getDominantVariationType(t: {
  variations?: Record<string, LooseVariation>
}): string | null {
  let best: string | null = null
  let bestWeight = -1
  for (const [, v] of Object.entries(t.variations ?? {})) {
    const weight = v.weight ?? 0
    if (weight > bestWeight) {
      bestWeight = weight
      best = v.type
    }
  }
  return best
}

/** Group transforms by dominant variation type and collect unmatched items. */
export function groupTransformsByDominantType(transforms: LooseTransform[]): {
  byType: Map<string, LooseTransform[]>
  unmatched: LooseTransform[]
} {
  const byType = new Map<string, LooseTransform[]>()
  const unmatched: LooseTransform[] = []

  for (const t of transforms) {
    const dt = getDominantVariationType(t)
    if (dt) {
      const arr = byType.get(dt) ?? []
      arr.push(t)
      byType.set(dt, arr)
    } else {
      unmatched.push(t)
    }
  }

  return { byType, unmatched }
}

/** Randomly inherit affine coefficients from either target or source. */
export function crossBreedAffineCoefficients(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const key of Object.keys(target)) {
    if (random01() < 0.5) {
      const other = source[key]
      if (other !== undefined) target[key] = other
    }
  }
}

/** Match variation types between two transforms, blend weights, and cross params. */
export function crossBreedMatchedVariations(
  varsA: Record<string, LooseVariation>,
  varsB: Record<string, LooseVariation>,
): Record<string, LooseVariation> {
  const newVars: Record<string, LooseVariation> = {}
  const entriesB = Object.entries(varsB)
  const usedBTypes = new Set<string>()

  for (const [, va] of Object.entries(varsA)) {
    const matchIdx = entriesB.findIndex(
      ([, vb]) => vb.type === va.type && !usedBTypes.has(vb.type),
    )
    if (matchIdx >= 0) {
      const [, vb] = entriesB[matchIdx]!
      usedBTypes.add(vb.type)
      const weight = (va.weight ?? 0) * 0.5 + (vb.weight ?? 0) * 0.5
      const params = crossVariationParams(va, vb)
      newVars[generateVariationId()] = {
        type: va.type,
        weight,
        ...(params ? { params } : {}),
      }
    } else {
      newVars[generateVariationId()] = { ...va }
    }
  }

  for (const [, vb] of entriesB) {
    if (!usedBTypes.has(vb.type)) {
      newVars[generateVariationId()] = { ...vb }
    }
  }

  return newVars
}

/** Cross-breed a single transform pair blending affine, color, probability, and variations. */
export function crossBreedTransformPair(
  taOriginal: LooseTransform,
  tb: LooseTransform,
): LooseTransform {
  const ta = deepClone(taOriginal)

  crossBreedAffineCoefficients(ta.preAffine, tb.preAffine)
  crossBreedAffineCoefficients(ta.postAffine, tb.postAffine)

  ta.color = {
    x: randomPerturbation(
      ta.color.x * 0.5 + tb.color.x * 0.5,
      0.05,
      [-0.4, 0.4],
    ),
    y: randomPerturbation(
      ta.color.y * 0.5 + tb.color.y * 0.5,
      0.05,
      [-0.4, 0.4],
    ),
  }

  ta.probability = ta.probability * 0.5 + tb.probability * 0.5
  ta.variations = crossBreedMatchedVariations(ta.variations, tb.variations)
  // A blend of both parents counts toward neither one's symmetry set.
  if (ta.parent !== tb.parent) delete ta.parent

  return ta
}

/** Sort transforms by probability descending and pair them up for cross-breeding. */
export function crossBreedMatchedTypePairs(
  listA: LooseTransform[],
  listB: LooseTransform[],
): {
  crossBred: LooseTransform[]
  excessA: LooseTransform[]
  excessB: LooseTransform[]
} {
  const sortedA = [...listA].sort((a, b) => b.probability - a.probability)
  const sortedB = [...listB].sort((a, b) => b.probability - a.probability)
  const pairs = Math.min(sortedA.length, sortedB.length)
  const crossBred: LooseTransform[] = []

  for (let i = 0; i < pairs; i++) {
    crossBred.push(crossBreedTransformPair(sortedA[i]!, sortedB[i]!))
  }

  return {
    crossBred,
    excessA: sortedA.slice(pairs),
    excessB: sortedB.slice(pairs),
  }
}

/** Backfill remaining transform slots from shuffled unmatched pool. */
export function fillRemainingFromUnmatched(
  result: LooseTransform[],
  unmatched: LooseTransform[],
  count: number,
): LooseTransform[] {
  const remaining = [...unmatched]
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(randomRange(0, i + 1))
    ;[remaining[i], remaining[j]] = [remaining[j]!, remaining[i]!]
  }

  for (const t of remaining) {
    if (result.length >= count) break
    const cloned = deepClone(t)
    const newVars: Record<string, LooseVariation> = {}
    for (const [, v] of Object.entries(cloned.variations)) {
      newVars[generateVariationId()] = v
    }
    cloned.variations = newVars
    result.push(cloned)
  }

  return result.slice(0, count)
}
