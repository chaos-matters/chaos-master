import { DEFAULT_SEAT } from '@/seats/seatId'
import { setWebMcpTarget } from '@/webmcp/contextBridge'
import { runningDuel, stopDuel } from './duel'
import { scoreSheetJudge } from './duelJudge'
import { clearNarration } from './narration'
import { appendPilotLog, endPilot, notePilotSaveResult } from './pilot'
import type { DuelVerdict } from './duelJudge'
import type { PilotEndReason } from './pilot'
import type { CommandContext } from '@/commands/types'

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
  const verdict = scoreSheetJudge.judge(
    ctx.flameDescriptor(),
    state.rival.flame(),
  )
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
    [`Duel: ${title} — the AI's flame`, sessions.rival],
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
  ctx.arcade?.toast(`${title}: ${verdict.line}`)
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
