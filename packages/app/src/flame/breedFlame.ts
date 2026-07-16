import { deepClone } from '@/utils/clone'
import { recordEntries } from '@/utils/record'
import { random01, randomPerturbation, randomRange } from './randomize'
import { validateFlame } from './schema/flameSchema'
import { generateTransformId, generateVariationId } from './transformFunction'
import { transformVariations } from './variations'
import { isParametricVariationType3D, isVariationType3D, transformVariations3D, } from './variations3D'
import type { FlameDescriptor } from './schema/flameSchema'

// ── Types ──────────────────────────────────────────────────────────────────

export type CrossoverMode =
  | 'uniform'
  | 'weighted'
  | 'shuffle'
  | 'alternate'
  | 'smart'

/** Every crossover mode, in display order (single source for UI chip rows). */
export const CROSSOVER_MODES: CrossoverMode[] = [
  'uniform',
  'weighted',
  'shuffle',
  'alternate',
  'smart',
]

/** Human-readable crossover labels shared by the breeding UIs. */
export const CROSSOVER_LABELS: Record<CrossoverMode, string> = {
  uniform: 'Uniform',
  weighted: 'Weighted',
  shuffle: 'Shuffle',
  alternate: 'Alternate',
  smart: 'Smart',
}

export interface BreedConfig {
  /** How many children to generate. Default 9. */
  count: number
  /** Crossover strategy. Default 'uniform'. */
  crossoverMode: CrossoverMode
  /**
   * Post-crossover mutation strength (0–1).
   * 0 = no mutation, 1 = heavy mutation. Default 0.1.
   */
  mutationStrength: number
}

export const DEFAULT_BREED_CONFIG: BreedConfig = {
  count: 9,
  crossoverMode: 'uniform',
  mutationStrength: 0.1,
}

// ── Internal helpers ───────────────────────────────────────────────────────

type LooseTransform = {
  probability: number
  colorSpeed?: number
  visible?: boolean
  preAffine: Record<string, number>
  postAffine: Record<string, number>
  color: { x: number; y: number }
  variations: Record<string, LooseVariation>
}

type LooseVariation = {
  type: string
  weight: number
  params?: Record<string, number>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTransform = any

function transformEntries(flame: FlameDescriptor): [string, AnyTransform][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return recordEntries(flame.transforms as any) as [string, AnyTransform][]
}

function variationEntries(t: AnyTransform): [string, LooseVariation][] {
  return recordEntries(t.variations ?? {}) as [string, LooseVariation][]
}

/** Perturb object keys in-place with Gaussian noise scaled by sigma. */
function perturbParams(
  params: Record<string, number>,
  defaults: Record<string, number>,
  sigmaScale: number,
) {
  for (const key of Object.keys(params)) {
    const d = params[key] ?? defaults[key] ?? 0
    params[key] = randomPerturbation(d, Math.abs(d) * 0.5 * sigmaScale)
  }
}

/** Perturb affine coefficients in-place. */
function perturbAffine(affine: Record<string, number>, sigma: number) {
  for (const key of Object.keys(affine)) {
    affine[key] = randomPerturbation(affine[key] ?? 0, sigma)
  }
}

/**
 * Cross-breed variation parameters between two variations of the same type.
 * Each param is randomly inherited from either parent A or parent B.
 */
function crossVariationParams(
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
    // Randomly inherit from A or B (with fallback to the other)
    if (random01() < 0.5) {
      result[key] = vA.params?.[key] ?? vB.params?.[key] ?? 0
    } else {
      result[key] = vB.params?.[key] ?? vA.params?.[key] ?? 0
    }
  }
  return result
}

/**
 * Cross-breed color coordinates: random mix of the two parents' colors
 * with slight perturbation.
 */
function crossColor(
  colorA: { x: number; y: number },
  colorB: { x: number; y: number },
): { x: number; y: number } {
  const t = randomRange(0.2, 0.8) // never 0 or 1 — always mix
  return {
    x: randomPerturbation(colorA.x * t + colorB.x * (1 - t), 0.05, [-0.4, 0.4]),
    y: randomPerturbation(colorA.y * t + colorB.y * (1 - t), 0.05, [-0.4, 0.4]),
  }
}

// ── Crossover strategies ───────────────────────────────────────────────────

