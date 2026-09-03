import { DEFAULT_SEAT } from '@/seats/seatId'
import { setWebMcpTarget } from '@/webmcp/contextBridge'
import { clearNarration } from './narration'
import { appendPilotLog, drivingState, endPilot, notePilotSaveResult, } from './pilot'
import { clearPilotFocus } from './pilotFocus'
import { isTopicId, LESSON_TOPICS } from './topics'
import type { PilotDriving, PilotEnded, PilotEndReason, PilotMode, } from './pilot'
import type { CommandContext } from '@/commands/types'

function topicTitle(state: PilotDriving): string | undefined {
  return isTopicId(state.topic) ? LESSON_TOPICS[state.topic].title : undefined
}

export function defaultPilotTitle(state: PilotDriving): string {
  return state.mode === 'cinema' ? 'Animation' : (topicTitle(state) ?? 'Lesson')
}

/**
 * What to tell an agent that has run out of steps. Mode-aware because the end
 * tools are: telling a duelling agent to call `arcade_end_lesson` sent it into
 * a loop against a mode check it could never satisfy — and a duel has no end
 * tool at all, so it is told to wait instead.
 */
export function budgetExhaustedMessage(mode: PilotMode): string {
  switch (mode) {
    case 'duel':
      return 'Step budget exhausted. You cannot end a duel; the clock does. Call arcade_duel_ready with a title if you have not already, then wait for time to run out.'
    case 'cinema':
      return 'Step budget exhausted. Finish now with arcade_end_cinema.'
    default:
      return 'Step budget exhausted. Finish now with arcade_end_lesson.'
  }
}

export function sessionNameFor(
  state: PilotDriving,
  title: string,
  reason: PilotEndReason,
): string {
  const kind =
    state.mode === 'cinema'
      ? 'Animation'
      : state.mode === 'duel'
        ? 'Duel'
        : 'Lesson'
  const suffix = reason === 'finished' ? '' : ` (${reason})`
  const topic = topicTitle(state)
  return topic
    ? `${kind}${suffix}: ${topic} — ${title}`
    : `${kind}${suffix}: ${title}`
}

/**
 * The one way a driving session ends: stop the recorder, save what it
 * captured under a library name, move the pilot to `ended`. Shared by the end
 * tools and the overlay's Stop button so a stopped take is kept, not thrown
 * away — the point of the lock is that the human can always take over without
 * losing the work the agent already did.
 */
export async function finishPilot(
  ctx: CommandContext,
  reason: PilotEndReason,
  opts: { title?: string; summary?: string } = {},
): Promise<PilotEnded | { error: string }> {
  const state = drivingState()
  if (!state) return { error: 'No active Arcade session.' }
  const title =
    (opts.title ?? '').trim().slice(0, 80) || defaultPilotTitle(state)
  const session = ctx.recorder?.stop()
  const sessionName = session ? sessionNameFor(state, title, reason) : undefined
  clearNarration()
  clearPilotFocus()
  // The tools follow the bridge target; leaving it on a seat whose duel has
  // ended would point every later call at a disposed context.
  setWebMcpTarget(DEFAULT_SEAT)
  // Leave `driving` in the same tick the recorder stops. Awaiting the save
  // first left a window in which the guard still said "driving" while nothing
  // was being recorded, so a tool call landing there ran and counted a step
  // the saved session does not contain.
  const ended = endPilot(reason, {
    title,
    summary: opts.summary?.slice(0, 400),
    sessionName,
    session,
  })
  if (!ended) return { error: 'No active Arcade session.' }
  let saved = true
  if (session && sessionName !== undefined) {
    try {
      await ctx.recorder?.save(session, sessionName)
    } catch (error) {
      saved = false
      console.warn('[arcade] could not save the session', error)
      appendPilotLog('error', 'Could not save the session to the library')
    }
  }
  if (session && sessionName !== undefined) notePilotSaveResult(saved)
  ctx.arcade?.toast(
    sessionName === undefined
      ? `${title} ended`
      : saved
        ? `Saved "${sessionName}"`
        : `Could not save "${sessionName}" to your library`,
  )
  return ended
}
