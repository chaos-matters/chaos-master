import { calculateGroundedStats } from '@/flame/stats'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { GroundedFlameStats } from '@/flame/stats'
import type { WebMcpTool } from '@/webmcp/types'

const NOT_READY = {
  error: 'Workspace not ready. The flame editor has not finished loading.',
}

export interface ArenaGetStatsResult {
  stats: GroundedFlameStats
  summary: string
}

export const arenaGetStats: WebMcpTool = {
  name: 'arena_get_stats',
  description:
    'Evaluates a flame descriptor (or the current workspace flame) to produce grounded Arena combat stats: School, Dimension, Stability, Entropy, Nonlinearity, Symmetry, Beauty, HP, ATK, DEF, and Crit Chance.',
  inputSchema: {
    type: 'object',
    properties: {
      flame: {
        type: 'object',
        description:
          'Optional FlameDescriptor to evaluate. Omit to evaluate the current workspace flame.',
      },
    },
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: (input: unknown): ArenaGetStatsResult | { error: string } => {
    const raw = (input ?? {}) as { flame?: FlameDescriptor }
    let flame = raw.flame

    if (!flame) {
      const ctx = getWebMcpContext()
      if (!ctx) return NOT_READY
      flame = ctx.flameDescriptor()
    }

    if (!flame) {
      return {
        error: 'No flame descriptor provided or available in workspace.',
      }
    }

    const stats = calculateGroundedStats(flame)
    const summary = `${stats.school} School (HP: ${stats.hp}, ATK: ${stats.atk}, DEF: ${stats.def}, Crit: ${Math.round(stats.critChance * 100)}%, Beauty: ${stats.beauty}/100, Power: ${stats.powerLevel})`

    return {
      stats,
      summary,
    }
  },
}
