import { createSignal } from 'solid-js'
import { latestSchemaVersion } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { currentUndoSeq } from '@/utils/undoJournal'
import { VERSION } from '@/version'
import { setDocumentWriteReporter } from './documentWriteHook'
import { focusHintFor } from './focus'
import { SESSION_FORMAT_VERSION } from './schema'
import type { RecordedAction, RecordedSession } from './schema'
import type { FlameCommand } from '@/commands/types'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
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
  initialTimeline?: TimelineSnapshot
  initialAudio?: AudioWiringSnapshot
  actions: RecordedAction[]
  unnamedWrites: { t: number; description?: string }[]
}

/**
 * The editing state around the flame that a recording also starts from.
 *
 * The flame is the document, but it is not the whole world: keyframe edits
 * mean nothing without the tracks they land on, and an audio mapping drives
 * the flame every frame. Both are snapshotted so a replay edits the animation
 * it was recorded against rather than whatever the viewer happens to have
 * open. Optional because sandboxes (tests, the Home portal) have neither.
 */
export type SessionStartExtras = {
  timeline?: TimelineSnapshot
  audio?: AudioWiringSnapshot
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
/**
 * Actions of the current gesture that a repeat can fold into, by
 * `${id} ${key}`. Cleared whenever a history entry lands, so folding can
 * never cross an undo step.
 *
 * Keyed rather than a single "last action" because a gesture can drive more
 * than one target in turn: the camera's zoom-about-a-point writes
 * `camera.zoom` and `camera.position` alternately, and matching only the
 * immediately preceding action meant nothing ever folded — one scroll-zoom
 * logged dozens of steps despite being a single undo step.
 */
let coalesceAnchors = new Map<string, number>()

/** A command's own hint wins over the central table — it knows things the id
 *  and args do not. */
function focusFor(
  cmd: Pick<FlameCommand, 'id' | 'focus'>,
  args: unknown[],
): string | undefined {
  return cmd.focus?.(args) ?? focusHintFor(cmd.id, args)
}

function resetGestureState() {
  gestureClaimed = false
  coalesceAnchors = new Map()
}

const [isSessionRecording, setIsSessionRecording] = createSignal(false)
const [recordedActionCount, setRecordedActionCount] = createSignal(0)
const [unnamedWriteCount, setUnnamedWriteCount] = createSignal(0)
const [lastSession, setLastSession] = createSignal<RecordedSession>()

export { isSessionRecording, recordedActionCount, unnamedWriteCount }

function elapsedMs(rec: ActiveRecording): number {
  return Math.max(0, globalThis.performance.now() - rec.startedAt)
}

/** Begin recording. Everything passed is cloned, never held — pass the full
 *  current document (NOT condensed: hidden transforms must survive into
 *  replay). */
export function startSessionRecording(
  initial: FlameDescriptor,
  extras: SessionStartExtras = {},
): void {
  if (active) {
    console.warn('[recorder] A session recording is already active.')
    return
  }
  active = {
    startedAt: globalThis.performance.now(),
    createdAt: new Date().toISOString(),
    baselineSeq: currentUndoSeq(),
    initial: deepClone(initial),
    initialTimeline:
      extras.timeline === undefined ? undefined : deepClone(extras.timeline),
    initialAudio:
      extras.audio === undefined ? undefined : deepClone(extras.audio),
    actions: [],
    unnamedWrites: [],
  }
  resetGestureState()
  setRecordedActionCount(0)
  setUnnamedWriteCount(0)
  // A finished session describes the flame it was recorded against; once a
  // new recording starts it must not be embedded into anything.
  setLastSession(undefined)
  setIsSessionRecording(true)
}

/**
 * The most recently finished recording, kept so an export can embed the steps
 * that produced the image (M5). Cleared when a new recording starts, so a PNG
 * never carries a session that describes a different flame.
 */
export function lastFinishedSession(): RecordedSession | undefined {
  return lastSession()
}

export function stopSessionRecording(): RecordedSession | undefined {
  if (!active) return undefined
  const session: RecordedSession = {
    version: SESSION_FORMAT_VERSION,
    app: { version: VERSION, flameSchemaVersion: latestSchemaVersion },
    createdAt: active.createdAt,
    initial: active.initial,
    initialTimeline: active.initialTimeline,
    initialAudio: active.initialAudio,
    actions: active.actions,
    unnamedWriteCount: active.unnamedWrites.length,
  }
  active = undefined
  setIsSessionRecording(false)
  setLastSession(session)
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
  cmd: Pick<
    FlameCommand,
    'id' | 'label' | 'coalesceKey' | 'describe' | 'focus'
  >,
  args: readonly unknown[],
  run: () => void,
): void {
  const rec = active
  if (rec && commandDepth === 0 && suppressDepth === 0) {
    // Any command during a gesture accounts for the entry that gesture will
    // push, so the commit is not reported as an anonymous write.
    gestureClaimed = true
    const key = cmd.coalesceKey?.([...args])
    const anchorKey = key === undefined ? undefined : `${cmd.id} ${key}`
    const anchorIndex =
      anchorKey === undefined ? undefined : coalesceAnchors.get(anchorKey)
    if (anchorIndex !== undefined) {
      const anchor = { index: anchorIndex }
      // A drag re-sets the same target dozens of times inside ONE undo step;
      // the log keeps the last value and the timestamp the gesture began.
      const existing = rec.actions[anchor.index]
      if (existing) {
        existing.args = deepClone([...args])
        existing.focus = focusFor(cmd, [...args])
        // The label has to move with the args. Describing commands render
        // the value into their label ("Set gamma to 2.42"), so keeping the
        // first one left the step list quoting a value the action no longer
        // carried — visible in real recordings as a label that disagreed
        // with its own args.
        existing.label = cmd.describe?.([...args]) ?? cmd.label
      }
      pendingActionIndex = anchor.index
    } else {
      rec.actions.push({
        t: elapsedMs(rec),
        id: cmd.id,
        args: deepClone([...args]),
        label: cmd.describe?.([...args]) ?? cmd.label,
        focus: focusFor(cmd, [...args]),
      })
      pendingActionIndex = rec.actions.length - 1
      if (anchorKey !== undefined) {
        coalesceAnchors.set(anchorKey, pendingActionIndex)
      }
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
 * "I already did this myself; log it as the command that reproduces it."
 *
 * For effects the workspace performs through a non-command path whose live
 * semantics must not change, but which a registered command CAN reproduce on
 * replay. The 2D↔3D switch is the case that motivated it: it stashes the
 * outgoing flame, restores the incoming one through `history.replace` (a
 * document boundary that clears undo), and swaps the timeline's tracks.
 * Routing all that through a command would make it undoable, which it
 * deliberately is not — but a `flame.load` carrying the restored descriptor
 * replays it exactly.
 *
 * Use sparingly, and only where the recorded command genuinely reproduces the
 * effect: this bypasses the "the log matches what ran" guarantee that
 * everything else here is built on.
 */
export function recordSyntheticAction(
  id: string,
  args: readonly unknown[],
  label?: string,
): void {
  const rec = active
  if (!rec || commandDepth > 0 || suppressDepth > 0) return
  // A synthetic action stands for a whole effect, so it ends any coalescing
  // run — the next edit of the same control is its own step.
  coalesceAnchors = new Map()
  gestureClaimed = true
  rec.actions.push({
    t: elapsedMs(rec),
    id,
    args: deepClone([...args]),
    label,
    focus: focusHintFor(id, [...args]),
  })
  setRecordedActionCount(rec.actions.length)
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
  coalesceAnchors = new Map()
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
  coalesceAnchors = new Map()
  gestureClaimed = false
  if (!rec || claimed || suppressDepth > 0) return
  noteUnnamedWrite(rec, description)
}

/**
 * The same hook for the SECOND document — the timeline's own undo stack (see
 * documentWriteHook.ts for why it arrives indirectly).
 *
 * Split from {@link reportDocumentWrite} for one reason: it must not clear the
 * flame's coalescing anchors while a flame command is running. With
 * auto-keyframe on, dragging a slider writes a keyframe too, and the timeline
 * pushes its undo entry immediately rather than at gesture commit — so a
 * shared reset would end the flame's coalescing run mid-drag and log the
 * gesture as two steps against one undo entry, breaking the invariant the
 * whole recorder is built on.
 */
export function reportTimelineWrite(description?: string): void {
  const rec = active
  if (commandDepth > 0) return
  // Outside a command this IS a boundary: an uncovered timeline edit ends any
  // run, exactly as a flame entry does.
  coalesceAnchors = new Map()
  gestureClaimed = false
  if (!rec || suppressDepth > 0) return
  noteUnnamedWrite(rec, description)
}

function noteUnnamedWrite(
  rec: ActiveRecording,
  description: string | undefined,
): void {
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

// The timeline reaches the recorder through this leaf rather than importing
// it: a direct import closes a cycle through the flame schema (see
// documentWriteHook.ts). Installed on load, which is early enough — nothing
// can be recorded before the recorder module exists.
setDocumentWriteReporter(reportTimelineWrite)

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
