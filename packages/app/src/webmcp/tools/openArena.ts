import { mutateFlame } from '@/flame/randomize'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

export const openArena: WebMcpTool = {
  name: 'open_arena',
  description:
    'Opens the Flame Clash Arena HUD overlay in the user interface. Pass calculated stats from score_flame and optional flame descriptors for Player 1 and Player 2. If flames are omitted, uses the workspace flame and a generated mutated opponent.',
  inputSchema: {
    type: 'object',
    properties: {
      player1Name: { type: 'string', description: 'Name of fighter 1.' },
      player1Stats: {
        type: 'object',
        description: 'Stats for fighter 1 (e.g. from score_flame).',
      },
      player1Flame: {
        type: 'object',
        description: 'Optional FlameDescriptor for fighter 1.',
      },
      player2Name: { type: 'string', description: 'Name of fighter 2.' },
      player2Stats: {
        type: 'object',
        description: 'Stats for fighter 2 (e.g. from score_flame).',
      },
      player2Flame: {
        type: 'object',
        description: 'Optional FlameDescriptor for fighter 2.',
      },
    },
    required: ['player1Stats', 'player2Stats'],
  },
  execute: (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return { error: 'No workspace context' }
    // Sandboxed contexts (the Home portal, the replay renderer, tests) have
    // no arena HUD. Say so rather than throwing on an undefined member.
    const { arena } = ctx
    if (!arena) {
      return {
        error:
          'The Arena HUD is not available in this workspace. Open the editor and try again.',
      }
    }

    const raw = (input ?? {}) as {
      player1Name?: string
      player1Stats?: Record<string, unknown>
      player1Flame?: FlameDescriptor
      player2Name?: string
      player2Stats?: Record<string, unknown>
      player2Flame?: FlameDescriptor
    }

    const currentFlame = ctx.flameDescriptor()
    const p1Raw = raw.player1Stats ?? {}
    const p2Raw = raw.player2Stats ?? {}

    // Extract nested stats if passed directly as score_flame result envelope/object
    const p1StatsObj = (p1Raw.stats ?? p1Raw) as Record<string, unknown>
    const p2StatsObj = (p2Raw.stats ?? p2Raw) as Record<string, unknown>

    const p1Flame =
      raw.player1Flame ??
      (p1Raw.flame as FlameDescriptor | undefined) ??
      (p1StatsObj.flame as FlameDescriptor | undefined) ??
      (currentFlame ? deepClone(currentFlame) : undefined)

    let p2Flame =
      raw.player2Flame ??
      (p2Raw.flame as FlameDescriptor | undefined) ??
      (p2StatsObj.flame as FlameDescriptor | undefined)

    if (!p2Flame && currentFlame) {
      p2Flame = mutateFlame(
        deepClone(currentFlame),
        {
          strength: 0.45,
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
          mutateVariations: 'all',
          mutateColors: true,
        },
      )
    }

    arena.setPlayer1Stats({
      name: raw.player1Name || (p1StatsObj.name as string) || 'Player 1',
      ...p1StatsObj,
      flame: p1Flame,
    })
    arena.setPlayer2Stats({
      name: raw.player2Name || (p2StatsObj.name as string) || 'Player 2',
      ...p2StatsObj,
      flame: p2Flame,
    })
    arena.setOpen(true)

    return { success: true, message: 'Arena HUD opened.' }
  },
}
