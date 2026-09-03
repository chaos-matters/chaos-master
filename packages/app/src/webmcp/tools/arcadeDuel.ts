import { describeAllowedCommands } from '@/arcade/commandHints'
import { DEFAULT_DUEL_SECONDS, duelActive, duelRemainingMs, markDuelReady, MAX_DUEL_SECONDS, MIN_DUEL_SECONDS, runningDuel, startDuel, stopDuel, } from '@/arcade/duel'
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
    'Start a Duel: you and the viewer edit your own flames side by side against one clock. Opens the split screen, gives you your own flame, and records both sides. Then read yours with get_flame and change it with execute_command (flame.* and camera.* only), narrate with arcade_narrate, and call arcade_duel_ready when you are happy. You cannot end the duel; the clock does.',
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
      // Through the workspace's own facade, so the viewer's duel take begins
      // with the same snapshot a take they started themselves would.
      startPlayer: (now) => ctx.recorder?.start(now) ?? { ok: true },
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
        'You cannot end the duel. Call arcade_duel_ready to name your flame, then keep polishing until the clock stops.',
      ],
    }
  },
}

/**
 * The agent's way of saying "I am happy with this".
 *
 * Deliberately not an ending, and deliberately free: naming your work should
 * never cost a step, and an agent that has run out of steps must still be able
 * to say what it made.
 */
export const arcadeDuelReady: WebMcpTool = {
  name: 'arcade_duel_ready',
  description:
    'Declare your flame finished and give it a title. This does NOT end the duel — the clock does that, and the viewer can end it early. You may keep polishing afterwards and call this again to change the title. Costs no steps.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'At most 80 characters' },
      summary: { type: 'string', description: 'At most 400 characters' },
    },
  },
  execute: (input) => {
    const state = runningDuel()
    if (!state) return { error: 'No duel is running.' }
    const raw = (input ?? {}) as { title?: unknown; summary?: unknown }
    markDuelReady({
      title: typeof raw.title === 'string' ? raw.title : undefined,
      summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    })
    const remainingMs = Math.round(duelRemainingMs())
    return {
      ok: true,
      remainingMs,
      note:
        remainingMs > 0
          ? 'Noted. The clock is still running, so you can keep improving your flame until it stops.'
          : 'Noted.',
    }
  },
}

/**
 * Kept, and made to refuse.
 *
 * Deleting it would be worse than useless: a chat already in flight keeps
 * calling the name it was told about, and a missing tool gives the model
 * nothing to correct against. So it answers, and it says "you cannot" rather
 * than "not yet", because anything conditional reads as an invitation to
 * retry.
 */
export const arcadeEndDuel: WebMcpTool = {
  name: 'arcade_end_duel',
  description:
    'Deprecated: you cannot end a duel. The clock ends it, and the viewer can end it early. Call arcade_duel_ready instead to name your flame.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: () => ({
    error:
      'You cannot end a duel. The clock ends it, and only the viewer can end it early. Keep improving your flame, and call arcade_duel_ready when you are happy with it — you can carry on polishing after that until time runs out.',
  }),
}
