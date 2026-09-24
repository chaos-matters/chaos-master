import { mutateFlame } from '@/flame/randomize'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

function resolveStatsObject(
  rawStats?: Record<string, unknown>,
): Record<string, unknown> {
  const raw = rawStats ?? {}
  return (raw.stats ?? raw) as Record<string, unknown>
}

function resolvePlayer1Flame(
  rawFlame?: FlameDescriptor,
  rawStats?: Record<string, unknown>,
  statsObj?: Record<string, unknown>,
  currentFlame?: FlameDescriptor,
): FlameDescriptor | undefined {
  if (rawFlame) return rawFlame
  if (rawStats?.flame) return rawStats.flame as FlameDescriptor
  if (statsObj?.flame) return statsObj.flame as FlameDescriptor
  return currentFlame ? deepClone(currentFlame) : undefined
}

function createMutatedOpponent(currentFlame: FlameDescriptor): FlameDescriptor {
  return mutateFlame(
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

function resolvePlayer2Flame(
  rawFlame?: FlameDescriptor,
  rawStats?: Record<string, unknown>,
  statsObj?: Record<string, unknown>,
  currentFlame?: FlameDescriptor,
): FlameDescriptor | undefined {
  if (rawFlame) return rawFlame
  if (rawStats?.flame) return rawStats.flame as FlameDescriptor
  if (statsObj?.flame) return statsObj.flame as FlameDescriptor
  if (currentFlame) return createMutatedOpponent(currentFlame)
  return undefined
}

function resolveCombatantPayload(
  defaultName: string,
  providedName?: string,
  statsObj?: Record<string, unknown>,
  flame?: FlameDescriptor,
) {
  const name =
    providedName || (statsObj?.name as string | undefined) || defaultName
  return {
    name,
    ...statsObj,
    flame,
  }
}

const invalidFighter = (field: string) =>
  `Invalid ${field}: it failed schema validation. Inspect the structure with get_flame, or omit it to use the workspace flame.`

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
      autoStart: {
        type: 'boolean',
        description:
          'When true, automatically initiates the visual animated clash in the UI.',
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
      autoStart?: boolean
    }

    const currentFlame = ctx.flameDescriptor()
    const p1StatsObj = resolveStatsObject(raw.player1Stats)
    const p2StatsObj = resolveStatsObject(raw.player2Stats)

    const p1Flame = resolvePlayer1Flame(
      raw.player1Flame,
      raw.player1Stats,
      p1StatsObj,
      currentFlame,
    )
    const p2Flame = resolvePlayer2Flame(
      raw.player2Flame,
      raw.player2Stats,
      p2StatsObj,
      currentFlame,
    )

    // The agent's flames go through the schema the editor loads with, as
    // set_flame's do: the arena reads their render settings and transforms.
    const fighter1 = p1Flame && tryValidateFlame(deepClone(p1Flame))
    const fighter2 = p2Flame && tryValidateFlame(deepClone(p2Flame))
    if (p1Flame && !fighter1) return { error: invalidFighter('player1Flame') }
    if (p2Flame && !fighter2) return { error: invalidFighter('player2Flame') }

    arena.setPlayer1Stats(
      resolveCombatantPayload(
        'Player 1',
        raw.player1Name,
        p1StatsObj,
        fighter1,
      ),
    )
    arena.setPlayer2Stats(
      resolveCombatantPayload(
        'Player 2',
        raw.player2Name,
        p2StatsObj,
        fighter2,
      ),
    )
    arena.setOpen(true)

    if (raw.autoStart && arena.startClash) {
      arena.startClash().catch(() => {})
      return {
        success: true,
        message: 'Arena HUD opened and clash animation initiated.',
      }
    }

    return { success: true, message: 'Arena HUD opened.' }
  },
}
