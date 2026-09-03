import { createSignal } from 'solid-js'
import { agentDriving } from '@/arcade/pilot'
import { latestSchemaVersion } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { currentUndoSeq } from '@/utils/undoJournal'
import { VERSION } from '@/version'
import { setDocumentWriteReporter, setTimelineTransportReporter, } from './documentWriteHook'
import { focusHintFor } from './focus'
import { NARRATION_COMMAND_ID, narrationAsStep } from './narrationMode'
import { MAX_ACTION_TIMESTAMP_MS, MAX_SESSION_ACTIONS, MAX_SESSION_FILE_BYTES, MAX_SESSION_JSON_CHARS, serializeSession, SESSION_FORMAT_VERSION, validateRecordedAction, validateSession, } from './schema'
import type { RecordedAction, RecordedSession, SessionViewSnapshot, } from './schema'
import type { SonificationSnapshot } from './sonificationState'
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
  initialSonification?: SonificationSnapshot
  initialView?: SessionViewSnapshot
  actions: RecordedAction[]
  /** Compact encoded lengths let the hot recording path enforce the 8 MiB
   * session budget without serializing the initial flame after every click. */
  actionJsonChars: number[]
  actionJsonCharsTotal: number
  /** Compact size of this session with an empty action list and zero unnamed
   * writes. Action and counter deltas are added to this baseline. */
  baseJsonChars: number
  unnamedWrites: { t: number; description?: string }[]
  /** High-frequency effects report once per take instead of once per frame. */
  unreplayableKeys: Set<string>
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
  sonification?: SonificationSnapshot
  view?: SessionViewSnapshot
}

export type SessionRecordingStartFailureReason =
  | 'already-recording'
  | 'workspace-not-serializable'
  | 'workspace-not-recordable'

export type SessionRecordingStartResult =
  | { ok: true }
  | { ok: false; reason: SessionRecordingStartFailureReason }

let active: ActiveRecording | undefined
let commandDepth = 0
let suppressDepth = 0
/**
 * Monotonic stamp for live workspace mutations.
 *
 * A paused replay has committed its current prefix and therefore no longer
 * owns a history preview that can notify the player about user takeover. The
 * player samples this stamp when it settles; if a live command/raw write moves
 * it before Resume or a forward seek, the recorded baseline must be rebuilt
 * instead of applying the remaining steps to the user's divergent document.
 * Replay execution is wrapped in `withRecordingSuppressed`, so it never moves
 * this stamp itself.
 */
let liveWorkspaceMutationGeneration = 0
/** Index of the action logged for the top-level command currently running,
 *  so that command can retract it (see {@link reportUnreplayable}). */
/** A narration sentence waiting to caption the next real step. Only ever set
 *  while `narrationAsStep()` is off; see recorder/narrationMode.ts. */
let pendingNarration: string | undefined

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

export function getLiveWorkspaceMutationGeneration(): number {
  return liveWorkspaceMutationGeneration
}

function noteLiveWorkspaceMutation(): void {
  liveWorkspaceMutationGeneration++
}

function elapsedMs(rec: ActiveRecording): number {
  return Math.max(0, globalThis.performance.now() - rec.startedAt)
}

function sessionFrom(rec: ActiveRecording): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: VERSION, flameSchemaVersion: latestSchemaVersion },
    createdAt: rec.createdAt,
    initial: rec.initial,
    initialTimeline: rec.initialTimeline,
    initialAudio: rec.initialAudio,
    initialSonification: rec.initialSonification,
    initialView: rec.initialView,
    actions: rec.actions,
    unnamedWriteCount: rec.unnamedWrites.length,
  }
}

/** Size of the compact JSON validated by schema.ts. `baseJsonChars` already
 * includes the `[]` brackets around an empty action list; adding actions only
 * adds their bodies and the commas between them. */
function compactSessionChars(rec: ActiveRecording): number {
  return (
    rec.baseJsonChars +
    rec.actionJsonCharsTotal +
    Math.max(0, rec.actions.length - 1) +
    String(rec.unnamedWrites.length).length -
    1
  )
}

function candidateCompactSessionChars(
  rec: ActiveRecording,
  actionChars: number,
  replacingIndex?: number,
): number {
  if (replacingIndex === undefined) {
    return (
      compactSessionChars(rec) +
      actionChars +
      (rec.actions.length === 0 ? 0 : 1)
    )
  }
  return (
    compactSessionChars(rec) -
    (rec.actionJsonChars[replacingIndex] ?? 0) +
    actionChars
  )
}

