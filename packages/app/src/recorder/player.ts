import { createSignal } from 'solid-js'
import { deepClone } from '@/utils/clone'
import { withRecordingSuppressed } from './recorder'
import { loadSessionStart } from './replay'
import type { ReplayTarget } from './replay'
import type { RecordedAction, RecordedSession } from './schema'

/**
 * Timed playback of a recorded session (semantic-recorder-plan, M4).
 *
 * Transport controls rather than a bare `run()`, for the same reasons the
 * Home portal needs them: the viewer scrubs, pauses, and takes over. The
 * shape follows `portalScript.ts`'s `PortalScriptRun`, which already proved
 * this model against the real command registry.
 *
 * Two rules the rest of the design hangs off:
 *
 *  - **Backwards is a rebuild, not an undo.** Actions are writes, not
 *    reversible edits, so landing on "the state after step N" means replaying
 *    `initial` plus the first N+1 actions. Same conclusion `portalScript`'s
 *    `seek` reached.
 *  - **A run is one undo step.** Every applied batch is bracketed by the
 *    target's `beginBatch`/`endBatch`, which the workspace maps to the
 *    history's `startPreview`/`commit`. Otherwise replaying a 200-step
 *    session would bury the user's own history under 200 entries, and
 *    "watch it, then carry on from here" — the point of the feature — would
 *    be unusable.
 */

/** Longest wait between two steps, however long the human paused for. */
export const MAX_STEP_GAP_MS = 1200

/** Playback speeds the panel offers. 1 = the pace it was recorded at. */
export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const

export type SessionPlayer = {
  readonly play: () => void
  readonly pause: () => void
  /** Rebuild the document as of `index` (-1 = the initial flame). */
  readonly seek: (index: number) => void
  /** Stop and close the open batch; the document stays where it is. */
  readonly stop: () => void
  /** Index of the last applied action; -1 = only the initial flame. */
  readonly stepIndex: () => number
  /** The action just applied, or undefined at the initial flame. What the
   *  follow-cam reads to know where to point and what to caption. */
  readonly currentAction: () => RecordedAction | undefined
  readonly isPlaying: () => boolean
  readonly total: number
}

export type SessionPlayerOptions = {
  /**
   * Read when the wait for each step is scheduled, so the panel can change it
   * mid-run. The already-pending wait keeps the old speed, so a change lands
   * on the step after it — at most one gap late, which MAX_STEP_GAP_MS bounds.
   */
  speed?: () => number
  onFinished?: () => void
}

export function createSessionPlayer(
  session: RecordedSession,
  target: ReplayTarget,
  options: SessionPlayerOptions = {},
): SessionPlayer {
  const actions = session.actions
  const [stepIndex, setStepIndex] = createSignal(-1)
  const [isPlaying, setIsPlaying] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let batchOpen = false
  /**
   * Has `session.initial` been loaded into the target yet? Until it has, the
   * document is whatever the viewer was editing, and applying actions to that
   * replays the session against the wrong flame. Every path that moves
   * forwards checks this first.
   */
  let baselineLoaded = false

  const speed = () => {
    const value = options.speed?.() ?? 1
    return value > 0 ? value : 1
  }

  function openBatch() {
    if (batchOpen) return
    target.beginBatch?.()
    batchOpen = true
  }

  function closeBatch() {
    if (!batchOpen) return
    batchOpen = false
    target.endBatch?.()
  }

  /** Apply one action. Suppressed so an active recording never absorbs it. */
  function applyAction(index: number) {
    const action = actions[index]
    if (!action) return
    withRecordingSuppressed(() => {
      target.execute(action.id, deepClone(action.args))
    })
    setStepIndex(index)
  }

  function rebuildTo(index: number) {
    withRecordingSuppressed(() => {
      loadSessionStart(session, target)
    })
    baselineLoaded = true
    setStepIndex(-1)
    for (let i = 0; i <= index; i++) {
      applyAction(i)
    }
  }

  /**
   * How long to wait before applying `index`.
   *
   * An authored `holdMs` on the PREVIOUS step wins: pacing belongs to the step
   * an author wants held, not to the one that follows it, and an authored hold
   * is a deliberate choice so it is not clamped by MAX_STEP_GAP_MS. Otherwise
   * it is the gap the recording measured, clamped so a long thinking pause
   * does not stall playback.
   */
  function gapBefore(index: number): number {
    const next = actions[index]
    if (!next) return 0
    const previous = index > 0 ? actions[index - 1] : undefined
    if (previous?.holdMs !== undefined) return previous.holdMs / speed()
    const delta = previous ? next.t - previous.t : next.t
    return Math.min(MAX_STEP_GAP_MS, Math.max(0, delta) / speed())
  }

  function scheduleNext() {
    const next = stepIndex() + 1
    if (next >= actions.length) {
      setIsPlaying(false)
      closeBatch()
      options.onFinished?.()
      return
    }
    timer = setTimeout(() => {
      if (!isPlaying()) return
      applyAction(next)
      scheduleNext()
    }, gapBefore(next))
  }

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  return {
    play() {
      if (isPlaying() || actions.length === 0) return
      // Load the flame the session was recorded against before the first step
      // (otherwise the steps land on the viewer's own document), and start
      // over when Play is pressed on the last step — so the button always does
      // something rather than sitting dead at the end.
      if (!baselineLoaded || stepIndex() >= actions.length - 1) {
        openBatch()
        rebuildTo(-1)
      }
      openBatch()
      setIsPlaying(true)
      scheduleNext()
    },
    pause() {
      if (!isPlaying()) return
      setIsPlaying(false)
      clearTimer()
      // Commit what has been applied: undo becomes available again, and the
      // user can edit on from here (the "fork from step N" case).
      closeBatch()
    },
    seek(index) {
      clearTimer()
      const clamped = Math.min(
        actions.length - 1,
        Math.max(-1, Math.floor(index)),
      )
      openBatch()
      if (baselineLoaded && clamped > stepIndex()) {
        // Forwards is already the state we are in plus the missing actions.
        // Rebuilding from `initial` here would make stepping through a
        // 200-step session quadratic — and visibly flicker, since each step
        // would reload the initial flame before replaying up to it.
        for (let i = stepIndex() + 1; i <= clamped; i++) applyAction(i)
      } else {
        // Backwards, or re-seeking the step we are on — which is how the user
        // discards their own edits and gets the recorded state back.
        rebuildTo(clamped)
      }
      if (isPlaying()) {
        scheduleNext()
      } else {
        closeBatch()
      }
    },
    stop() {
      setIsPlaying(false)
      clearTimer()
      closeBatch()
    },
    stepIndex,
    currentAction: () => actions[stepIndex()],
    isPlaying,
    total: actions.length,
  }
}
