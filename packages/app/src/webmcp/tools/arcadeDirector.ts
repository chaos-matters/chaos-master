import { createDirectorSessionId, deriveTasteProfile, extractFlameTasteFeatures, } from '@/arcade/tasteStore'
import { scoreFlame as evaluateFlameFitness } from '@/flame/fitness'
import { mutateFlame } from '@/flame/randomize'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { DirectorCandidate } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

const NOT_READY = {
  error: 'Workspace not ready. The flame editor has not finished loading.',
}

function normalizeCandidates(
  rawCandidates: Array<
    Partial<DirectorCandidate> & { flame?: FlameDescriptor }
  >,
  currentFlame?: FlameDescriptor,
): DirectorCandidate[] {
  return rawCandidates.map((c, i) => {
    let flame = c.flame
    if (
      !flame ||
      !flame.transforms ||
      Object.keys(flame.transforms).length === 0 ||
      !flame.renderSettings?.camera
    ) {
      if (currentFlame) {
        flame = mutateFlame(
          deepClone(currentFlame),
          {
            strength: 0.2 + i * 0.1,
            minTransforms: 2,
            maxTransforms: 6,
            minVariations: 1,
            maxVariations: 3,
            allowedVariations: [],
            dimensions: currentFlame.renderSettings?.dimensions ?? 2,
          },
          {
            mutateAffine: true,
            affineMode: 'smart',
            mutateVariations: 'modify',
            mutateColors: true,
          },
        )
      }
    }

    const calculatedFitness = flame
      ? evaluateFlameFitness(flame).composite
      : 0.85
    const candidate: DirectorCandidate = {
      flame: flame as FlameDescriptor,
      fitness: c.fitness ?? calculatedFitness,
    }
    if (c.rationale !== undefined) candidate.rationale = c.rationale
    if (c.reaction !== undefined) candidate.reaction = c.reaction
    if (c.tags !== undefined) candidate.tags = c.tags
    return candidate
  })
}

/**
 * Propose a generation of candidate flames in the Evolutionary Art Director.
 */
export const directorPropose: WebMcpTool = {
  name: 'director_propose',
  description:
    'Propose a generation of candidate flames in the Evolutionary Art Director with optional rationales. Opens the director modal where the user rates candidates (like/dislike) and assigns tags. Use director_get_feedback to inspect responses.',
  inputSchema: {
    type: 'object',
    properties: {
      generation: {
        type: 'number',
        description: 'The current generation number (1, 2, ...).',
      },
      steeringPrompt: {
        type: 'string',
        description:
          'Optional aesthetic direction or prompt describing this generation.',
      },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            flame: {
              type: 'object',
              description: 'FlameDescriptor object for this candidate.',
            },
            rationale: {
              type: 'string',
              description: 'One-line artistic reasoning for this candidate.',
            },
            fitness: {
              type: 'number',
              description:
                'Optional fitness score (0-1). Automatically computed if omitted.',
            },
          },
        },
        description: 'Candidate flames generated for user evaluation.',
      },
    },
    required: ['generation', 'candidates'],
  },
  execute: (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    if (!ctx.director)
      return { error: 'Director context not found in workspace.' }

    const { generation, candidates, steeringPrompt } = input as {
      generation: number
      candidates: Array<
        Partial<DirectorCandidate> & { flame?: FlameDescriptor }
      >
      steeringPrompt?: string
    }

    const currentFlame = ctx.flameDescriptor?.()
    const normalized = normalizeCandidates(candidates || [], currentFlame)

    // A later generation of the running session keeps its session id, so its
    // ratings accumulate; anything else starts a new session.
    const previous = ctx.director.state()
    const nextGeneration = generation || 1
    const continues =
      previous?.sessionId !== undefined && nextGeneration > previous.generation
    const state: {
      sessionId: string
      generation: number
      candidates: DirectorCandidate[]
      steeringPrompt?: string
    } = {
      sessionId: continues ? previous.sessionId! : createDirectorSessionId(),
      generation: nextGeneration,
      candidates: normalized,
    }
    if (steeringPrompt !== undefined) {
      state.steeringPrompt = steeringPrompt
    }

    ctx.director.setState(state)
    ctx.director.setOpen(true)

    return {
      success: true,
      ok: true,
      generation: generation || 1,
      candidateCount: normalized.length,
      message: `Art Director opened with ${normalized.length} candidates. User can rate with Like/Dislike, tag feedback, or load candidates onto canvas.`,
    }
  },
}

/**
 * Backward-compatible alias for director_propose.
 */
export const openArtDirector: WebMcpTool = {
  ...directorPropose,
  name: 'open_art_director',
  description:
    'Opens the Evolutionary Art Director UI in the workspace. Alias of director_propose.',
}

/**
 * Retrieve user feedback and candidate features from the current Art Director session.
 */
export const directorGetFeedback: WebMcpTool = {
  name: 'director_get_feedback',
  description:
    'Retrieves user reactions (like/dislike), feedback tags, and selected candidate from the Evolutionary Art Director, along with extracted features per candidate.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: () => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    if (!ctx.director)
      return { error: 'Director context not found in workspace.' }

    const state = ctx.director.state()
    if (!state) {
      return {
        ok: true,
        generation: 0,
        candidates: [],
        message: 'No Art Director generation is currently active.',
      }
    }

    const selectedIndex = state.lastFeedback?.selectedIndex
    const evaluatedCandidates = state.candidates.map((cand, idx) => {
      const features = cand.flame
        ? extractFlameTasteFeatures(cand.flame)
        : undefined
      return {
        index: idx,
        rationale: cand.rationale,
        reaction: cand.reaction ?? null,
        tags: cand.tags ?? [],
        wasSelected: selectedIndex === idx,
        fitness: cand.fitness,
        features,
      }
    })

    const likes = evaluatedCandidates.filter((c) => c.reaction === 'like')
    const dislikes = evaluatedCandidates.filter((c) => c.reaction === 'dislike')

    let summary = `Generation ${state.generation}: ${likes.length} liked, ${dislikes.length} disliked out of ${evaluatedCandidates.length} candidates.`
    if (selectedIndex !== undefined) {
      summary += ` User selected candidate #${selectedIndex + 1} onto the canvas.`
    }

    return {
      ok: true,
      generation: state.generation,
      steeringPrompt: state.steeringPrompt,
      selectedIndex,
      candidates: evaluatedCandidates,
      summary,
    }
  },
}

/**
 * Retrieve the user's aggregated taste profile across sessions.
 */
export const directorGetTasteProfile: WebMcpTool = {
  name: 'director_get_taste_profile',
  description:
    'Retrieves the user aesthetic taste profile derived across sessions, including preferred variation families, symmetry, complexity, and palette temperature.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: () => {
    const profile = deriveTasteProfile()
    return {
      ok: true,
      profile,
    }
  },
}
