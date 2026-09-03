import { createSignal } from 'solid-js'
import { deepClone } from '@/utils/clone'
import { NARRATION_COMMAND_ID } from './narrationMode'
import { getLiveWorkspaceMutationGeneration, isSessionRecording, withRecordingSuppressed, } from './recorder'
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

/**
 * Shortest wait between two steps, however fast they were recorded.
 *
 * A person cannot issue two commands three milliseconds apart; an agent does
 * nothing else. A real lesson put `flame.addTransform` and four
 * `setVariationParams` calls inside 26 ms, and replayed at that speed there is
 * nothing to see: the follow-cam needs LAYOUT_SETTLE_MS (400) just to measure
 * its target, and the browser paints at most once across the whole burst.
 *
 * Applied to the RECORDED gap, before playback speed divides it. The floor
 * repairs the recording; speed is then the viewer's business as usual. Putting
 * it after the division instead would pin every step of an agent take to the
 * floor at every speed — the 4x button would do nothing on exactly the takes
 * that need it, because every one of their gaps is under the floor.
 */
export const MIN_STEP_GAP_MS = 500

/** 240 words per minute, the usual figure for reading prose on screen. */
export const NARRATION_MS_PER_WORD = 250

/** Even three words deserve to be seen. */
export const NARRATION_MIN_HOLD_MS = 1200

/**
 * ...and even a paragraph does not get to stop the show. Full reading time for
 * the sentences an agent writes is 8-12 s each; six of those would spend most
 * of MAX_REPLAY_VIDEO_DURATION_MS on held text. The transport is right there
 * for a viewer who wants longer.
 */
export const NARRATION_MAX_HOLD_MS = 4000

/**
 * The sentence this step says out loud, in either recording mode.
 *
 * With `narrationAsStep` on, a sentence is its own `lesson.note` step. With it
 * off the recorder attaches it to the step it introduces as a `note`, and a
 * human author can type one there too. Both are prose somebody is meant to
 * read, so both are paced the same way.
 */
function narrationText(action: RecordedAction): string | undefined {
  if (action.id === NARRATION_COMMAND_ID) {
    const [text] = action.args
    if (typeof text === 'string' && text.trim() !== '') return text
  }
  const note = action.note
  return note !== undefined && note.trim() !== '' ? note : undefined
}

/**
 * The reading hold this step earns, or undefined when it says nothing.
 *
 * Exported for the tail of a video: the closing sentence has no step after it
 * to be the dwell on, so without this a take ends on the words the whole
 * lesson was building to for however long the default tail happens to be.
 */
export function narrationHoldFor(
  action: RecordedAction,
  speed: number,
): number | undefined {
  const text = narrationText(action)
  return text === undefined ? undefined : narrationHoldMs(text) / speed
}

function narrationHoldMs(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.min(
    NARRATION_MAX_HOLD_MS,
    Math.max(NARRATION_MIN_HOLD_MS, words * NARRATION_MS_PER_WORD),
  )
}

/**
 * How long to wait before applying `next` — which is the dwell on `previous`.
 *
 * That inversion is the whole subtlety here, and getting it wrong is what made
 * agent lessons unwatchable: a recorded gap is time the viewer spends looking
 * at the step BEFORE it. An agent thinks for fifteen seconds, writes a
 * sentence, then edits in a burst, so the pause was being spent holding the
 * previous burst's last edit while the sentence it produced was replaced a
 * millisecond later. Six narration steps in one real lesson shared 10.3 ms of
 * screen time between them.
 *
 * The rules, in order:
 *
 *  - An authored `holdMs` on the previous step wins and is not clamped in
 *    either direction. Pacing is authorial; `holdMs: 0` means zero.
 *  - A previous step that says something is held long enough to read.
 *  - Otherwise the measured gap, clamped at both ends: MAX so a thinking pause
 *    does not stall playback, MIN so a machine's burst is watchable.
 *
 * The floor is skipped where it would do harm: before the first step, whose
 * gap is a lead-in rather than a dwell on anything, and between two actions
 * sharing a timestamp, which is how a companion pair says it is one gesture
 * and not two. A narration hold and an authored hold both ignore the ceiling —
 * a sentence nobody can finish reading is the bug being fixed.
 *
 * Shared with `createReplayVideoSchedule` so a live replay and an exported
 * video cannot drift — `replayInterfaceVideo` validates its encoder budget
 * from the schedule and then screen-records the live player, so a difference
 * between the two overruns the capture.
 */
