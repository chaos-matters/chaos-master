import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

export const openArena: WebMcpTool = {
  name: 'open_arena',
  description:
    'Opens the Flame Clash Arena HUD overlay in the user interface. Use this tool after calculating stats with score_flame and combining flames with create_clash_flame, to officially start the battle presentation.',
  inputSchema: {
    type: 'object',
    properties: {
      player1Name: { type: 'string' },
      player1Stats: { type: 'object' },
      player2Name: { type: 'string' },
      player2Stats: { type: 'object' },
    },
    required: ['player1Stats', 'player2Stats'],
  },
  execute: (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return { error: 'No workspace context' }

    const { player1Name, player1Stats, player2Name, player2Stats } =
      input as any

    ctx.arena.setPlayer1Stats({
      name: player1Name || 'Player 1',
      ...player1Stats,
    })
    ctx.arena.setPlayer2Stats({
      name: player2Name || 'Player 2',
      ...player2Stats,
    })
    ctx.arena.setOpen(true)

    return { success: true, message: 'Arena HUD opened.' }
  },
}
