import { getNormalizedVariationName } from './utils'
import type { TransformVariationType3D } from '../variations3D'
import type { TransformVariationType } from '.'

/**
 * Ranking a typed query against a variation's display name.
 *
 * Shared by the sidebar's quick picker and the duel's add strip so the two
 * cannot answer the same query differently. Higher is better; -1 is no match.
 */
export function fuzzyScore(needle: string, haystack: string): number {
  if (needle === '') return 0
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (h.startsWith(n)) return 100
  if (h.includes(n)) return 80
  // subsequence match
  let hi = 0
  let ni = 0
  let score = 60
  while (ni < n.length && hi < h.length) {
    if (h[hi] === n[ni]) {
      ni++
      score -= hi // penalise gaps
    }
    hi++
  }
  return ni === n.length ? Math.max(1, score) : -1
}

/** The whole list for an empty query, best matches first otherwise. */
export function filterVariations<
  T extends TransformVariationType | TransformVariationType3D,
>(all: readonly T[], query: string): T[] {
  if (!query.trim()) return [...all]
  return all
    .map((t) => ({
      t,
      score: fuzzyScore(query, getNormalizedVariationName(t)),
    }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t)
}
