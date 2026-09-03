import { describeAllowedCommands } from '@/arcade/commandHints'
import { DEFAULT_DUEL_SECONDS, duelActive, MAX_DUEL_SECONDS, MIN_DUEL_SECONDS, runningDuel, startDuel, stopDuel, } from '@/arcade/duel'
import { finishDuel } from '@/arcade/duelActions'
import { qualityRank } from '@/arcade/guard'
import { clearNarration } from '@/arcade/narration'
import { agentDriving, startPilot } from '@/arcade/pilot'
import { ALWAYS_ALLOWED, DUEL_ALLOWED, DUEL_STEP_BUDGET } from '@/arcade/topics'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext, setWebMcpContext, setWebMcpTarget, } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

const NOT_READY = {
  error: 'Workspace not ready. The flame editor has not finished loading.',
}

function clampSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DUEL_SECONDS
  }
  return Math.min(
    MAX_DUEL_SECONDS,
    Math.max(MIN_DUEL_SECONDS, Math.round(value)),
  )
}

export const arcadeStartDuel: WebMcpTool = {
  name: 'arcade_start_duel',
  description:
    'Start a Duel: you and the viewer edit your own flames side by side against one clock. Opens the split screen, gives you your own flame, and records both sides. Then read yours with get_flame and change it with execute_command (flame.* and camera.* only), narrate with arcade_narrate, and finish with arcade_end_duel.',
  inputSchema: {
    type: 'object',
    properties: {
      durationSeconds: {
        type: 'integer',
        description: `Clock for both sides, ${MIN_DUEL_SECONDS}-${MAX_DUEL_SECONDS} (default ${DEFAULT_DUEL_SECONDS})`,
      },
      rivalFrom: {
        type: 'string',
        enum: ['mirror', 'blank'],
        description:
          "mirror (default) starts you from a copy of the viewer's flame; blank starts you from an empty canvas",
      },
    },
  },
  execute: (input) => {
    const ctx = getWebMcpContext('player')
    if (!ctx) return NOT_READY
    if (agentDriving()) {
      return {
        error: 'An Arcade session is already active. Finish or stop it first.',
      }
    }
    if (duelActive()) return { error: 'A duel is already running.' }
    const playerFlame = ctx.flameDescriptor()
    if (playerFlame.renderSettings.dimensions === 3) {
      return {
        error:
          'Duel runs on 2D flames only for now, and this flame is 3D: the split screen binds a 2D camera per side. Switch to 2D and start again.',
      }
    }
    const raw = (input ?? {}) as {
      durationSeconds?: unknown
      rivalFrom?: unknown
    }
    const seconds = clampSeconds(raw.durationSeconds)
    const rivalFlame = deepClone(playerFlame)
    if (raw.rivalFrom === 'blank') {
      rivalFlame.transforms = {}
    }
    const started = startDuel({
      rivalFlame,
      playerFlame,
      durationMs: seconds * 1000,
      // The toggle lives in the recorder UI; both by default, which is what a
      // duel worth replaying needs.
      recording: 'both',
      // The clock is what ends a duel; the agent cannot. Resolve the context
      // when it fires rather than capturing it, so a workspace that remounted
      // mid-duel still ends on the live one.
      onExpire: () => {
        const player = getWebMcpContext('player')
        if (player) void finishDuel(player, 'finished')
      },
    })
    if (!started.ok) return { error: started.error }
    const allowed = [...DUEL_ALLOWED, ...ALWAYS_ALLOWED]
    const pilotResult = startPilot({
      mode: 'duel',
      title: 'Duelling you',
      stepBudget: DUEL_STEP_BUDGET,
      allowed,
      qualityRankAtStart: qualityRank(ctx.arcade?.qualityPreset() ?? 'mid'),
      seatId: 'rival',
      lock: 'seat',
    })
    if (!pilotResult.ok) {
      stopDuel()
      return { error: pilotResult.error }
    }
    clearNarration()
    // The rival's context becomes what every tool reads, so execute_command,
    // get_flame and the rest act on the AI's flame with no per-tool change.
    setWebMcpContext(started.rival.ctx, 'rival')
    setWebMcpTarget('rival')
    ctx.arcade?.closeHub()
    return {
      ok: true,
      durationSeconds: seconds,
      stepBudget: DUEL_STEP_BUDGET,
      allowedCommands: describeAllowedCommands(allowed),
      tips: [
        "get_flame and execute_command now act on YOUR flame, not the viewer's.",
        'Aim for something striking rather than merely complicated; the score sheet rewards contrast and symmetry.',
        'Narrate what you are going for so the viewer can follow.',
      ],
    }
  },
}

export const arcadeEndDuel: WebMcpTool = {
  name: 'arcade_end_duel',
  description:
    "Finish the Duel: stops the clock, stops both recordings, saves each side to the viewer's library, unlocks the screen and shows the result. Provide a short title.",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'At most 80 characters' },
      summary: { type: 'string', description: 'At most 400 characters' },
    },
  },
  execute: async (input) => {
    if (!runningDuel()) return { error: 'No duel is running.' }
    const playerCtx = getWebMcpContext('player')
    if (!playerCtx) return NOT_READY
    const raw = (input ?? {}) as { title?: unknown; summary?: unknown }
    return await finishDuel(playerCtx, 'finished', {
      title: typeof raw.title === 'string' ? raw.title : undefined,
      summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    })
  },
}
