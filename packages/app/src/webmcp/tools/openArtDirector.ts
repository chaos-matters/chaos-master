import { mutateFlame } from '@/flame/randomize'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

export const openArtDirector: WebMcpTool = {
  name: 'open_art_director',
  description:
    'Opens the Evolutionary Art Director UI in the user interface. Use this tool after generating candidate flames (via breed_flames or manually) to present them to the user for selection. You must provide an array of flame candidates. The user will select one, which you should monitor via context/events or instruct the user to notify you.',
  inputSchema: {
    type: 'object',
    properties: {
      generation: {
        type: 'number',
        description: 'The current generation number.',
      },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            flame: { type: 'object' },
            fitness: { type: 'number' },
          },
        },
        description: 'The candidate flames generated for this iteration.',
      },
    },
    required: ['generation', 'candidates'],
  },
  execute: (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return { error: 'No workspace context' }
    if (!ctx.director) return { error: 'Director context not found' }

    const { generation, candidates } = input as {
      generation: number
      candidates: Array<{ flame?: FlameDescriptor; fitness?: number }>
    }

    const currentFlame = ctx.flameDescriptor?.()
    const normalizedCandidates = (candidates || []).map((c, i) => {
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
      return {
        fitness: c.fitness ?? 0.85,
        flame,
      }
    })

    ctx.director.setState({
      generation: generation || 1,
      candidates: normalizedCandidates,
    })
    ctx.director.setOpen(true)

    return { success: true, message: 'Art Director UI opened.' }
  },
}
