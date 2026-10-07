/**
 * Persistent taste profile store and flame feature extraction for Evolutionary Art Director.
 */

import { scoreFlame } from '@/flame/fitness'
import { resolveVariationType3D } from '@/flame/transformFunction3D'
import { categoryOf, isVariationTypeFor } from '@/flame/variationRegistry'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import type { FitnessScores } from '@/flame/fitness'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { Dims } from '@/flame/variationRegistry'
import type { VariationCategory } from '@/flame/variations/categories'

export type CandidateReaction = 'like' | 'dislike' | 'neutral'

export interface FlameTasteFeatures {
  fitness: FitnessScores
  powerLevel: number
  type: string
  metrics: {
    complexity: number
    chaosLevel: number
    symmetryScore: number
    energyIntensity: number
  }
  transformCount: number
  variationCategories: string[]
  paletteTemperature: 'warm' | 'cool' | 'balanced'
}

export interface RatedCandidate {
  id: string
  /**
   * The Director session the rating belongs to. Every session restarts at
   * generation 1, so without it a new session overwrote the last one's
   * ratings. Absent on records saved before sessions were keyed; those keep
   * their original id and are treated as one legacy session.
   */
  sessionId?: string | undefined
  generation: number
  candidateIndex: number
  reaction: CandidateReaction
  tags: string[]
  note?: string
  wasSelected: boolean
  features: FlameTasteFeatures
  timestamp: number
}

export interface TasteProfile {
  totalRatings: number
  likeCount: number
  dislikeCount: number
  preferredCategories: string[]
  avoidedCategories: string[]
  avgLikedSymmetry: number
  avgLikedComplexity: number
  avgLikedChaos: number
  preferredPalette: 'warm' | 'cool' | 'balanced'
  summary: string
}

const STORAGE_KEY = 'chaos-master:taste-ratings'
const MAX_RATINGS_HISTORY = 100

let memoryRatings: RatedCandidate[] = []

/**
 * Derives color temperature based on transform hue coordinates.
 */
function derivePaletteTemperature(
  flame: FlameDescriptor,
): 'warm' | 'cool' | 'balanced' {
  const transforms = Object.values(flame.transforms ?? {})
  if (transforms.length === 0) return 'balanced'

  let warmCount = 0
  let coolCount = 0

  for (const t of transforms) {
    if (!t.visible) continue
    const colorX = t.color?.x ?? 0.5
    const hueDeg = (((colorX % 1) + 1) % 1) * 360
    if (hueDeg >= 330 || hueDeg <= 80) {
      warmCount++
    } else if (hueDeg >= 160 && hueDeg <= 280) {
      coolCount++
    }
  }

  if (warmCount > coolCount + 1) return 'warm'
  if (coolCount > warmCount + 1) return 'cool'
  return 'balanced'
}

/**
 * A variation's category as the flame draws it. A 3D flame resolves a type as
 * the 3D renderer does: a mapped 2D name draws as its 3D variation, any other
 * 2D type as its 2D function, and each keeps the category of what it draws as.
 */
function drawnCategory(
  dims: Dims,
  type: string,
): VariationCategory | undefined {
  if (dims === 2) return categoryOf(2, type)
  const drawn = resolveVariationType3D(type)
  if (drawn === undefined) return undefined
  return categoryOf(isVariationTypeFor(3, drawn) ? 3 : 2, drawn)
}

/**
 * Extracts aesthetic and topological taste features from a flame descriptor.
 */
export function extractFlameTasteFeatures(
  flame: FlameDescriptor,
): FlameTasteFeatures {
  const fitness = scoreFlame(flame)
  const stats = calculateFlameStats(flame)
  const dims: Dims = flame.renderSettings?.dimensions === 3 ? 3 : 2

  const categories = new Set<string>()
  const transforms = Object.values(flame.transforms ?? {})

  for (const t of transforms) {
    if (!t.visible) continue
    // By type: the key of `t.variations` is the variation's id, which no
    // registry entry is named.
    for (const variation of Object.values(t.variations ?? {})) {
      const cat = drawnCategory(dims, variation.type)
      if (cat) {
        categories.add(cat)
      }
    }
  }

  return {
    fitness,
    powerLevel: stats.powerLevel,
    type: stats.type,
    metrics: {
      complexity: stats.metrics.complexity,
      chaosLevel: stats.metrics.chaosLevel,
      symmetryScore: stats.metrics.symmetryScore,
      energyIntensity: stats.metrics.energyIntensity,
    },
    transformCount: transforms.length,
    variationCategories: Array.from(categories).sort(),
    paletteTemperature: derivePaletteTemperature(flame),
  }
}

/**
 * Loads stored ratings from localStorage or memory fallback.
 */
export function getStoredRatings(): RatedCandidate[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RatedCandidate[]
      if (Array.isArray(parsed)) {
        memoryRatings = parsed
        return parsed
      }
    }
  } catch {
    // Ignore storage read errors and return memory fallback
  }
  return memoryRatings
}

/**
 * Saves ratings into persistent storage.
 */
