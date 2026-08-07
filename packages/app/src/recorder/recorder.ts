import { createSignal } from 'solid-js'
import { latestSchemaVersion } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { currentUndoSeq } from '@/utils/undoJournal'
import { VERSION } from '@/version'
import { SESSION_FORMAT_VERSION } from './schema'
import type { RecordedAction, RecordedSession } from './schema'
import type { FlameCommand } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { UndoTarget } from '@/utils/undoRouting'

/**
 * The session recorder: turns an editing session into a `.steps.json` log of
 * registered-command invocations (see schema.ts for why intents, not patches).
 *
 * Module-global like the command registry itself, and hooked into exactly two
 * seams:
 *
 *  - `executeCommand` calls {@link recordCommandExecution}, so everything that
 *    is command-routed is recorded for free. Only TOP-LEVEL commands land in
 *    the log — a command that runs other commands replays them itself.
 *  - The main flame history calls {@link reportDocumentWrite} whenever an
 *    entry lands on its undo stack (via `createStoreHistory`'s
 *    `onEntryPushed`). A push that happens OUTSIDE any command scope is a
 *    mutation the recorder cannot replay — it is counted as an "unnamed
 *    write" rather than silently dropped. Driving that count to zero is the
 *    coverage ratchet of docs/plans/semantic-recorder-plan.md; until then the
 *    count is the log's honesty marker.
 *
 * `history.setSilently` writers (animation export frames, follower effects)
 * never push history entries, so they stay invisible here by construction —
 * which is correct: they are not user intent.
 *
 * Replay and other machinery that executes commands without a user behind
 * them must wrap itself in {@link withRecordingSuppressed} so an active
 * recording does not absorb it.
 */

type ActiveRecording = {
  startedAt: number
  createdAt: string
  /** Undo-journal watermark at record start: entries with a greater seq were
   *  created during this session, and only those can an undo replay against. */
  baselineSeq: number
  initial: FlameDescriptor
  actions: RecordedAction[]
  unnamedWrites: { t: number; description?: string }[]
}

let active: ActiveRecording | undefined
let commandDepth = 0
let suppressDepth = 0
/** Index of the action logged for the top-level command currently running,
 *  so that command can retract it (see {@link reportUnreplayable}). */
let pendingActionIndex: number | undefined
/** A command has run since the current gesture opened, so the entry that
 *  gesture eventually pushes is accounted for by the log. */
let gestureClaimed = false
/** The action a repeat of the same command+target folds into. Cleared
 *  whenever a history entry lands, so folding can never cross an undo step. */
let coalesceAnchor: { index: number; id: string; key: string } | undefined

function resetGestureState() {
  gestureClaimed = false
  coalesceAnchor = undefined
}

const [isSessionRecording, setIsSessionRecording] = createSignal(false)
const [recordedActionCount, setRecordedActionCount] = createSignal(0)
const [unnamedWriteCount, setUnnamedWriteCount] = createSignal(0)

export { isSessionRecording, recordedActionCount, unnamedWriteCount }

function elapsedMs(rec: ActiveRecording): number {
  return Math.max(0, globalThis.performance.now() - rec.startedAt)
}

/** Begin recording. `initial` is cloned, never held — pass the full current
 *  document (NOT condensed: hidden transforms must survive into replay). */
export function startSessionRecording(initial: FlameDescriptor): void {
  if (active) {
    console.warn('[recorder] A session recording is already active.')
    return
  }
  active = {
    startedAt: globalThis.performance.now(),
    createdAt: new Date().toISOString(),
    baselineSeq: currentUndoSeq(),
    initial: deepClone(initial),
    actions: [],
    unnamedWrites: [],
  }
  resetGestureState()
  setRecordedActionCount(0)
  setUnnamedWriteCount(0)
  setIsSessionRecording(true)
}

export function stopSessionRecording(): RecordedSession | undefined {
  if (!active) return undefined
  const session: RecordedSession = {
    version: SESSION_FORMAT_VERSION,
    app: { version: VERSION, flameSchemaVersion: latestSchemaVersion },
    createdAt: active.createdAt,
    initial: active.initial,
    actions: active.actions,
    unnamedWriteCount: active.unnamedWrites.length,
  }
  active = undefined
  setIsSessionRecording(false)
  return session
}

export function cancelSessionRecording(): void {
  active = undefined
  setIsSessionRecording(false)
}

/**
 * The registry's wrapper around every command execution. Records the
 * invocation (top-level, unsuppressed, while a recording is active), then
 * runs it inside a command scope so history pushes it causes are attributed
 * to it instead of being flagged as unnamed writes.
 *
 * Args are cloned via the JSON-based `deepClone`, matching the convention
 * that command args are plain data — a non-serializable arg would break
 * replay anyway and is caught by schema validation on load.
 */
