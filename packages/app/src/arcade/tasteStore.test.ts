import { afterEach, describe, expect, it } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { clearTasteStore, deriveTasteProfile, extractFlameTasteFeatures, getStoredRatings, recordCandidateFeedback, } from './tasteStore'

describe('tasteStore', () => {
  afterEach(() => {
    clearTasteStore()
  })

  it('extracts taste features from a flame', () => {
    const flame = createTestFlame()
    const features = extractFlameTasteFeatures(flame)

    expect(features.fitness).toBeDefined()
    expect(features.fitness.composite).toBeGreaterThan(0)
    expect(features.metrics.complexity).toBeGreaterThan(0)
    expect(features.transformCount).toBe(2)
    expect(Array.isArray(features.variationCategories)).toBe(true)
    expect(['warm', 'cool', 'balanced']).toContain(features.paletteTemperature)
  })

  it('records feedback and updates existing candidates', () => {
    const flame = createTestFlame()
    const features = extractFlameTasteFeatures(flame)

    const entry1 = recordCandidateFeedback({
      generation: 1,
      candidateIndex: 0,
      reaction: 'like',
      tags: ['more symmetry', 'warmer'],
      note: 'Loved the shape',
      wasSelected: true,
      features,
    })

    expect(entry1.id).toBe('cand-1-0')
    expect(getStoredRatings()).toHaveLength(1)

    // Updating reaction on same generation & candidateIndex updates the existing record
    const entry2 = recordCandidateFeedback({
      generation: 1,
      candidateIndex: 0,
      reaction: 'dislike',
      tags: ['too chaotic'],
      wasSelected: false,
      features,
    })

    expect(entry2.id).toBe('cand-1-0')
    const stored = getStoredRatings()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.reaction).toBe('dislike')
    expect(stored[0]!.tags).toEqual(['too chaotic'])
  })

  it('derives a taste profile from likes and dislikes', () => {
    const flame = createTestFlame()
    const features = extractFlameTasteFeatures(flame)

    // Empty state
    const emptyProfile = deriveTasteProfile([])
    expect(emptyProfile.totalRatings).toBe(0)
    expect(emptyProfile.likeCount).toBe(0)
    expect(emptyProfile.summary).toContain('No user taste data recorded yet')

    // Add likes and dislikes
    recordCandidateFeedback({
      generation: 1,
      candidateIndex: 0,
      reaction: 'like',
      tags: ['more symmetry'],
      wasSelected: true,
      features,
    })

    recordCandidateFeedback({
      generation: 1,
      candidateIndex: 1,
      reaction: 'dislike',
      tags: ['too dark'],
      wasSelected: false,
      features,
    })

    const profile = deriveTasteProfile()
    expect(profile.totalRatings).toBe(2)
    expect(profile.likeCount).toBe(1)
    expect(profile.dislikeCount).toBe(1)
    expect(profile.summary).toContain('likes symmetry')
  })
})
