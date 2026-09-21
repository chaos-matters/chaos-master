import { canonicalFlame, diffPaths } from './canonical'
import { planCreation } from './planCreation'
import { replaySessionHeadless } from './replaySandbox'
import type { RecordedSession } from '../schema'
import type { SynthesisOptions } from './planCreation'

/**
 * What planning one flame actually achieved — plan, replay, compare.
 *
 * Deliberately free of `fs`: a vitest corpus run and the `synthesize-steps`
 * CLI read files very differently, but they must judge a plan the same way, so
 * the judging lives here and the reading stays with each caller.
 */
export type PlanReport = {
  /** The replayed session ended on exactly the target flame. */
  readonly ok: boolean
  /** True when the plan needed its closing `flame.load` to get there. */
  readonly snapped: boolean
  /** Steps in the session, snap included. */
  readonly steps: number
  /** Descriptor paths the steps alone did not reach. */
  readonly residual: readonly string[]
  /**
   * Paths still wrong after the whole session was replayed. Non-empty means
   * the snap itself failed, which is a bug rather than a coverage gap.
   */
  readonly mismatched: readonly string[]
  readonly session?: RecordedSession
  readonly error?: string
}

export function reportPlan(
  target: unknown,
  options: SynthesisOptions = {},
): PlanReport {
  const expected = canonicalFlame(target)
  if (expected === undefined) {
    return {
      ok: false,
      snapped: false,
      steps: 0,
      residual: [],
      mismatched: [],
      error: 'not a valid flame descriptor',
    }
  }
  const session = planCreation(target, options)
  if (session === undefined) {
    return {
      ok: false,
      snapped: false,
      steps: 0,
      residual: [],
      mismatched: [],
      error: 'the planned session did not validate',
    }
  }
  const replayed = replaySessionHeadless(session)
  if (replayed === undefined) {
    return {
      ok: false,
      snapped: session.synthetic?.snapped ?? false,
      steps: session.actions.length,
      residual: session.synthetic?.residual ?? [],
      mismatched: [],
      session,
      error: 'replay refused the planned session',
    }
  }
  const mismatched = diffPaths(canonicalFlame(replayed), expected)
  return {
    ok: mismatched.length === 0,
    snapped: session.synthetic?.snapped ?? false,
    steps: session.actions.length,
    residual: session.synthetic?.residual ?? [],
    mismatched,
    session,
  }
}