export function recordCommandExecution(
  cmd: Pick<FlameCommand, 'id' | 'label' | 'coalesceKey' | 'describe'>,
  args: readonly unknown[],
  run: () => void,
): void {
  const rec = active
  if (rec && commandDepth === 0 && suppressDepth === 0) {
    // Any command during a gesture accounts for the entry that gesture will
    // push, so the commit is not reported as an anonymous write.
    gestureClaimed = true
    const key = cmd.coalesceKey?.([...args])
    const anchor = coalesceAnchor
    const folded =
      key !== undefined && anchor?.id === cmd.id && anchor.key === key
    if (folded && anchor) {
      // A drag re-sets the same target dozens of times inside ONE undo step;
      // the log keeps the last value and the timestamp the gesture began.
      const existing = rec.actions[anchor.index]
      if (existing) existing.args = deepClone([...args])
      pendingActionIndex = anchor.index
    } else {
      rec.actions.push({
        t: elapsedMs(rec),
        id: cmd.id,
        args: deepClone([...args]),
        label: cmd.describe?.([...args]) ?? cmd.label,
      })
      pendingActionIndex = rec.actions.length - 1
      coalesceAnchor =
        key === undefined
          ? undefined
          : { index: pendingActionIndex, id: cmd.id, key }
      setRecordedActionCount(rec.actions.length)
    }
  }
  commandDepth++
  try {
    run()
  } finally {
    commandDepth--
    if (commandDepth === 0) pendingActionIndex = undefined
  }
}

/**
 * "What just happened cannot be replayed from this log."
 *
 * Retracts the action logged for the command currently running (if any) and
 * counts an unnamed write instead, so the honesty marker rises rather than the
 * log quietly claiming a fidelity it does not have. Two callers today:
 *
 *  - `history.undo`/`history.redo`, when the entry they would apply was not
 *    created during this recording (see {@link isUndoTargetWithinRecording}),
 *  - the workspace, when it mounts while a recording started against a
 *    different document is still active.
 */
export function reportUnreplayable(reason: string): void {
  const rec = active
  if (!rec || suppressDepth > 0) return
  if (pendingActionIndex !== undefined) {
    rec.actions.splice(pendingActionIndex, 1)
    pendingActionIndex = undefined
    setRecordedActionCount(rec.actions.length)
  }
  coalesceAnchor = undefined
  rec.unnamedWrites.push({ t: elapsedMs(rec), description: reason })
  setUnnamedWriteCount(rec.unnamedWrites.length)
  console.warn('[recorder] Unreplayable during recording:', reason)
}

/**
 * Can an undo/redo of `target` be reproduced by replaying this log?
 *
 * Only if it lands on a FLAME entry created after recording started. A
 * timeline entry is outside the recorded document entirely; an older flame
 * entry predates `initial` and, on replay, the undo would instead revert the
 * replayer's own load of `initial`. True when nothing is being recorded —
 * there is no log to keep faithful.
 */
export function isUndoTargetWithinRecording(
  target: UndoTarget | undefined,
): boolean {
  const rec = active
  if (!rec) return true
  if (target?.system !== 'flame') return false
  return target.seq !== null && target.seq > rec.baselineSeq
}

/**
 * Coverage hook: called by the main flame history for every entry that lands
 * on its stack. An entry is accounted for when it was pushed inside a command
 * (`commandDepth > 0`) or when it commits a gesture whose writes came from
 * commands ({@link gestureClaimed}) — the slider case, where the commit
 * itself happens in the Slider, outside any command. Anything else is a
 * mutation the log cannot replay: count it and say so.
 *
 * Either way the entry ends a coalescing run, so a second drag of the same
 * control becomes a second action — matching the second undo step it created.
 */
export function reportDocumentWrite(
  description?: string,
  fromPreview = false,
): void {
  const rec = active
  const claimed = commandDepth > 0 || (fromPreview && gestureClaimed)
  coalesceAnchor = undefined
  gestureClaimed = false
  if (!rec || claimed || suppressDepth > 0) return
  rec.unnamedWrites.push({ t: elapsedMs(rec), description })
  setUnnamedWriteCount(rec.unnamedWrites.length)
  console.warn(
    '[recorder] Unnamed write during recording — not replayable:',
    description ?? '(no description)',
  )
}

/** Gesture boundary from the flame history's `startPreview`. Opens a fresh
 *  coalescing window: a drag folds into one action, but the next drag of the
 *  same control starts its own. */
export function notePreviewStarted(): void {
  resetGestureState()
}

/** Run `fn` invisibly to any active recording: its commands are not logged
 *  and its document writes are not flagged. For replay, the Home portal, and
 *  any other machinery executing commands without a user behind them. */
export function withRecordingSuppressed<T>(fn: () => T): T {
  suppressDepth++
  try {
    return fn()
  } finally {
    suppressDepth--
  }
}