function saveRatings(ratings: RatedCandidate[]): void {
  memoryRatings = ratings.slice(-MAX_RATINGS_HISTORY)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(memoryRatings))
  } catch {
    // Ignore storage write errors (e.g. quota exceeded or sandboxed iframe)
  }
}

/** A fresh id for one Director session's ratings. */
export function createDirectorSessionId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  )
}

/**
 * Records or updates user feedback for a candidate flame.
 */
export function recordCandidateFeedback(
  feedback: Omit<RatedCandidate, 'id' | 'timestamp'>,
): RatedCandidate {
  const ratings = getStoredRatings()
  const id =
    feedback.sessionId === undefined
      ? `cand-${feedback.generation}-${feedback.candidateIndex}`
      : `cand-${feedback.sessionId}-${feedback.generation}-${feedback.candidateIndex}`

  const existingIndex = ratings.findIndex((r) => r.id === id)
  const candidateRecord: RatedCandidate = {
    ...feedback,
    id,
    timestamp: Date.now(),
  }

  if (existingIndex >= 0) {
    ratings[existingIndex] = candidateRecord
  } else {
    ratings.push(candidateRecord)
  }

  saveRatings(ratings)
  return candidateRecord
}

/**
 * Derives a structured taste profile from candidate ratings.
 */
export function deriveTasteProfile(
  ratingsInput?: RatedCandidate[],
): TasteProfile {
  const ratings = ratingsInput ?? getStoredRatings()
  const likes = ratings.filter((r) => r.reaction === 'like')
  const dislikes = ratings.filter((r) => r.reaction === 'dislike')

  const totalRatings = ratings.length
  const likeCount = likes.length
  const dislikeCount = dislikes.length

  if (likes.length === 0) {
    return {
      totalRatings,
      likeCount,
      dislikeCount,
      preferredCategories: [],
      avoidedCategories: [],
      avgLikedSymmetry: 0,
      avgLikedComplexity: 0,
      avgLikedChaos: 0,
      preferredPalette: 'balanced',
      summary:
        totalRatings === 0
          ? 'No user taste data recorded yet. Rate candidates to build a profile.'
          : `${totalRatings} candidate(s) rated. No likes registered yet.`,
    }
  }

  // Category frequency
  const catLikeCount: Record<string, number> = {}
  const catDislikeCount: Record<string, number> = {}

  for (const item of likes) {
    for (const cat of item.features.variationCategories) {
      catLikeCount[cat] = (catLikeCount[cat] ?? 0) + 1
    }
  }

  for (const item of dislikes) {
    for (const cat of item.features.variationCategories) {
      catDislikeCount[cat] = (catDislikeCount[cat] ?? 0) + 1
    }
  }

  const preferredCategories = Object.keys(catLikeCount).sort(
    (a, b) => (catLikeCount[b] ?? 0) - (catLikeCount[a] ?? 0),
  )

  const avoidedCategories = Object.keys(catDislikeCount)
    .filter((cat) => (catDislikeCount[cat] ?? 0) > (catLikeCount[cat] ?? 0))
    .sort((a, b) => (catDislikeCount[b] ?? 0) - (catDislikeCount[a] ?? 0))

  const avgLikedSymmetry = Number(
    (
      likes.reduce((acc, cur) => acc + cur.features.metrics.symmetryScore, 0) /
      likes.length
    ).toFixed(1),
  )

  const avgLikedComplexity = Number(
    (
      likes.reduce((acc, cur) => acc + cur.features.metrics.complexity, 0) /
      likes.length
    ).toFixed(1),
  )

  const avgLikedChaos = Number(
    (
      likes.reduce((acc, cur) => acc + cur.features.metrics.chaosLevel, 0) /
      likes.length
    ).toFixed(1),
  )

  const warmCount = likes.filter(
    (l) => l.features.paletteTemperature === 'warm',
  ).length
  const coolCount = likes.filter(
    (l) => l.features.paletteTemperature === 'cool',
  ).length
  const preferredPalette: 'warm' | 'cool' | 'balanced' =
    warmCount > coolCount ? 'warm' : coolCount > warmCount ? 'cool' : 'balanced'

  const summaryParts: string[] = []
  if (preferredCategories.length > 0) {
    summaryParts.push(
      `Prefers ${preferredCategories.slice(0, 3).join(', ')} variations`,
    )
  }
  if (avoidedCategories.length > 0) {
    summaryParts.push(
      `tends to dislike ${avoidedCategories.slice(0, 2).join(', ')}`,
    )
  }
  summaryParts.push(
    `likes symmetry ~${avgLikedSymmetry}/10, complexity ~${avgLikedComplexity}/10, and ${preferredPalette} palettes`,
  )

  return {
    totalRatings,
    likeCount,
    dislikeCount,
    preferredCategories,
    avoidedCategories,
    avgLikedSymmetry,
    avgLikedComplexity,
    avgLikedChaos,
    preferredPalette,
    summary: `${summaryParts.join('; ')}.`,
  }
}

/**
 * Resets the recorded taste store.
 */
export function clearTasteStore(): void {
  memoryRatings = []
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage removal errors
  }
}
