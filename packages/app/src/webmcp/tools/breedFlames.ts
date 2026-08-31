import { breedFlames, CROSSOVER_MODES  } from '@/flame/breedFlame'
import type {CrossoverMode} from '@/flame/breedFlame';
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

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
        description: 'How many child flames to generate. Default is 3.',
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
    const rawInput = input as any
    const flameA = rawInput.flameA as FlameDescriptor
    const flameB = rawInput.flameB as FlameDescriptor

    if (!flameA || !flameB) {
      return { error: 'Both flameA and flameB must be provided.' }
    }

    try {
      const count = typeof rawInput.count === 'number' ? rawInput.count : 3
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
    } catch (err: any) {
      return {
        error: `Failed to breed flames: ${err.message}`,
      }
    }
  },
}
