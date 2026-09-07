import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

const NOT_READY = {
  error: 'Workspace not ready. The flame editor has not finished loading.',
}

export const arenaCommentate: WebMcpTool = {
  name: 'arena_commentate',
  description:
    'Inject live commentary or battle analysis into the Arena HUD commentary box during an active clash.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The commentary or tactical observation to display.',
      },
      event: {
        type: 'string',
        description:
          'Optional high-priority event banner label (e.g. CRITICAL HIT, RESONANCE BURST).',
      },
    },
    required: ['text'],
  },
  execute: (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    if (!ctx.arena) {
      return { error: 'Arena HUD is not active in this workspace.' }
    }

    const { text, event } = input as { text: string; event?: string }
    if (ctx.arena.setCommentary) {
      ctx.arena.setCommentary(text)
    }
    if (event && ctx.arena.setEventBanner) {
      ctx.arena.setEventBanner(event)
    }

    return {
      ok: true,
      commentary: text,
      event: event ?? null,
    }
  },
}
