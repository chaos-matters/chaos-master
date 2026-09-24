import { getWebMcpContext } from '@/webmcp/contextBridge'
import { ARENA_ARCHETYPES, generateArchetypeOpponent, } from '@/webmcp/tools/arenaArchetypes'
import type { ArchetypeId, TacticalStance, } from '@/webmcp/tools/arenaArchetypes'
import type { WebMcpTool } from '@/webmcp/types'

const isCancelled = (
  result: unknown,
): result is { cancelled: true; reason: string } =>
  typeof result === 'object' &&
  result !== null &&
  (result as { cancelled?: unknown }).cancelled === true

export const arenaStartClash: WebMcpTool = {
  name: 'arena_start_clash',
  description:
    'Launches an active, animated territory clash in the Flame Clash Arena UI. Sets up 3D or 2D kinetic combat trajectories, starts the arena spectator HUD, triggers collision flashes and camera shakes, and executes round-by-round battle resolution.',
  inputSchema: {
    type: 'object',
    properties: {
      stance: {
        type: 'string',
        enum: ['balanced', 'resonance', 'bastion', 'entropy'],
        description:
          'Optional tactical combat stance for Player 1. Default is balanced.',
      },
      opponentArchetype: {
        type: 'string',
        enum: [
          'chaos_lord',
          'symmetry_monolith',
          'spiral_leviathan',
          'quantum_siren',
          'solar_seraph',
          'void_stalker',
        ],
        description:
          'Optional challenger archetype to face in the arena. Default is chaos_lord.',
      },
      rounds: {
        type: 'integer',
        description: 'Number of battle rounds to contest. Default is 3.',
      },
    },
  },
  execute: async (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return { error: 'No workspace context available.' }
    const { arena } = ctx
    if (!arena) {
      return {
        error:
          'The Arena HUD is not available in this workspace context. Open the editor and try again.',
      }
    }

    const raw = (input ?? {}) as {
      stance?: TacticalStance
      opponentArchetype?: ArchetypeId
      rounds?: number
    }

    const currentFlame = ctx.flameDescriptor()
    if (!currentFlame) {
      return { error: 'No active flame loaded in editor.' }
    }

    // Set stance if specified
    if (raw.stance && arena.setStance) {
      arena.setStance(raw.stance)
    }

    // Set archetype opponent if specified
    if (raw.opponentArchetype && ARENA_ARCHETYPES[raw.opponentArchetype]) {
      const opp = generateArchetypeOpponent(currentFlame, raw.opponentArchetype)
      arena.setPlayer2Stats({
        name: opp.name,
        type: opp.className,
        school: opp.school,
        powerLevel: opp.powerLevel,
        flame: opp.flame,
        groundedStats: opp.groundedStats,
        metrics: opp.metrics,
      })
    }

    // Ensure arena overlay is opened
    if (!arena.open()) {
      arena.setOpen(true)
    }

    if (!arena.startClash) {
      return {
        error:
          'Arena clash trigger is not ready yet. Ensure the Arena HUD is mounted.',
      }
    }

    try {
      const result = await arena.startClash({
        stance: raw.stance,
        rounds: raw.rounds ?? 3,
      })

      // Settled without a verdict: replaced by a newer clash, the arena
      // closed, or the clash could not start. Say so rather than succeed.
      if (isCancelled(result)) {
        return {
          success: false,
          cancelled: true,
          message: `The clash ended without a verdict. ${result.reason}`,
        }
      }

      return {
        success: true,
        message: 'Clash animation started in Flame Clash Arena.',
        combat: result,
      }
    } catch (err) {
      return {
        error: `Failed to execute clash animation: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