export function stepGapMs(
  previous: RecordedAction | undefined,
  next: RecordedAction | undefined,
  speed: number,
): number {
  if (!next) return 0
  if (previous?.holdMs !== undefined) return previous.holdMs / speed
  const sentence = previous === undefined ? undefined : narrationText(previous)
  if (sentence !== undefined) return narrationHoldMs(sentence) / speed
  const measured = Math.max(0, previous ? next.t - previous.t : next.t)
  const paced =
    previous !== undefined && previous.t !== next.t
      ? Math.max(MIN_STEP_GAP_MS, measured)
      : measured
  return Math.min(MAX_STEP_GAP_MS, paced / speed)
}

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
  readonly isFinished: () => boolean
  /** Human-readable reason the last action was rejected, if any. */
  readonly lastError: () => string | undefined
  readonly total: number
}

export type SessionPlayerOptions = {
  /**
   * Read when the wait for each step is scheduled, so the panel can change it
   * mid-run. The already-pending wait keeps the old speed, so a change lands
   * on the step after it — at most one gap late, which MAX_STEP_GAP_MS bounds.
   */
  speed?: () => number
  /** Reveal/prepare the UI immediately before the matching command runs. */
  beforeAction?: (action: RecordedAction) => void
  onFinished?: () => void
  onError?: (message: string) => void
}

