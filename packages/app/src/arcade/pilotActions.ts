import { clearNarration } from './narration'
import { appendPilotLog, drivingState, endPilot, notePilotSaveResult, } from './pilot'
import { isTopicId, LESSON_TOPICS } from './topics'
import type { PilotDriving, PilotEnded, PilotEndReason } from './pilot'
import type { CommandContext } from '@/commands/types'

function topicTitle(state: PilotDriving): string | undefined {
  return isTopicId(state.topic) ? LESSON_TOPICS[state.topic].title : undefined
}

export function defaultPilotTitle(state: PilotDriving): string {
  return state.mode === 'cinema' ? 'Animation' : (topicTitle(state) ?? 'Lesson')
}

export function sessionNameFor(
  state: PilotDriving,
  title: string,
  reason: PilotEndReason,
): string {
  const kind = state.mode === 'cinema' ? 'Animation' : 'Lesson'
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
