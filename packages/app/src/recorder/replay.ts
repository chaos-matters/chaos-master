import { deepClone } from '@/utils/clone'
import { withRecordingSuppressed } from './recorder'
import type { RecordedSession } from './schema'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

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
  execute: (id: string, args: unknown[]) => void
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
    target.loadInitial(deepClone(session.initial))
    for (const action of session.actions) {
      target.execute(action.id, deepClone(action.args))
    }
  })
}