/** A cap can be hit by many subsequent events. One honesty marker per take is
 * enough to tell the author replay is incomplete without turning a held key
 * or runaway effect into thousands of identical warnings. */
function noteSessionBudgetExceeded(rec: ActiveRecording, reason: string): void {
  const key = 'session-persistence-budget'
  if (rec.unreplayableKeys.has(key)) return
  rec.unreplayableKeys.add(key)
  noteUnnamedWrite(rec, reason)
}

type ActionSnapshot = { action: RecordedAction; jsonChars: number }

function snapshotAction(
  rec: ActiveRecording,
  action: Omit<RecordedAction, 'args'> & { args: readonly unknown[] },
  replacingIndex?: number,
): ActionSnapshot | undefined {
  const observedTime = elapsedMs(rec)
  if (
    !Number.isFinite(observedTime) ||
    observedTime > MAX_ACTION_TIMESTAMP_MS
  ) {
    noteSessionBudgetExceeded(
      rec,
      'Recording exceeded the 24-hour session timestamp limit',
    )
    return undefined
  }
  if (
    replacingIndex === undefined &&
    rec.actions.length >= MAX_SESSION_ACTIONS
  ) {
    noteSessionBudgetExceeded(
      rec,
      `Recording exceeded the ${MAX_SESSION_ACTIONS}-step session limit`,
    )
    return undefined
  }

  let candidate: RecordedAction | undefined
  try {
    candidate = validateRecordedAction({
      ...action,
      args: deepClone([...action.args]),
    })
  } catch {
    candidate = undefined
  }
  if (candidate === undefined) {
    noteSessionBudgetExceeded(
      rec,
      'An action exceeded the session schema limits and was not recorded',
    )
    return undefined
  }

  const encoded = JSON.stringify(candidate)
  if (
    candidateCompactSessionChars(rec, encoded.length, replacingIndex) >
    MAX_SESSION_JSON_CHARS
  ) {
    noteSessionBudgetExceeded(
      rec,
      'Recording reached the session file-size limit',
    )
    return undefined
  }
  return { action: candidate, jsonChars: encoded.length }
}

function removeAction(rec: ActiveRecording, index: number): void {
  rec.actions.splice(index, 1)
  const [removedChars = 0] = rec.actionJsonChars.splice(index, 1)
  rec.actionJsonCharsTotal -= removedChars
  setRecordedActionCount(rec.actions.length)
}

function persistedSession(
  session: RecordedSession,
): RecordedSession | undefined {
  const validated = validateSession(session)
  if (validated === undefined) return undefined
  const serialized = serializeSession(validated)
  if (serialized.length > MAX_SESSION_JSON_CHARS) return undefined
  if (
    new TextEncoder().encode(serialized).byteLength > MAX_SESSION_FILE_BYTES
  ) {
    return undefined
  }
  return validated
}

/** Begin recording. Everything passed is cloned, never held — pass the full
 *  current document (NOT condensed: hidden transforms must survive into
 *  replay). */
export function startSessionRecording(
  initial: FlameDescriptor,
  extras: SessionStartExtras = {},
): SessionRecordingStartResult {
  if (active) {
    console.warn('[recorder] A session recording is already active.')
    return { ok: false, reason: 'already-recording' }
  }
  let next: ActiveRecording
  try {
    next = {
      startedAt: globalThis.performance.now(),
      createdAt: new Date().toISOString(),
      baselineSeq: currentUndoSeq(),
      initial: deepClone(initial),
      initialTimeline:
        extras.timeline === undefined ? undefined : deepClone(extras.timeline),
      initialAudio:
        extras.audio === undefined ? undefined : deepClone(extras.audio),
      initialSonification:
        extras.sonification === undefined
          ? undefined
          : deepClone(extras.sonification),
      initialView:
        extras.view === undefined ? undefined : deepClone(extras.view),
      actions: [],
      actionJsonChars: [],
      actionJsonCharsTotal: 0,
      baseJsonChars: 0,
      unnamedWrites: [],
      unreplayableKeys: new Set(),
    }
  } catch {
    console.warn('[recorder] The current workspace cannot be serialized.')
    return { ok: false, reason: 'workspace-not-serializable' }
  }
  next.baseJsonChars = JSON.stringify(sessionFrom(next)).length
  if (persistedSession(sessionFrom(next)) === undefined) {
    console.warn('[recorder] The current workspace cannot be recorded safely.')
    return { ok: false, reason: 'workspace-not-recordable' }
  }
  active = next
  resetGestureState()
  // A sentence with nothing left to caption belongs to the take that ended,
  // never to the next one. Deliberately not in resetGestureState: that also
  // runs on every drag boundary, which would drop a caption the agent had
  // already spoken for the step about to be recorded.
  pendingNarration = undefined
  setRecordedActionCount(0)
  setUnnamedWriteCount(0)
  // A finished session describes the flame it was recorded against; once a
  // new recording starts it must not be embedded into anything.
  setLastSession(undefined)
  setIsSessionRecording(true)
  return { ok: true }
}

