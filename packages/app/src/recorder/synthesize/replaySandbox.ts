import { replaySessionInstant } from '../replay'
import { createFlameSandbox } from './sandbox'
import type { RecordedSession } from '../schema'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Play a whole session with no app around it and hand back the flame it made.
 *
 * This is the app's real replay entry point — `replaySessionInstant`, the same
 * function the Replay panel and the video exporter go through — pointed at a
 * private document. It is what turns "the planner believes these steps rebuild
 * the flame" into something a test and the corpus runner can check: plan,
 * replay, compare.
 *
 * Undefined when replay refuses the session, which is itself the answer: a
 * session that cannot be replayed here cannot be replayed in the app either.
 */
export function replaySessionHeadless(
  session: RecordedSession,
): FlameDescriptor | undefined {
  const sandbox = createFlameSandbox(session.initial)
  const ok = replaySessionInstant(session, {
    loadInitial: (flame) => {
      sandbox.execute('flame.load', [flame])
    },
    execute: (id, args) => sandbox.execute(id, args),
  })
  return ok ? sandbox.flame() : undefined
}
