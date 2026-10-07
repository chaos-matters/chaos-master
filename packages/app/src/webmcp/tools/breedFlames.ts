import { breedFlames, CROSSOVER_MODES } from '@/flame/breedFlame'
import type { CrossoverMode } from '@/flame/breedFlame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

const DEFAULT_BRED_CHILDREN = 3
/**
 * Every child is built on the main thread, and the tool is read-only, so it
 * runs even while an Arcade session holds the lock: a count of a million
 * froze the tab. The Evolution Chamber breeds 9 at a time.
 */
export const MAX_BRED_CHILDREN = 16

/** Clamped rather than refused, as the agent's render settings are; anything
 *  that is not a finite number is read as the default. */
function heldChildCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_BRED_CHILDREN
  }
  return Math.min(MAX_BRED_CHILDREN, Math.max(1, Math.floor(value)))
}

export const breedFlamesTool: WebMcpTool = {
  name: 'breed_flames',
  description:
    'Takes two flames (Parent A and Parent B) and breeds them using a genetic crossover algorithm. Returns an array of child flames (default 3 children). Useful for Evolutionary Art Director workflows.',
  inputSchema: {
    type: 'object',
    properties: {
      flameA: {
        type: 'object',
        description: 'The first parent flame descriptor.',
      },
      flameB: {
        type: 'object',
        description: 'The second parent flame descriptor.',
      },
      count: {
        type: 'number',
        description: `How many child flames to generate. Default is ${DEFAULT_BRED_CHILDREN}, at most ${MAX_BRED_CHILDREN}.`,
      },
      crossoverMode: {
        type: 'string',
        enum: CROSSOVER_MODES,
        description:
          'Crossover strategy: uniform, weighted, shuffle, alternate, or smart. Default is smart.',
      },
      mutationStrength: {
        type: 'number',
        description:
          'Post-crossover mutation strength (0 to 1). 0 is pure crossover, 1 is heavy mutation. Default is 0.1.',
      },
    },
    required: ['flameA', 'flameB'],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown) => {
    const rawInput = input as {
      flameA: FlameDescriptor
      flameB: FlameDescriptor
      count?: unknown
      crossoverMode?: string
      mutationStrength?: number
    }
    const flameA = rawInput.flameA
    const flameB = rawInput.flameB

    if (!flameA || !flameB) {
      return { error: 'Both flameA and flameB must be provided.' }
    }

    try {
      const count = heldChildCount(rawInput.count)
      const crossoverMode = (rawInput.crossoverMode as CrossoverMode) || 'smart'
      const mutationStrength =
        typeof rawInput.mutationStrength === 'number'
          ? rawInput.mutationStrength
          : 0.1

      const children = breedFlames(flameA, flameB, {
        count,
        crossoverMode,
        mutationStrength,
      })

      if (!children || children.length === 0) {
        return {
          error:
            'Failed to generate children. Dimensions may mismatch between parents.',
        }
      }

      return {
        success: true,
        children,
      }
    } catch (err) {
      return {
        error: `Failed to breed flames: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