/**
 * Uniform crossover: for each child, randomly pick each transform from
 * either parent A or B (coin flip per transform).
 */
function uniformCrossover(
  transformsA: LooseTransform[],
  transformsB: LooseTransform[],
  count: number,
): LooseTransform[] {
  const pool = [...transformsA, ...transformsB]
  const sourceLabel = pool.map((_, i) => (i < transformsA.length ? 'a' : 'b'))

  // Shuffle and pick, preferring a balanced selection
  const indices = pool.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(randomRange(0, i + 1))
    ;[indices[i], indices[j]] = [indices[j]!, indices[i]!]
  }

  const selected: LooseTransform[] = []
  let aCount = 0
  let bCount = 0

  const take = (idx: number) => {
    const cloned = deepClone(pool[idx]!)
    // Re-ID all variations for uniqueness
    const newVars: Record<string, LooseVariation> = {}
    for (const [, v] of Object.entries(cloned.variations)) {
      newVars[generateVariationId()] = v
    }
    cloned.variations = newVars

    if (sourceLabel[idx] === 'a') aCount++
    else bCount++
    selected.push(cloned)
  }

  const skipped: number[] = []
  for (const idx of indices) {
    if (selected.length >= count) break
    const label = sourceLabel[idx]!
    // Favor balance: if one parent is underrepresented, prefer it
    if (aCount > bCount + 1 && label === 'a') {
      skipped.push(idx)
      continue
    }
    if (bCount > aCount + 1 && label === 'b') {
      skipped.push(idx)
      continue
    }
    take(idx)
  }

  // With skewed parents (e.g. 10 vs 1 transforms) the balance rule can block
  // every remaining candidate and leave the child short of `count` — fill the
  // open slots from the skipped candidates.
  for (const idx of skipped) {
    if (selected.length >= count) break
    take(idx)
  }

  return selected
}

/**
 * Weighted crossover: pool all transforms from both parents, sort by
 * probability weight (descending), and take the top N.
 */
function weightedCrossover(
  transformsA: LooseTransform[],
  transformsB: LooseTransform[],
  count: number,
): LooseTransform[] {
  const pool = [...transformsA, ...transformsB].map((t) => deepClone(t))
  pool.sort((a, b) => b.probability - a.probability)

  return pool.slice(0, count).map((t) => {
    const newVars: Record<string, LooseVariation> = {}
    for (const [, v] of Object.entries(t.variations)) {
      newVars[generateVariationId()] = v
    }
    t.variations = newVars
    return t
  })
}

/**
 * Shuffle crossover: pool all transforms, randomly shuffle, take N.
 */