/**
 * The most recently finished recording, kept so an export can embed the steps
 * that produced the image (M5). Cleared when a new recording starts, so a PNG
 * never carries a session that describes a different flame.
 */
export function lastFinishedSession(): RecordedSession | undefined {
  return lastSession()
}

/** Detach export metadata as soon as the workspace no longer matches it. */
export function invalidateLastFinishedSession(): void {
  if (lastSession() !== undefined) setLastSession(undefined)
}

/**
 * Report an output mutation that intentionally bypasses undo/history, such as
 * a sampled live-audio modulation tick. It must invalidate a paused replay's
 * known prefix, but it must not create 30 unnamed-write entries per second —
 * the caller owns the one deduplicated fidelity warning for the take.
 */
export function reportDerivedWorkspaceWrite(): void {
  if (suppressDepth > 0) return
  noteLiveWorkspaceMutation()
  invalidateLastFinishedSession()
}

export function stopSessionRecording(): RecordedSession | undefined {
  if (!active) return undefined
  // Compact validation is enforced while recording. Pretty-printed downloads
  // and UTF-8 can be slightly larger, so trim only the newest actions until
  // the exact persisted form also fits. Earlier steps remain a valid prefix,
  // and the single fidelity marker says the tail was omitted.
  let session = persistedSession(sessionFrom(active))
  while (session === undefined && active.actions.length > 0) {
    removeAction(active, active.actions.length - 1)
    noteSessionBudgetExceeded(
      active,
      'Recording reached the persisted session size or schema limit',
    )
    session = persistedSession(sessionFrom(active))
  }
  const finished = session
  active = undefined
  setIsSessionRecording(false)
  if (finished === undefined) {
    setLastSession(undefined)
    console.error('[recorder] Could not produce a valid bounded session.')
    return undefined
  }
  setLastSession(finished)
  return finished
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
    | 'id'
    | 'label'
    | 'coalesceArgs'
    | 'coalesceKey'
    | 'describe'
    | 'focus'
    | 'preservesFinishedSession'
    | 'recordable'
  >,
  args: readonly unknown[],
  run: () => void,
): void {
  const rec = active
  if (
    commandDepth === 0 &&
    suppressDepth === 0 &&
    cmd.preservesFinishedSession !== true
  ) {
    noteLiveWorkspaceMutation()
  }
  if (
    !rec &&
    commandDepth === 0 &&
    suppressDepth === 0 &&
    cmd.preservesFinishedSession !== true
  ) {
    invalidateLastFinishedSession()
  }
  if (
    rec &&
    commandDepth === 0 &&
    suppressDepth === 0 &&
    cmd.recordable === false
  ) {
    coalesceAnchors = new Map()
    gestureClaimed = false
    noteUnnamedWrite(rec, `${cmd.label} is wall-clock transport`)
  } else if (
    rec &&
    commandDepth === 0 &&
    suppressDepth === 0 &&
    cmd.id === NARRATION_COMMAND_ID &&
    !narrationAsStep()
  ) {
    // The sentence still runs (the live rail shows it); it just waits to
    // caption the step it introduces instead of standing as a step itself.
    gestureClaimed = true
    const text = args[0]
    pendingNarration = typeof text === 'string' ? text : undefined
  } else if (rec && commandDepth === 0 && suppressDepth === 0) {
    // Any command during a gesture accounts for the entry that gesture will
    // push, so the commit is not reported as an anonymous write.
    gestureClaimed = true
    try {
      const key = cmd.coalesceKey?.([...args])
      const anchorKey = key === undefined ? undefined : `${cmd.id} ${key}`
      const anchorIndex =
        anchorKey === undefined ? undefined : coalesceAnchors.get(anchorKey)
      const existing =
        anchorIndex === undefined ? undefined : rec.actions[anchorIndex]
      if (existing !== undefined && anchorIndex !== undefined) {
        // A drag re-sets the same target dozens of times inside ONE undo step;
        // the log keeps the last value and the timestamp the gesture began.
        const coalescedArgs = cmd.coalesceArgs
          ? cmd.coalesceArgs(existing.args, args)
          : args
        const snapshot = snapshotAction(
          rec,
          {
            ...existing,
            args: coalescedArgs,
            focus: focusFor(cmd, [...coalescedArgs]),
            // The label has to move with the args. Describing commands render
            // the value into their label ("Set gamma to 2.42"), so keeping the
            // first one left the step list quoting a value the action no longer
            // carried.
            label: cmd.describe?.([...coalescedArgs]) ?? cmd.label,
          },
          anchorIndex,
        )
        if (snapshot !== undefined) {
          rec.actionJsonCharsTotal +=
            snapshot.jsonChars - (rec.actionJsonChars[anchorIndex] ?? 0)
          rec.actionJsonChars[anchorIndex] = snapshot.jsonChars
          rec.actions[anchorIndex] = snapshot.action
          pendingActionIndex = anchorIndex
        }
      } else {
        const narration = pendingNarration
        pendingNarration = undefined
        const snapshot = snapshotAction(rec, {
          t: elapsedMs(rec),
          id: cmd.id,
          args,
          label: cmd.describe?.([...args]) ?? cmd.label,
          focus: focusFor(cmd, [...args]),
          ...(narration === undefined ? {} : { note: narration }),
        })
        if (snapshot !== undefined) {
          rec.actions.push(snapshot.action)
          rec.actionJsonChars.push(snapshot.jsonChars)
          rec.actionJsonCharsTotal += snapshot.jsonChars
          pendingActionIndex = rec.actions.length - 1
          if (anchorKey !== undefined) {
            coalesceAnchors.set(anchorKey, pendingActionIndex)
          }
          setRecordedActionCount(rec.actions.length)
        }
      }
    } catch {
      noteSessionBudgetExceeded(
        rec,
        'An action could not be serialized and was not recorded',
      )
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
  if (commandDepth === 0 && suppressDepth === 0) {
    noteLiveWorkspaceMutation()
  }
  const rec = active
  if (!rec) {
    // Synthetic actions stand in for real document/timeline mutations whose
    // implementation intentionally ran under suppression. Even without an
    // active take, that mutation detaches the last finished session from the
    // now-different workspace just like a normal command or history write.
    invalidateLastFinishedSession()
    return
  }
  if (commandDepth > 0 || suppressDepth > 0) return
  // A synthetic action stands for a whole effect, so it ends any coalescing
  // run — the next edit of the same control is its own step.
  coalesceAnchors = new Map()
  gestureClaimed = true
  const snapshot = snapshotAction(rec, {
    t: elapsedMs(rec),
    id,
    args,
    label,
    focus: focusHintFor(id, [...args]),
  })
  if (snapshot === undefined) return
  rec.actions.push(snapshot.action)
  rec.actionJsonChars.push(snapshot.jsonChars)
  rec.actionJsonCharsTotal += snapshot.jsonChars
  setRecordedActionCount(rec.actions.length)
}

/**
 * Replace the command currently being recorded with an equivalent snapshot
 * action after it has run.
 *
 * Undo/redo need this special case: a replay is intentionally accumulated as
 * one preview entry, so dispatching the live history command inside that
 * preview has no intermediate stack to operate on. Recording the resulting
 * flame as `flame.load` preserves the visible undo/redo step while making it
 * independent of the viewer's history layout.
 */
export function replaceCurrentRecordedAction(
  id: string,
  args: readonly unknown[],
  label?: string,
): void {
  const rec = active
  const index = pendingActionIndex
  if (!rec || index === undefined || suppressDepth > 0) return
  const previous = rec.actions[index]
  if (!previous) return
  const snapshot = snapshotAction(
    rec,
    {
      ...previous,
      id,
      args,
      label,
      focus: focusHintFor(id, [...args]) ?? previous.focus,
    },
    index,
  )
  if (snapshot === undefined) {
    removeAction(rec, index)
    pendingActionIndex = undefined
    coalesceAnchors = new Map()
    return
  }
  rec.actionJsonCharsTotal +=
    snapshot.jsonChars - (rec.actionJsonChars[index] ?? 0)
  rec.actionJsonChars[index] = snapshot.jsonChars
  rec.actions[index] = {
    ...previous,
    ...snapshot.action,
  }
  coalesceAnchors = new Map()
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
    removeAction(rec, pendingActionIndex)
    pendingActionIndex = undefined
  }
  coalesceAnchors = new Map()
  rec.unnamedWrites.push({ t: elapsedMs(rec), description: reason })
  setUnnamedWriteCount(rec.unnamedWrites.length)
  console.warn('[recorder] Unreplayable during recording:', reason)
}

/**
 * Mark a continuously-running effect as unreplayable once per recording.
 *
 * Audio modulation can write at 30 fps, but 300 identical fidelity warnings
 * are no more useful than one. The key is internal to the active take and is
 * deliberately not serialized.
 */
export function reportUnreplayableOnce(key: string, reason: string): void {
  const rec = active
  if (!rec || suppressDepth > 0 || rec.unreplayableKeys.has(key)) return
  rec.unreplayableKeys.add(key)
  reportUnreplayable(reason)
}

/**
 * Can an undo/redo of `target` be reproduced by replaying this log?
 *
 * Only if it lands on an entry created after recording started. The history
 * command snapshots the resulting flame (and timeline, for timeline entries)
 * into the log, so replay never depends on reconstructing the viewer's undo
 * stacks. An older entry predates `initial` and cannot be represented by the
 * session. True when nothing is being recorded — there is no log to keep
 * faithful.
 */
export function isUndoTargetWithinRecording(
  target: UndoTarget | undefined,
): boolean {
  const rec = active
  if (!rec) return true
  return (
    target?.seq !== null &&
    target?.seq !== undefined &&
    target.seq > rec.baselineSeq
  )
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
  if (!claimed && suppressDepth === 0) noteLiveWorkspaceMutation()
  coalesceAnchors = new Map()
  gestureClaimed = false
  if (!rec) {
    invalidateLastFinishedSession()
    return
  }
  if (claimed || suppressDepth > 0) return
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
  // A suppressed compound edit records one synthetic snapshot after it has
  // finished. Its internal undo pushes must not break an unrelated command's
  // coalescing window or relinquish ownership of an in-flight flame preview.
  if (commandDepth > 0 || suppressDepth > 0) return
  noteLiveWorkspaceMutation()
  // Outside a command this IS a boundary: an uncovered timeline edit ends any
  // run, exactly as a flame entry does.
  coalesceAnchors = new Map()
  gestureClaimed = false
  if (!rec) {
    invalidateLastFinishedSession()
    return
  }
  noteUnnamedWrite(rec, description)
}

/** Direct scrub/play/step controls are transport, not timeline document
 * entries. They still detach stale export metadata, and while recording they
 * receive one honest fidelity marker per take because wall-clock transport is
 * deliberately not replayed. Command-routed seeks are already represented in
 * the log and therefore skip this hook while `commandDepth > 0`. */
export function reportTimelineTransport(description: string): void {
  if (commandDepth > 0 || suppressDepth > 0) return
  // An Arcade pilot's playback is the tool's own preview, started so the
  // viewer can see the animation, and the session deliberately does not claim
  // to reproduce it — a replay applies the keyframes and leaves Play to the
  // viewer. Counting it would mark every Cinema take as unfaithful for doing
  // exactly what it was designed to do. A human scrubbing during their own
  // recording is a different thing and still counts.
  if (agentDriving()) return
  noteLiveWorkspaceMutation()
  if (!active) {
    invalidateLastFinishedSession()
    return
  }
  reportUnreplayableOnce('timeline-transport', description)
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

/** End only the action-folding window for a completed UI gesture.
 *
 * Timeline controls call this after their undo coalescing ends. Keeping
 * `gestureClaimed` intact matters when the same gesture also owns a pending
 * flame-history preview: its later commit must remain attributed to the
 * commands that ran during the drag.
 */
export function breakRecordingCoalescing(): void {
  coalesceAnchors = new Map()
}

// The timeline reaches the recorder through this leaf rather than importing
// it: a direct import closes a cycle through the flame schema (see
// documentWriteHook.ts). Installed on load, which is early enough — nothing
// can be recorded before the recorder module exists.
setDocumentWriteReporter(reportTimelineWrite)
setTimelineTransportReporter(reportTimelineTransport)

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
