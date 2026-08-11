import { deepClone } from '@/utils/clone'
import { withRecordingSuppressed } from './recorder'
import type { RecordedSession } from './schema'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'

/**
 * Where a session is replayed INTO. Deliberately not a `CommandContext`:
 * the caller decides what "load the initial document" and "run a command"
 * mean for its world —
 *
 *  - the live workspace loads via `history.replace` and executes against its
 *    own `cmdContext`,
 *  - a sandbox (tests, gallery previews — the portalScript.ts recipe) loads
 *    into its private store and executes against its private context.
 *
 * The timed step-by-step player (milestone M4) builds on this same target.
 */
export type ReplayTarget = {
  loadInitial: (flame: FlameDescriptor) => void
  /**
   * Restore the two documents that are not the flame: the timeline's tracks
   * and config, and the audio wiring. Both are optional on the session (older
   * recordings predate them) and optional here (a sandbox may have neither) —
   * and when a session carries none, the target is NOT called, so replaying an
   * old recording leaves the viewer's timeline alone rather than clearing it.
   */
  loadTimeline?: (timeline: TimelineSnapshot) => void
  loadAudio?: (audio: AudioWiringSnapshot) => void
  execute: (id: string, args: unknown[]) => void
  /**
   * Bracket a run of applied actions so the whole thing lands as ONE undoable
   * step. The workspace maps these to the history's `startPreview`/`commit`;
   * a sandbox with no history can leave them unset. Without it, replaying a
   * long session buries the user's own undo stack under one entry per step.
   */
  beginBatch?: () => void
  endBatch?: () => void
}

/**
 * Apply a whole session instantly: initial document, then every action in
 * order, with no waiting. Suppressed from the recorder — replaying while
 * recording must not absorb the replayed actions into the new log.
 *
 * Replay fidelity is bounded by the session's `unnamedWriteCount`: a log
 * recorded with unnamed writes cannot reproduce them (they were never
 * captured), which is exactly what that count is for.
 */
export function replaySessionInstant(
  session: RecordedSession,
  target: ReplayTarget,
): void {
  withRecordingSuppressed(() => {
    loadSessionStart(session, target)
    for (const action of session.actions) {
      target.execute(action.id, deepClone(action.args))
    }
  })
}

/** Put the target into the state the session was recorded from: flame, then
 *  the timeline and audio wiring the session carries (if any). Shared with the
 *  step-by-step player, whose every rebuild starts the same way. */
export function loadSessionStart(
  session: RecordedSession,
  target: ReplayTarget,
): void {
  target.loadInitial(deepClone(session.initial))
  if (session.initialTimeline && target.loadTimeline) {
    target.loadTimeline(deepClone(session.initialTimeline))
  }
  if (session.initialAudio && target.loadAudio) {
    target.loadAudio(deepClone(session.initialAudio))
  }
}