export function createSessionPlayer(
  session: RecordedSession,
  target: ReplayTarget,
  options: SessionPlayerOptions = {},
): SessionPlayer {
  const actions = session.actions
  const [stepIndex, setStepIndex] = createSignal(-1)
  const [isPlaying, setIsPlaying] = createSignal(false)
  const [isFinished, setIsFinished] = createSignal(false)
  const [lastError, setLastError] = createSignal<string>()
  const [actionPublished, setActionPublished] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let batchOpen = false
  /** Mutation stamp at the last player-controlled settled prefix. While a
   *  timed batch is open, history ownership handles takeover synchronously;
   *  after Pause/seek/stop, this detects edits made with no owner to notify. */
  let settledMutationGeneration = getLiveWorkspaceMutationGeneration()
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

  const withBatchWrite = <R>(fn: () => R): R => {
    if (target.withBatchWrite) return target.withBatchWrite(fn)
    return fn()
  }

  const withDeferredEffects = <R>(fn: () => R): R => {
    if (target.withDeferredEffects) return target.withDeferredEffects(fn)
    return fn()
  }

  /**
   * A user edit owns the document from this point onward. Stop the timer and
   * commit the replay prefix synchronously, before history evaluates that
   * edit. This is intentionally separate from `pause()` because ownership can
   * be relinquished from inside history while the player is between steps.
   */
  function takeOverByUser(
    preservePublishedAction = false,
    preserveBaseline = false,
  ) {
    setIsPlaying(false)
    setIsFinished(false)
    if (!preservePublishedAction) setActionPublished(false)
    // A live edit forks away from the known recorded prefix. The next Play
    // must rebuild from `session.initial`; otherwise it would apply the
    // remaining recorded actions on top of the user's divergent document.
    // An intentional Pause is different: no external mutation occurred, so
    // Resume may continue from the already-known prefix without flicker.
    if (!preserveBaseline) baselineLoaded = false
    clearTimer()
    closeBatch()
  }

  function openBatch() {
    if (batchOpen) return
    withRecordingSuppressed(() => target.prepare?.())
    target.beginBatch?.(takeOverByUser)
    batchOpen = true
  }

  function closeBatch() {
    if (!batchOpen) return
    batchOpen = false
    target.endBatch?.()
    settledMutationGeneration = getLiveWorkspaceMutationGeneration()
  }

  function invalidateEditedBaseline(): void {
    if (
      baselineLoaded &&
      getLiveWorkspaceMutationGeneration() !== settledMutationGeneration
    ) {
      baselineLoaded = false
    }
  }

  function rejectAction(index: number, error?: unknown): false {
    const detail = error instanceof Error ? `: ${error.message}` : ''
    const message = `Step ${index + 1} could not be replayed${detail}`
    console.warn(`[recorder] ${message}`, error)
    setLastError(message)
    setIsPlaying(false)
    setIsFinished(false)
    clearTimer()
    closeBatch()
    options.onError?.(message)
    return false
  }

  function rejectBeforeStart(index: number, reason: string): false {
    const step = index >= 0 ? `Step ${index + 1}: ` : ''
    const message = `${step}${reason}`
    setLastError(message)
    setIsPlaying(false)
    setIsFinished(false)
    clearTimer()
    closeBatch()
    options.onError?.(message)
    return false
  }

  function preflight(): boolean {
    if (isSessionRecording()) {
      return rejectBeforeStart(
        -1,
        'Stop the active recording before starting a replay',
      )
    }
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index]!
      const reason = target.preflight?.(action.id, action.args)
      if (reason !== undefined) return rejectBeforeStart(index, reason)
    }
    return true
  }

  type ActionExecution = { ok: true } | { ok: false; error: unknown }

  /** Execute without publishing transport state. Replay stays unrecorded. */
  function executeAction(
    action: RecordedAction,
    prepareUi: boolean,
  ): ActionExecution {
    if (isSessionRecording()) {
      return {
        ok: false,
        error: new Error('Stop the active recording before continuing replay'),
      }
    }
    try {
      const accepted = withRecordingSuppressed(() =>
        withBatchWrite(() => {
          if (prepareUi) options.beforeAction?.(action)
          return target.execute(action.id, deepClone(action.args)) !== false
        }),
      )
      return accepted ? { ok: true } : { ok: false, error: undefined }
    } catch (error) {
      return { ok: false, error }
    }
  }

  /** Apply one visible action, including follow-cam preparation/publication. */
  function applyAction(index: number): boolean {
    const action = actions[index]
    if (!action) return false
    const result = executeAction(action, true)
    if (!result.ok) return rejectAction(index, result.error)
    setStepIndex(index)
    setActionPublished(true)
    return true
  }

  function rebuildToNow(index: number): boolean {
    try {
      withRecordingSuppressed(() => {
        withBatchWrite(() => {
          loadSessionStart(session, target)
        })
      })
    } catch (error) {
      return rejectAction(Math.max(0, index), error)
    }
    baselineLoaded = true
    setStepIndex(-1)
    setActionPublished(false)

    // Rebuild the historical prefix silently. Preparing and publishing every
    // intermediate action made a seek through N steps scroll/focus the UI N
    // times and re-render the transport N times, even though only the state at
    // the destination is visible. If a prefix action fails, publish the last
    // state that did apply before reporting the exact attempted step.
    for (let i = 0; i < index; i++) {
      const action = actions[i]
      if (!action) return false
      const result = executeAction(action, false)
      if (!result.ok) {
        setStepIndex(i - 1)
        return rejectAction(i, result.error)
      }
    }

    // The terminal action is the only seek step the viewer sees, so it alone
    // receives follow-cam preparation and becomes the published current step.
    if (index < 0) return true
    const action = actions[index]
    if (!action) return false
    const result = executeAction(action, true)
    if (!result.ok) {
      setStepIndex(index - 1)
      return rejectAction(index, result.error)
    }
    setStepIndex(index)
    setActionPublished(true)
    return true
  }

  /** Rebuilds are synchronous state reconstruction, not visible playback.
   *  Defer target-owned resources until the destination state is known. */
  function rebuildTo(index: number): boolean {
    return withDeferredEffects(() => rebuildToNow(index))
  }

  /** How long to wait before applying `index`. See {@link stepGapMs}. */
  function gapBefore(index: number): number {
    return stepGapMs(
      index > 0 ? actions[index - 1] : undefined,
      actions[index],
      speed(),
    )
  }

  function scheduleNext() {
    const next = stepIndex() + 1
    if (next >= actions.length) {
      setIsPlaying(false)
      setIsFinished(true)
      closeBatch()
      options.onFinished?.()
      return
    }
    timer = setTimeout(() => {
      if (!isPlaying()) return
      if (!applyAction(next)) return
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
      setIsFinished(false)
      setLastError(undefined)
      if (!preflight()) return
      invalidateEditedBaseline()
      // Load the flame the session was recorded against before the first step
      // (otherwise the steps land on the viewer's own document), and start
      // over when Play is pressed on the last step — so the button always does
      // something rather than sitting dead at the end.
      if (!baselineLoaded || stepIndex() >= actions.length - 1) {
        openBatch()
        if (!rebuildTo(-1)) return
      }
      openBatch()
      // This is still inside the Play click. Prime browser-gated resources
      // now; the first timed action runs in a later task after transient user
      // activation has expired on strict autoplay engines.
      target.primeEffects?.(session)
      setIsPlaying(true)
      scheduleNext()
    },
    pause() {
      if (!isPlaying()) return
      // Commit what has been applied: undo becomes available again, and the
      // user can edit on from here (the "fork from step N" case).
      takeOverByUser(true, true)
    },
    seek(index) {
      clearTimer()
      setIsFinished(false)
      setLastError(undefined)
      if (!preflight()) return
      invalidateEditedBaseline()
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
        for (let i = stepIndex() + 1; i <= clamped; i++) {
          if (!applyAction(i)) return
        }
      } else {
        // Backwards, or re-seeking the step we are on — which is how the user
        // discards their own edits and gets the recorded state back.
        if (!rebuildTo(clamped)) return
      }
      target.primeEffects?.(session)
      if (isPlaying()) {
        scheduleNext()
      } else {
        closeBatch()
      }
    },
    stop() {
      setIsPlaying(false)
      setIsFinished(false)
      clearTimer()
      closeBatch()
    },
    stepIndex,
    currentAction: () => (actionPublished() ? actions[stepIndex()] : undefined),
    isPlaying,
    isFinished,
    lastError,
    total: actions.length,
  }
}
