import { generateDefaults } from '@/commands/builtins/generate'
import { executeCommand } from '@/commands/registry'
import { DEFAULT_SEAT } from '@/seats/seatId'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext, setWebMcpContext, setWebMcpTarget, } from '@/webmcp/contextBridge'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import { closeDuelView, duelActive, duelShowing, runningDuel, startDuel, stopDuel, } from './duel'
import { duelJudge } from './duelJudge'
import { newDuelId, showDuelResult } from './duelResult'
import { qualityRank } from './guard'
import { clearNarration } from './narration'
import { agentDriving, appendPilotLog, endPilot, notePilotSaveResult, startPilot, } from './pilot'
import { ALWAYS_ALLOWED, DUEL_ALLOWED, DUEL_STEP_BUDGET } from './topics'
import type { DuelVerdict } from './duelJudge'
import type { PilotEndReason } from './pilot'
import type { CommandContext } from '@/commands/types'

/**
 * Who is in the other seat.
 *
 * `none` opens the split screen with nobody driving it. Everything else is
 * the same duel — the same clock, the same dial, the same chips, the same
 * ending — so the interface can be looked at, and changed, without a chat
 * connected and a model round trip between every edit. It is a development
 * affordance, not a game mode: there is no opponent, so there is nothing to
 * win, and the hub only offers it where `SOLO_DUEL_AVAILABLE` says so.
 */
export type DuelOpponent = 'ai' | 'none'

/**
 * What the viewer's side starts as.
 *
 * `current` is the flame they have loaded, which is the only thing a duel
 * could start from before. The two random options exist because a duel is
 * started by the agent, on whatever the viewer happens to have open — so
 * without this, wanting a 3D duel meant loading a 3D flame by hand first and
 * hoping the agent asked at the right moment.
 */
export type DuelStartFrom = 'current' | 'random-2d' | 'random-3d'

/**
 * The one way a duel starts, whoever is in the other seat.
 *
 * Shared with the tool rather than reimplemented beside it: the 3D refusal,
 * the mirrored rival flame, the recorder hand-off and the clock that ends the
 * thing are exactly the parts a second entry point would drift on, and a solo
 * duel that drifts is worthless for inspecting the real one.
 */
