import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { clearTasteStore, extractFlameTasteFeatures, recordCandidateFeedback, } from '@/arcade/tasteStore'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { directorGetFeedback, directorGetTasteProfile, directorPropose, openArtDirector, } from './arcadeDirector'
import type { WebMcpTool } from '@/webmcp/types'

const run = async (tool: WebMcpTool, input: unknown = {}) =>
  (await tool.execute(input, {})) as Record<string, unknown>

describe('arcade director tools', () => {
  afterEach(() => {
    clearTasteStore()
    clearWebMcpContext()
  })

  it('refuses without workspace context', async () => {
    expect(
      await run(directorPropose, { generation: 1, candidates: [] }),
    ).toHaveProperty('error')
    expect(await run(directorGetFeedback)).toHaveProperty('error')
  })

  it('proposes candidates and opens director UI', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    const flame1 = createTestFlame()
    const flame2 = createTestFlame()

    const result = await run(directorPropose, {
      generation: 2,
      steeringPrompt: 'More symmetrical mandalas',
      candidates: [
        { flame: flame1, rationale: 'Higher symmetry order with 4 transforms' },
        { flame: flame2, rationale: 'Warm palette with spiral variation' },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.generation).toBe(2)
    expect(result.candidateCount).toBe(2)
    expect(ctx.director?.open()).toBe(true)

    const state = ctx.director?.state()
    expect(state?.generation).toBe(2)
    expect(state?.steeringPrompt).toBe('More symmetrical mandalas')
    expect(state?.candidates).toHaveLength(2)
    expect(state?.candidates[0]?.fitness).toBeGreaterThan(0)
    expect(state?.candidates[0]?.rationale).toBe(
      'Higher symmetry order with 4 transforms',
    )
  })

  it('provides backward compatibility with open_art_director', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    const flame = createTestFlame()
    const result = await run(openArtDirector, {
      generation: 1,
      candidates: [{ flame, rationale: 'Initial generation' }],
    })

    expect(result.ok).toBe(true)
    expect(ctx.director?.open()).toBe(true)
  })

  it('retrieves user feedback and extracted features', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    const flame1 = createTestFlame()
    const flame2 = createTestFlame()

    await run(directorPropose, {
      generation: 1,
      candidates: [
        { flame: flame1, rationale: 'Candidate A' },
        { flame: flame2, rationale: 'Candidate B' },
      ],
    })

    // Simulate user reacting in the UI
    const s = ctx.director?.state()
    if (s) {
      s.candidates[0]!.reaction = 'like'
      s.candidates[0]!.tags = ['+Symmetry', 'Warmer']
      s.candidates[1]!.reaction = 'dislike'
      s.candidates[1]!.tags = ['Too chaotic']
      ctx.director?.selectCandidate(0)
    }

    const feedback = await run(directorGetFeedback)
    expect(feedback.ok).toBe(true)
    expect(feedback.generation).toBe(1)
    expect(feedback.selectedIndex).toBe(0)

    const candidates = feedback.candidates as Array<{
      reaction: string
      tags: string[]
      wasSelected: boolean
      features?: { powerLevel: number; variationCategories: string[] }
    }>
    expect(candidates).toHaveLength(2)
    expect(candidates[0]!.reaction).toBe('like')
    expect(candidates[0]!.tags).toEqual(['+Symmetry', 'Warmer'])
    expect(candidates[0]!.wasSelected).toBe(true)
    expect(candidates[0]!.features?.powerLevel).toBeGreaterThan(0)
    // What the agent is told about each candidate's variation families: the
    // candidates hold linearVar and sinusoidalVar, both General.
    expect(candidates.map((c) => c.features?.variationCategories)).toEqual([
      ['general'],
      ['general'],
    ])

    expect(candidates[1]!.reaction).toBe('dislike')
    expect(candidates[1]!.wasSelected).toBe(false)
  })

  it('retrieves aggregated taste profile', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    // Initially empty profile
    const initial = await run(directorGetTasteProfile)
    expect(initial.ok).toBe(true)
    expect((initial.profile as { totalRatings: number }).totalRatings).toBe(0)

    // Record a liked candidate
    recordCandidateFeedback({
      generation: 1,
      candidateIndex: 0,
      reaction: 'like',
      tags: ['+Symmetry'],
      wasSelected: true,
      features: {
        fitness: {
          composite: 0.9,
          variationDiversity: 0.8,
          transformBalance: 0.7,
          colorSpread: 0.85,
          structuralComplexity: 0.8,
        },
        powerLevel: 650,
        type: 'Structured Mandala',
        metrics: {
          complexity: 5.5,
          chaosLevel: 2.1,
          symmetryScore: 8.4,
          energyIntensity: 6.0,
        },
        transformCount: 4,
        variationCategories: ['symmetry', 'general'],
        paletteTemperature: 'warm',
      },
    })

    const updated = await run(directorGetTasteProfile)
    expect(updated.ok).toBe(true)
    const profile = updated.profile as {
      totalRatings: number
      likeCount: number
      preferredPalette: string
      summary: string
    }
    expect(profile.totalRatings).toBe(1)
    expect(profile.likeCount).toBe(1)
    expect(profile.preferredPalette).toBe('warm')
    expect(profile.summary).toContain('likes symmetry')
  })

  // The Director overlay records a rating with the features it extracts from
  // the rated flame; the profile is what the agent reads back.
  it('learns variation categories from the flames the viewer rated', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    recordCandidateFeedback({
      generation: 1,
      candidateIndex: 0,
      reaction: 'like',
      tags: [],
      wasSelected: true,
      features: extractFlameTasteFeatures(createTestFlame()),
    })

    const result = await run(directorGetTasteProfile)
    const profile = result.profile as {
      preferredCategories: string[]
      summary: string
    }
    expect(profile.preferredCategories).toEqual(['general'])
    expect(profile.summary).toBe(
      'Prefers general variations; likes symmetry ~0/10, complexity ~1.4/10, and balanced palettes.',
    )
  })

  it('keeps one session id across generations and starts a new one on restart', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const propose = (generation: number) =>
      run(directorPropose, {
        generation,
        candidates: [{ flame: createTestFlame(), rationale: 'r' }],
      })

    await propose(1)
    const first = ctx.director?.state()?.sessionId
    await propose(2)
    const second = ctx.director?.state()?.sessionId
    await propose(1)
    const restarted = ctx.director?.state()?.sessionId

    expect(first).toEqual(expect.any(String))
    expect(second).toBe(first)
    expect(restarted).not.toBe(first)
  })
})
