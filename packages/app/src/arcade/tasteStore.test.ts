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
    // linearVar and sinusoidalVar, both in the registry's General category.
    expect(features.variationCategories).toEqual(['general'])
    expect(['warm', 'cool', 'balanced']).toContain(features.paletteTemperature)
  })

  // A 3D flame renders a 2D type through the 3D renderer's own resolution: a
  // mapped name as its 3D variation (gaussianVar as gaussian3D, a blur), any
  // other 2D type as its 2D function. Looking it up in the 3D registry alone
  // found nothing, so a 3D flame's 2D variations taught the profile nothing.
  it("reads a 3D flame's 2D variations as the renderer draws them", () => {
    const flame = createTestFlame()
    const identity3D = {
      ...{ a: 1, b: 0, c: 0, d: 0, e: 0, f: 1 },
      ...{ g: 0, h: 0, i: 0, j: 0, k: 1, l: 0 },
    }
    const types = ['sinusoidalVar', 'gaussianVar']
    Object.values(flame.transforms).forEach((t, i) => {
      Object.assign(t, {
        preAffine: identity3D,
        postAffine: identity3D,
        variations: { [`v${i}`]: { type: types[i], weight: 1 } },
      })
    })
    flame.renderSettings.dimensions = 3

    // sinusoidalVar draws as itself, General; gaussianVar as gaussian3D,
    // a Blur in the 3D registry although gaussianVar is General in 2D.
    expect(extractFlameTasteFeatures(flame).variationCategories).toEqual([
      'blur',
      'general',
    ])
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
    // The liked and the disliked candidate are the same flame, so General is
    // liked as often as disliked: preferred, and not avoided.
    expect([profile.preferredCategories, profile.avoidedCategories]).toEqual([
      ['general'],
      [],
    ])
    expect(profile.summary).toBe(
      'Prefers general variations; likes symmetry ~0/10, complexity ~1.4/10, and balanced palettes.',
    )
  })

  it('keeps ratings from separate Director sessions that reuse generation numbers', () => {
    const features = extractFlameTasteFeatures(createTestFlame())
    for (const sessionId of ['session-a', 'session-b']) {
      for (let candidateIndex = 0; candidateIndex < 6; candidateIndex++) {
        recordCandidateFeedback({
          sessionId,
          generation: 1,
          candidateIndex,
          reaction: 'like',
          tags: [],
          wasSelected: false,
          features,
        })
      }
    }
    // Every Director session starts at generation 1, so keying by
    // (generation, candidateIndex) alone let session B overwrite session A.
    expect(deriveTasteProfile().totalRatings).toBe(12)
  })

  it('still updates a rating in place within one session', () => {
    const features = extractFlameTasteFeatures(createTestFlame())
    const rate = (reaction: 'like' | 'dislike') =>
      recordCandidateFeedback({
        sessionId: 'session-a',
        generation: 2,
        candidateIndex: 3,
        reaction,
        tags: [],
        wasSelected: false,
        features,
      })
    rate('like')
    rate('dislike')
    expect(getStoredRatings()).toHaveLength(1)
    expect(getStoredRatings()[0]?.reaction).toBe('dislike')
  })

  it('keeps records that predate session ids alongside new ones', () => {
    const features = extractFlameTasteFeatures(createTestFlame())
    const base = {
      generation: 1,
      candidateIndex: 0,
      reaction: 'like' as const,
      tags: [],
      wasSelected: false,
      features,
    }
    recordCandidateFeedback(base)
    recordCandidateFeedback({ ...base, sessionId: 'session-a' })
    expect(getStoredRatings().map((r) => r.id)).toEqual([
      'cand-1-0',
      'cand-session-a-1-0',
    ])
  })
})