export function beginDuel(
  ctx: CommandContext,
  opts: {
    seconds: number
    rivalFrom?: 'mirror' | 'blank'
    startFrom?: DuelStartFrom
    opponent: DuelOpponent
  },
): { ok: true; seconds: number; allowed: string[] } | { error: string } {
  if (agentDriving()) {
    return {
      error: 'An Arcade session is already active. Finish or stop it first.',
    }
  }
  if (duelActive()) return { error: 'A duel is already running.' }
  // A result card left on screen is not a running duel, but its seat is still
  // alive; starting over takes the old screen down first.
  if (duelShowing()) closeDuelView()
  // Through the registry, so the replacement is one recorded step the viewer
  // can undo — and so the duel's own take begins from a state that exists.
  if (opts.startFrom === 'random-2d' || opts.startFrom === 'random-3d') {
    // The whole config, not `{ dimensions }`: a partial one fails every check
    // in `asGenerateConfig` and falls back to the flame's current dimension
    // without saying so, which is the opposite of what was asked for.
    executeCommand(
      'flame.randomize',
      ctx,
      undefined,
      generateDefaults(opts.startFrom === 'random-3d' ? 3 : 2),
    )
  }
  // 2D and 3D both. The seats bind whichever camera the flame asks for, and
  // the rival is a mirror of the player, so the two halves are always the same
  // dimension — there is nothing to reconcile.
  const playerFlame = ctx.flameDescriptor()
  const solo = opts.opponent === 'none'
  const rivalFlame = deepClone(playerFlame)
  if (opts.rivalFrom === 'blank') {
    rivalFlame.transforms = {}
  }
  const started = startDuel({
    rivalFlame,
    playerFlame,
    durationMs: opts.seconds * 1000,
    // The toggle lives in the recorder UI; both by default, which is what a
    // duel worth replaying needs. A solo duel records neither side: it is an
    // inspection pass, and it should not leave takes in the library.
    recording: solo ? 'none' : 'both',
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
  if (!solo) {
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
    // The rival's context becomes what every tool reads, so execute_command,
    // get_flame and the rest act on the agent's flame with no per-tool change.
    // Solo leaves the bridge on the player: there is no agent to point at the
    // other seat, and moving it would aim a stray tool call at a flame nobody
    // is playing.
    setWebMcpContext(started.rival.ctx, 'rival')
    setWebMcpTarget('rival')
  }
  clearNarration()
  ctx.arcade?.closeHub()
  return { ok: true, seconds: opts.seconds, allowed }
}

export type DuelOutcome = {
  ok: true
  title: string
  winner: DuelVerdict['winner']
  verdict: string
  playerScore: number
  rivalScore: number
  savedTakes: number
}

/**
 * The one way a duel ends — the End button, the clock, Escape twice, and the
 * end tool all come through here.
 *
 * `finishPilot` is not enough on its own: it ends the *pilot* and leaves
 * `duel()` running, which strands the stage, leaks the rival seat and throws
 * away the rival's take. So a duel gets its own ending, and it is this one.
 *
 * Order is load-bearing. `stopDuel()` runs before anything that can throw and
 * before `endPilot`, because the rival seat must still be alive to hand over
 * its recorded session; and the library write happens last, so a library that
 * refuses the write cannot leave the viewer trapped on a stage with no exit.
 */
export async function finishDuel(
  ctx: CommandContext,
  reason: PilotEndReason,
  opts: { title?: string; summary?: string } = {},
): Promise<DuelOutcome | { error: string }> {
  const state = runningDuel()
  if (!state) return { error: 'No duel is running.' }
  const title =
    (opts.title ?? state.ready?.title ?? '').trim().slice(0, 80) || 'Duel'
  const summary = opts.summary ?? state.ready?.summary
  const playerFlame = ctx.flameDescriptor()
  const rivalFlame = state.rival.flame()
  const verdict = duelJudge.judge(playerFlame, rivalFlame)
  const winnerFlame = verdict.winner === 'rival' ? rivalFlame : playerFlame
  const sessions = stopDuel()
  clearNarration()
  // The tools follow the bridge target; leaving it on the rival seat would
  // point every later call at a context whose root has just been disposed.
  setWebMcpTarget(DEFAULT_SEAT)
  const playerName = `Duel: ${title} — your flame`
  endPilot(reason, {
    title,
    summary: summary?.slice(0, 400),
    sessionName: sessions.player ? playerName : undefined,
    session: sessions.player,
  })
  let saved = 0
  let attempted = 0
  for (const [name, session] of [
    [playerName, sessions.player],
    [`Duel: ${title} — the agent's flame`, sessions.rival],
  ] as const) {
    if (!session) continue
    attempted++
    try {
      await ctx.recorder?.save(session, name)
      saved++
    } catch (error) {
      console.warn('[arcade] could not save a duel take', error)
      appendPilotLog('error', `Could not save "${name}" to the library`)
    }
  }
  if (attempted > 0) notePilotSaveResult(saved === attempted)
  // The card is the report. A toast as well would say the same thing twice,
  // in the corner, over a screen that is now entirely about the result.
  showDuelResult({
    verdict,
    reason,
    // The card names the winner and only falls back to who they are. The
    // take names above are a filename convention and stay as they are.
    playerName: playerFlame.metadata?.name?.trim() || 'You',
    rivalName: state.ready?.title?.trim() || 'The agent',
    winnerFlame,
    archetype: calculateFlameStats(winnerFlame).type,
    durationMs: state.durationMs,
    id: newDuelId(),
    savedTakes: saved,
  })
  return {
    ok: true,
    title,
    winner: verdict.winner,
    verdict: verdict.line,
    playerScore: verdict.playerScore,
    rivalScore: verdict.rivalScore,
    savedTakes: saved,
  }
}
