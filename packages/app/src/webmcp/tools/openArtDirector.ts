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
      candidates: Array<{ flame: FlameDescriptor; fitness?: number }>
    }

    ctx.director.setState({
      generation,
      candidates,
    })
    ctx.director.setOpen(true)

    return { success: true, message: 'Art Director UI opened.' }
  },
}