function shuffleCrossover(
  transformsA: LooseTransform[],
  transformsB: LooseTransform[],
  count: number,
): LooseTransform[] {
  const pool = [...transformsA, ...transformsB].map((t) => deepClone(t))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(randomRange(0, i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }

  return pool.slice(0, count).map((t) => {
    const newVars: Record<string, LooseVariation> = {}
    for (const [, v] of Object.entries(t.variations)) {
      newVars[generateVariationId()] = v
    }
    t.variations = newVars
    return t
  })
}

/**
 * Alternate crossover: take transforms alternating from A, B, A, B…
 */
function alternateCrossover(
  transformsA: LooseTransform[],
  transformsB: LooseTransform[],
  count: number,
): LooseTransform[] {
  const selected: LooseTransform[] = []
  let i = 0
  const maxIter = Math.max(transformsA.length, transformsB.length) * 2

  while (selected.length < count && i < maxIter) {
    const source = i % 2 === 0 ? transformsA : transformsB
    const srcIdx = Math.floor(i / 2) % source.length
    if (srcIdx < source.length) {
      const cloned = deepClone(source[srcIdx]!)
      const newVars: Record<string, LooseVariation> = {}
      for (const [, v] of Object.entries(cloned.variations)) {
        newVars[generateVariationId()] = v
      }
      cloned.variations = newVars
      selected.push(cloned)
    }
    i++
  }

  return selected
}

/**
 * Smart crossover: match transforms by dominant variation type between parents,
 * cross-breed matched pairs, and fill remaining slots from unmatched.
 *
 * This produces children where traits blend more intentionally — a swirl from
 * parent A combines with a swirl from parent B — instead of random assembly.
 */
function smartCrossover(
  transformsA: LooseTransform[],
  transformsB: LooseTransform[],
  count: number,
): LooseTransform[] {
  if (transformsA.length === 0 && transformsB.length === 0) return []
  if (transformsA.length === 0)
    return shuffleCrossover(transformsA, transformsB, count)
  if (transformsB.length === 0)
    return shuffleCrossover(transformsA, transformsB, count)

  // 1. Determine dominant variation type for each transform
  function dominantType(t: LooseTransform): string | null {
    let best: string | null = null
    let bestWeight = -1
    for (const [, v] of Object.entries(t.variations)) {
      if ((v.weight ?? 0) > bestWeight) {
        bestWeight = v.weight ?? 0
        best = v.type
      }
    }
    return best
  }

  // 2. Group transforms by dominant type
  const byTypeA = new Map<string, LooseTransform[]>()
  const byTypeB = new Map<string, LooseTransform[]>()
  const unmatchedA: LooseTransform[] = []
  const unmatchedB: LooseTransform[] = []

  for (const t of transformsA) {
    const dt = dominantType(t)
    if (dt) {
      const arr = byTypeA.get(dt) ?? []
      arr.push(t)
      byTypeA.set(dt, arr)
    } else {
      unmatchedA.push(t)
    }
  }

  for (const t of transformsB) {
    const dt = dominantType(t)
    if (dt) {
      const arr = byTypeB.get(dt) ?? []
      arr.push(t)
      byTypeB.set(dt, arr)
    } else {
      unmatchedB.push(t)
    }
  }

  // 3. Cross-breed matched pairs
  const crossBred: LooseTransform[] = []

  for (const [type, listA] of byTypeA) {
    const listB = byTypeB.get(type)
    if (!listB || listB.length === 0) {
      // Type only in A — add as unmatched
      for (const t of listA) unmatchedA.push(t)
      continue
    }

    // Sort by probability (higher first) and pair up
    const sortedA = [...listA].sort((a, b) => b.probability - a.probability)
    const sortedB = [...listB].sort((a, b) => b.probability - a.probability)
    const pairs = Math.min(sortedA.length, sortedB.length)

    for (let i = 0; i < pairs; i++) {
      const ta = deepClone(sortedA[i]!)
      const tb = sortedB[i]!

      // Cross-breed affine: random per-coefficient inheritance
      for (const key of Object.keys(ta.preAffine)) {
        if (random01() < 0.5) {
          const other = tb.preAffine[key]
          if (other !== undefined) ta.preAffine[key] = other
        }
      }
      for (const key of Object.keys(ta.postAffine)) {
        if (random01() < 0.5) {
          const other = tb.postAffine[key]
          if (other !== undefined) ta.postAffine[key] = other
        }
      }

      // Cross-breed color: mix with slight perturbation
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

      // Cross-breed probability
      ta.probability = ta.probability * 0.5 + tb.probability * 0.5

      // Cross-breed variations: match same-type vars
      const newVars: Record<string, LooseVariation> = {}
      const varsB = Object.entries(tb.variations)
      const usedBTypes = new Set<string>()

      for (const [, va] of Object.entries(ta.variations)) {
        // Find matching type in B
        const matchIdx = varsB.findIndex(
          ([, vb]) => vb.type === va.type && !usedBTypes.has(vb.type),
        )
        if (matchIdx >= 0) {
          const [, vb] = varsB[matchIdx]!
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

      // Add B-only variation types
      for (const [, vb] of varsB) {
        if (!usedBTypes.has(vb.type)) {
          newVars[generateVariationId()] = { ...vb }
        }
      }

      ta.variations = newVars
      crossBred.push(ta)
    }

    // Excess transforms from A or B become unmatched
    for (let i = pairs; i < sortedA.length; i++) unmatchedA.push(sortedA[i]!)
    for (let i = pairs; i < sortedB.length; i++) unmatchedB.push(sortedB[i]!)
  }

  // Types only in B
  for (const [type, listB] of byTypeB) {
    if (!byTypeA.has(type)) {
      for (const t of listB) unmatchedB.push(t)
    }
  }

  // 4. Build result: cross-bred pairs first, then unmatched
  const result: LooseTransform[] = [...crossBred]

  const remaining = [...unmatchedA, ...unmatchedB]
  // Shuffle unmatched for variety
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

// ── Smart breed match analysis ────────────────────────────────────────────────

export interface SmartBreedMatchInfo {
  /** Variation types found in both parents (cross-bred pairs). */
  matchedTypes: string[]
  /** Variation types only in parent A. */
  unmatchedA: string[]
  /** Variation types only in parent B. */
  unmatchedB: string[]
  /** Number of cross-bred transform pairs. */
  crossBredPairs: number
}

/**
 * Analyze which variation types would be matched by smart crossover
 * between two parent flames. Used to show visual feedback in BreedGallery.
 */
export function analyzeSmartBreedMatch(
  parentA: FlameDescriptor,
  parentB: FlameDescriptor,
): SmartBreedMatchInfo {
  // 1. Determine dominant variation type for each transform
  function dominantTypeOf(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t: any,
  ): string | null {
    let best: string | null = null
    let bestWeight = -1
    for (const [, v] of Object.entries(
      (t.variations ?? {}) as Record<string, LooseVariation>,
    )) {
      if ((v.weight ?? 0) > bestWeight) {
        bestWeight = v.weight ?? 0
        best = v.type
      }
    }
    return best
  }

  const typesA = new Set<string>()
  const typesB = new Set<string>()

  for (const [, t] of transformEntries(parentA)) {
    const dt = dominantTypeOf(t)
    if (dt) typesA.add(dt)
  }
  for (const [, t] of transformEntries(parentB)) {
    const dt = dominantTypeOf(t)
    if (dt) typesB.add(dt)
  }

  const matchedTypes: string[] = []
  const unmatchedA: string[] = []
  const unmatchedB: string[] = []

  for (const t of typesA) {
    if (typesB.has(t)) {
      matchedTypes.push(t)
    } else {
      unmatchedA.push(t)
    }
  }
  for (const t of typesB) {
    if (!typesA.has(t)) {
      unmatchedB.push(t)
    }
  }

  // Count cross-bred pairs: sum of min(count_in_A_by_type, count_in_B_by_type)
  function typeCount(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries: [string, any][],
  ): Map<string, number> {
    const map = new Map<string, number>()
    for (const [, t] of entries) {
      const dt = dominantTypeOf(t)
      if (dt) map.set(dt, (map.get(dt) ?? 0) + 1)
    }
    return map
  }

  const countA = typeCount(transformEntries(parentA))
  const countB = typeCount(transformEntries(parentB))
  let crossBredPairs = 0
  for (const t of matchedTypes) {
    crossBredPairs += Math.min(countA.get(t) ?? 0, countB.get(t) ?? 0)
  }

  return {
    matchedTypes: matchedTypes.sort(),
    unmatchedA: unmatchedA.sort(),
    unmatchedB: unmatchedB.sort(),
    crossBredPairs,
  }
}

// ── Main breeding function ─────────────────────────────────────────────────

/**
 * Breed two parent flames together, producing `config.count` child flames.
 *
 * The breeding process:
 * 1. Selects transforms from each parent via the chosen crossover strategy
 * 2. Cross-breeds affine coefficients, colors, and variation parameters
 *    between the two parents where possible
 * 3. Applies light mutation (controlled by `config.mutationStrength`)
 * 4. Normalizes transform probabilities and validates each child
 *
 * Only works with two flames of the same dimension (both 2D or both 3D).
 * Returns an array of validated `FlameDescriptor` children.
 */
export function breedFlames(
  parentA: FlameDescriptor,
  parentB: FlameDescriptor,
  config: Partial<BreedConfig> = {},
): FlameDescriptor[] {
  const cfg = { ...DEFAULT_BREED_CONFIG, ...config }
  const dims = parentA.renderSettings.dimensions ?? 2
  if (cfg.count < 1) return []

  // Collect transform data from both parents
  const entriesA = transformEntries(parentA)
  const entriesB = transformEntries(parentB)

  if (entriesA.length === 0 && entriesB.length === 0) return []
  if (entriesA.length === 0) {
    // Only parent B has transforms — mutate B
    return Array.from({ length: cfg.count }, () => {
      const child = deepClone(parentB)
      mutateFlameLight(child, cfg.mutationStrength)
      return validateFlame(child)
    })
  }
  if (entriesB.length === 0) {
    // Only parent A has transforms — mutate A
    return Array.from({ length: cfg.count }, () => {
      const child = deepClone(parentA)
      mutateFlameLight(child, cfg.mutationStrength)
      return validateFlame(child)
    })
  }

  const transformsA: LooseTransform[] = entriesA.map(([, t]) => ({
    probability: t.probability ?? 0,
    colorSpeed: t.colorSpeed,
    visible: t.visible,
    preAffine: t.preAffine ? { ...t.preAffine } : {},
    postAffine: t.postAffine ? { ...t.postAffine } : {},
    color: t.color ? { ...t.color } : { x: 0, y: 0 },
    variations: Object.fromEntries(
      variationEntries(t).map(([vid, v]) => [vid, { ...v }]),
    ),
  }))

  const transformsB: LooseTransform[] = entriesB.map(([, t]) => ({
    probability: t.probability ?? 0,
    colorSpeed: t.colorSpeed,
    visible: t.visible,
    preAffine: t.preAffine ? { ...t.preAffine } : {},
    postAffine: t.postAffine ? { ...t.postAffine } : {},
    color: t.color ? { ...t.color } : { x: 0, y: 0 },
    variations: Object.fromEntries(
      variationEntries(t).map(([vid, v]) => [vid, { ...v }]),
    ),
  }))

  // Determine target transform count: average of both parents, clamped
  const targetCount = Math.max(
    1,
    Math.min(
      transformsA.length + transformsB.length,
      Math.round((transformsA.length + transformsB.length) / 2),
    ),
  )

  const children: FlameDescriptor[] = []

  for (let c = 0; c < cfg.count; c++) {
    // 1. Select transforms via crossover
    let selected: LooseTransform[]
    switch (cfg.crossoverMode) {
      case 'weighted':
        selected = weightedCrossover(transformsA, transformsB, targetCount)
        break
      case 'shuffle':
        selected = shuffleCrossover(transformsA, transformsB, targetCount)
        break
      case 'alternate':
        selected = alternateCrossover(transformsA, transformsB, targetCount)
        break
      case 'smart':
        selected = smartCrossover(transformsA, transformsB, targetCount)
        break
      case 'uniform':
      default:
        selected = uniformCrossover(transformsA, transformsB, targetCount)
        break
    }

    if (selected.length === 0) continue

    // 2. Cross-breed variation params between parents where types match
    crossVariations(selected, transformsA, transformsB)

    // 3. Cross-breed colors
    crossColors(selected, transformsA, transformsB)

    // 4. Apply light mutation
    if (cfg.mutationStrength > 0) {
      mutateSelected(selected, cfg.mutationStrength, dims)
    }

    // 5. Normalize probabilities
    const totalProb = selected.reduce((sum, t) => sum + t.probability, 0)
    if (totalProb > 0) {
      for (const t of selected) {
        t.probability = t.probability / totalProb
      }
    }

    // 6. Build child descriptor
    const childTransforms: Record<string, unknown> = {}
    for (const t of selected) {
      const tid = generateTransformId(`breed_${c}`)
      childTransforms[tid] = {
        probability: t.probability,
        colorSpeed: t.colorSpeed ?? 0.4,
        visible: t.visible ?? true,
        preAffine: t.preAffine,
        postAffine: t.postAffine,
        color: t.color,
        variations: t.variations,
      }
    }

    const parentMeta = parentA.metadata ?? parentB.metadata
    const child = validateFlame({
      version: parentA.version ?? '1.0',
      metadata: {
        name: `Breed #${c + 1}`,
        description: parentMeta?.description ?? '',
        author: parentMeta?.author ?? 'unknown',
      },
      renderSettings: deepClone(parentA.renderSettings),
      transforms: childTransforms,
    })

    children.push(child)
  }

  return children
}

/**
 * For each selected transform, if both parents have a variation of the same
 * type, cross-breed their params (random per-param inheritance).
 */
function crossVariations(
  selected: LooseTransform[],
  transformsA: LooseTransform[],
  transformsB: LooseTransform[],
) {
  const paramsA = new Map<string, Record<string, number>>()
  const paramsB = new Map<string, Record<string, number>>()

  for (const t of transformsA) {
    for (const [, v] of Object.entries(t.variations)) {
      if (v.params && !paramsA.has(v.type)) {
        paramsA.set(v.type, v.params)
      }
    }
  }
  for (const t of transformsB) {
    for (const [, v] of Object.entries(t.variations)) {
      if (v.params && !paramsB.has(v.type)) {
        paramsB.set(v.type, v.params)
      }
    }
  }

  for (const t of selected) {
    for (const [, v] of Object.entries(t.variations)) {
      const targetParams =
        paramsA.get(v.type) ?? paramsB.get(v.type) ?? undefined
      if (!targetParams) continue
      // 50% chance to cross-breed with the other parent's params for this type
      if (random01() < 0.5 && v.params) {
        const crossed = crossVariationParams(
          { type: v.type, weight: v.weight, params: v.params },
          {
            type: v.type,
            weight: v.weight,
            params: targetParams,
          },
        )
        if (crossed) v.params = crossed
      }
    }
  }
}

/**
 * Cross-breed colors: for each selected transform, interpolate its color
 * toward a random transform color from the other parent pool.
 */
function crossColors(
  selected: LooseTransform[],
  transformsA: LooseTransform[],
  transformsB: LooseTransform[],
) {
  for (const t of selected) {
    if (random01() < 0.4) {
      // 40% chance to cross-breed color
      const otherPool = random01() < 0.5 ? transformsA : transformsB
      if (otherPool.length > 0) {
        const other = otherPool[Math.floor(random01() * otherPool.length)]!
        t.color = crossColor(t.color, other.color)
      }
    }
  }
}

/**
 * Apply light mutation to selected transforms.
 */
function mutateSelected(
  selected: LooseTransform[],
  strength: number,
  _dims: number,
) {
  const sigmaScale = 0.02 + strength * 0.15

  for (const t of selected) {
    // Mutate affines lightly
    perturbAffine(t.preAffine, sigmaScale)
    perturbAffine(t.postAffine, sigmaScale)

    // Mutate colors lightly
    t.color = {
      x: randomPerturbation(t.color.x, 0.08 * strength, [-0.4, 0.4]),
      y: randomPerturbation(t.color.y, 0.08 * strength, [-0.4, 0.4]),
    }

    // Mutate variation params
    for (const [, v] of Object.entries(t.variations)) {
      if (v.params) {
        const varType = v.type
        const is3DVar =
          isVariationType3D(varType) || isParametricVariationType3D(varType)

        const registry = (
          is3DVar ? transformVariations3D : transformVariations
        ) as Record<string, { paramDefaults?: Record<string, number> }>
        const defaults = registry[varType]
        if (defaults?.paramDefaults) {
          perturbParams(v.params, defaults.paramDefaults, sigmaScale)
        }
      }
      // Slightly nudge variation weights
      v.weight = randomPerturbation(v.weight, 0.1 * strength, [0.01, 1.0])
    }
  }
}

/**
 * Apply light mutation directly to a FlameDescriptor (used when only
 * one parent has transforms).
 */
function mutateFlameLight(flame: FlameDescriptor, strength: number): void {
  const sigmaScale = 0.02 + strength * 0.15

  for (const [, t] of transformEntries(flame)) {
    if (t.preAffine) perturbAffine(t.preAffine, sigmaScale)

    if (t.postAffine) perturbAffine(t.postAffine, sigmaScale)
    if (t.color) {
      t.color = {
        x: randomPerturbation(t.color.x, 0.08 * strength, [-0.4, 0.4]),
        y: randomPerturbation(t.color.y, 0.08 * strength, [-0.4, 0.4]),
      }
    }
    for (const [, v] of variationEntries(t)) {
      const varType = v.type
      const is3DVar =
        isVariationType3D(varType) || isParametricVariationType3D(varType)

      const registry = (
        is3DVar ? transformVariations3D : transformVariations
      ) as Record<string, { paramDefaults?: Record<string, number> }>
      const defaults = registry[varType]
      if (v.params && defaults?.paramDefaults) {
        perturbParams(v.params, defaults.paramDefaults, sigmaScale)
      }
      if (v.weight !== undefined) {
        v.weight = randomPerturbation(v.weight, 0.1 * strength, [0.01, 1.0])
      }
    }
  }
}
