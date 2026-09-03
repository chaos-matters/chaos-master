import { createSignal } from 'solid-js'
import { agentDriving } from '@/arcade/pilot'
import { latestSchemaVersion } from '@/flame/schema/flameSchema'
import { DEFAULT_SEAT } from '@/seats/seatId'
import { deepClone } from '@/utils/clone'
import { currentUndoSeq } from '@/utils/undoJournal'
import { VERSION } from '@/version'
import { setDocumentWriteReporter, setTimelineTransportReporter, } from './documentWriteHook'
import { focusForCommand, focusHintFor } from './focus'
import { NARRATION_COMMAND_ID, narrationAsStep } from './narrationMode'
import { MAX_ACTION_TIMESTAMP_MS, MAX_SESSION_ACTIONS, MAX_SESSION_FILE_BYTES, MAX_SESSION_JSON_CHARS, serializeSession, SESSION_FORMAT_VERSION, validateRecordedAction, validateSession, } from './schema'
import type { Accessor, Setter } from 'solid-js'
import type { RecordedAction, RecordedSession, SessionViewSnapshot, } from './schema'
import type { SonificationSnapshot } from './sonificationState'
import type { FlameCommand } from '@/commands/types'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { SeatId } from '@/seats/seatId'
import type { UndoTarget } from '@/utils/undoRouting'

/**
 * The session recorder: turns an editing session into a `.steps.json` log of
 * registered-command invocations (see schema.ts for why intents, not patches).
 *
 * One recording per seat (see StreamState); the module-level surface at the
 * bottom of the file is the `player` seat, which is the workspace. Hooked into
 * exactly two seams:
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

/**
 * One recording per seat.
 *
 * Everything that used to be module-level state lives here, except the two
 * re-entrancy counters below: nesting and suppression are properties of the
 * call stack, not of a store, so a command inside a command is nested no
 * matter which seat it hits. `suppressDepth` is deliberately conservative — it
 * suppresses every stream — which only over-suppresses when a replay runs on
 * one seat while another records live, and nothing does that today.
 */
type StreamState = {
  readonly id: SeatId
  active: ActiveRecording | undefined
  /** See `getLiveWorkspaceMutationGeneration`: per seat, because a replay on
   *  one seat must not read edits on the other as a viewer takeover. */
  liveWorkspaceMutationGeneration: number
  /** A narration sentence waiting to caption the next real step. Only ever
   *  set while `narrationAsStep()` is off; see recorder/narrationMode.ts. */
  pendingNarration: string | undefined
  /** Index of the action logged for the top-level command currently running,
   *  so that command can retract it (see `reportUnreplayableIn`). */
  pendingActionIndex: number | undefined
  /** A command has run since the current gesture opened, so the entry that
   *  gesture eventually pushes is accounted for by the log. */
  gestureClaimed: boolean
  /**
   * Actions of the current gesture that a repeat can fold into, by
   * `${id} ${key}`. Cleared whenever a history entry lands, so folding can
   * never cross an undo step. Keyed rather than a single "last action"
   * because a gesture can drive more than one target in turn.
   */
  coalesceAnchors: Map<string, number>
  isRecording: Accessor<boolean>
  setIsRecording: Setter<boolean>
  actionCount: Accessor<number>
  setActionCount: Setter<number>
  unnamedWriteCount: Accessor<number>
  setUnnamedWriteCount: Setter<number>
  lastSession: Accessor<RecordedSession | undefined>
  setLastSession: Setter<RecordedSession | undefined>
}

let commandDepth = 0
let suppressDepth = 0

const streams = new Map<SeatId, StreamState>()

function streamState(id: SeatId): StreamState {
  const existing = streams.get(id)
  if (existing) return existing
  const [isRecording, setIsRecording] = createSignal(false)
  const [actionCount, setActionCount] = createSignal(0)
  const [unnamedWriteCount, setUnnamedWriteCount] = createSignal(0)
  const [lastSession, setLastSession] = createSignal<RecordedSession>()
  const created: StreamState = {
    id,
    active: undefined,
    liveWorkspaceMutationGeneration: 0,
    pendingNarration: undefined,
    pendingActionIndex: undefined,
    gestureClaimed: false,
    coalesceAnchors: new Map(),
    isRecording,
    setIsRecording,
    actionCount,
    setActionCount,
    unnamedWriteCount,
    setUnnamedWriteCount,
    lastSession,
    setLastSession,
  }
  streams.set(id, created)
  return created
}

function resetGestureState(s: StreamState): void {
  s.gestureClaimed = false
  s.coalesceAnchors = new Map()
}

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
function noteLiveWorkspaceMutation(s: StreamState): void {
  s.liveWorkspaceMutationGeneration++
}

/** A command's own hint wins over the central table — it knows things the id
 *  and args do not. */
function focusFor(
  cmd: Pick<FlameCommand, 'id' | 'focus'>,
  args: unknown[],
): string | undefined {
  return focusForCommand(cmd, args)
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
function noteSessionBudgetExceeded(
  s: StreamState,
  rec: ActiveRecording,
  reason: string,
): void {
  const key = 'session-persistence-budget'
  if (rec.unreplayableKeys.has(key)) return
  rec.unreplayableKeys.add(key)
  noteUnnamedWrite(s, rec, reason)
}

type ActionSnapshot = { action: RecordedAction; jsonChars: number }

function snapshotAction(
  s: StreamState,
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
      s,
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
      s,
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
      s,
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
      s,
      rec,
      'Recording reached the session file-size limit',
    )
    return undefined
  }
  return { action: candidate, jsonChars: encoded.length }
}

function removeAction(
  s: StreamState,
  rec: ActiveRecording,
  index: number,
): void {
  rec.actions.splice(index, 1)
  const [removedChars = 0] = rec.actionJsonChars.splice(index, 1)
  rec.actionJsonCharsTotal -= removedChars
  s.setActionCount(rec.actions.length)
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
function startIn(
  s: StreamState,
  initial: FlameDescriptor,
  extras: SessionStartExtras = {},
  now: number = globalThis.performance.now(),
): SessionRecordingStartResult {
  if (s.active) {
    console.warn('[recorder] A session recording is already active.')
    return { ok: false, reason: 'already-recording' }
  }
  let next: ActiveRecording
  try {
    next = {
      startedAt: now,
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
  s.active = next
  resetGestureState(s)
  // A sentence with nothing left to caption belongs to the take that ended,
  // never to the next one. Deliberately not in resetGestureState: that also
  // runs on every drag boundary, which would drop a caption the agent had
  // already spoken for the step about to be recorded.
  s.pendingNarration = undefined
  s.setActionCount(0)
  s.setUnnamedWriteCount(0)
  // A finished session describes the flame it was recorded against; once a
  // new recording starts it must not be embedded into anything.
  s.setLastSession(undefined)
  s.setIsRecording(true)
  return { ok: true }
}

/**
 * The most recently finished recording, kept so an export can embed the steps
 * that produced the image (M5). Cleared when a new recording starts, so a PNG
 * never carries a session that describes a different flame.
 */
function lastFinishedSessionIn(s: StreamState): RecordedSession | undefined {
  return s.lastSession()
}

/** Detach export metadata as soon as the workspace no longer matches it. */
function invalidateLastFinishedSessionIn(s: StreamState): void {
  if (s.lastSession() !== undefined) s.setLastSession(undefined)
}

/**
 * Report an output mutation that intentionally bypasses undo/history, such as
 * a sampled live-audio modulation tick. It must invalidate a paused replay's
 * known prefix, but it must not create 30 unnamed-write entries per second —
 * the caller owns the one deduplicated fidelity warning for the take.
 */
function reportDerivedWorkspaceWriteIn(s: StreamState): void {
  if (suppressDepth > 0) return
  noteLiveWorkspaceMutation(s)
  invalidateLastFinishedSessionIn(s)
}

function stopIn(s: StreamState): RecordedSession | undefined {
  if (!s.active) return undefined
  // Compact validation is enforced while recording. Pretty-printed downloads
  // and UTF-8 can be slightly larger, so trim only the newest actions until
  // the exact persisted form also fits. Earlier steps remain a valid prefix,
  // and the single fidelity marker says the tail was omitted.
  let session = persistedSession(sessionFrom(s.active))
  while (session === undefined && s.active.actions.length > 0) {
    removeAction(s, s.active, s.active.actions.length - 1)
    noteSessionBudgetExceeded(
      s,
      s.active,
      'Recording reached the persisted session size or schema limit',
    )
    session = persistedSession(sessionFrom(s.active))
  }
  const finished = session
  s.active = undefined
  s.setIsRecording(false)
  if (finished === undefined) {
    s.setLastSession(undefined)
    console.error('[recorder] Could not produce a valid bounded session.')
    return undefined
  }
  s.setLastSession(finished)
  return finished
}

function cancelIn(s: StreamState): void {
  s.active = undefined
  s.setIsRecording(false)
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
function recordCommandExecutionIn(
  s: StreamState,
  cmd: RecordableCommand,
  args: readonly unknown[],
  run: () => void,
): void {
  const rec = s.active
  if (
    commandDepth === 0 &&
    suppressDepth === 0 &&
    cmd.preservesFinishedSession !== true
  ) {
    noteLiveWorkspaceMutation(s)
  }
  if (
    !rec &&
    commandDepth === 0 &&
    suppressDepth === 0 &&
    cmd.preservesFinishedSession !== true
  ) {
    invalidateLastFinishedSessionIn(s)
  }
  if (
    rec &&
    commandDepth === 0 &&
    suppressDepth === 0 &&
    cmd.recordable === false
  ) {
    s.coalesceAnchors = new Map()
    s.gestureClaimed = false
    noteUnnamedWrite(s, rec, `${cmd.label} is wall-clock transport`)
  } else if (
    rec &&
    commandDepth === 0 &&
    suppressDepth === 0 &&
    cmd.id === NARRATION_COMMAND_ID &&
    !narrationAsStep()
  ) {
    // The sentence still runs (the live rail shows it); it just waits to
    // caption the step it introduces instead of standing as a step itself.
    s.gestureClaimed = true
    const text = args[0]
    s.pendingNarration = typeof text === 'string' ? text : undefined
  } else if (rec && commandDepth === 0 && suppressDepth === 0) {
    // Any command during a gesture accounts for the entry that gesture will
    // push, so the commit is not reported as an anonymous write.
    s.gestureClaimed = true
    try {
      const key = cmd.coalesceKey?.([...args])
      const anchorKey = key === undefined ? undefined : `${cmd.id} ${key}`
      const anchorIndex =
        anchorKey === undefined ? undefined : s.coalesceAnchors.get(anchorKey)
      const existing =
        anchorIndex === undefined ? undefined : rec.actions[anchorIndex]
      if (existing !== undefined && anchorIndex !== undefined) {
        // A drag re-sets the same target dozens of times inside ONE undo step;
        // the log keeps the last value and the timestamp the gesture began.
        const coalescedArgs = cmd.coalesceArgs
          ? cmd.coalesceArgs(existing.args, args)
          : args
        const snapshot = snapshotAction(
          s,
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
          s.pendingActionIndex = anchorIndex
        }
      } else {
        const narration = s.pendingNarration
        s.pendingNarration = undefined
        const snapshot = snapshotAction(s, rec, {
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
          s.pendingActionIndex = rec.actions.length - 1
          if (anchorKey !== undefined) {
            s.coalesceAnchors.set(anchorKey, s.pendingActionIndex)
          }
          s.setActionCount(rec.actions.length)
        }
      }
    } catch {
      noteSessionBudgetExceeded(
        s,
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
    if (commandDepth === 0) s.pendingActionIndex = undefined
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
function recordSyntheticActionIn(
  s: StreamState,
  id: string,
  args: readonly unknown[],
  label?: string,
): void {
  if (commandDepth === 0 && suppressDepth === 0) {
    noteLiveWorkspaceMutation(s)
  }
  const rec = s.active
  if (!rec) {
    // Synthetic actions stand in for real document/timeline mutations whose
    // implementation intentionally ran under suppression. Even without an
    // active take, that mutation detaches the last finished session from the
    // now-different workspace just like a normal command or history write.
    invalidateLastFinishedSessionIn(s)
    return
  }
  if (commandDepth > 0 || suppressDepth > 0) return
  // A synthetic action stands for a whole effect, so it ends any coalescing
  // run — the next edit of the same control is its own step.
  s.coalesceAnchors = new Map()
  s.gestureClaimed = true
  const snapshot = snapshotAction(s, rec, {
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
  s.setActionCount(rec.actions.length)
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
function replaceCurrentRecordedActionIn(
  s: StreamState,
  id: string,
  args: readonly unknown[],
  label?: string,
): void {
  const rec = s.active
  const index = s.pendingActionIndex
  if (!rec || index === undefined || suppressDepth > 0) return
  const previous = rec.actions[index]
  if (!previous) return
  const snapshot = snapshotAction(
    s,
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
    removeAction(s, rec, index)
    s.pendingActionIndex = undefined
    s.coalesceAnchors = new Map()
    return
  }
  rec.actionJsonCharsTotal +=
    snapshot.jsonChars - (rec.actionJsonChars[index] ?? 0)
  rec.actionJsonChars[index] = snapshot.jsonChars
  rec.actions[index] = {
    ...previous,
    ...snapshot.action,
  }
  s.coalesceAnchors = new Map()
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
function reportUnreplayableIn(s: StreamState, reason: string): void {
  const rec = s.active
  if (!rec || suppressDepth > 0) return
  if (s.pendingActionIndex !== undefined) {
    removeAction(s, rec, s.pendingActionIndex)
    s.pendingActionIndex = undefined
  }
  s.coalesceAnchors = new Map()
  rec.unnamedWrites.push({ t: elapsedMs(rec), description: reason })
  s.setUnnamedWriteCount(rec.unnamedWrites.length)
  console.warn('[recorder] Unreplayable during recording:', reason)
}

/**
 * Mark a continuously-running effect as unreplayable once per recording.
 *
 * Audio modulation can write at 30 fps, but 300 identical fidelity warnings
 * are no more useful than one. The key is internal to the active take and is
 * deliberately not serialized.
 */
function reportUnreplayableOnceIn(
  s: StreamState,
  key: string,
  reason: string,
): void {
  const rec = s.active
  if (!rec || suppressDepth > 0 || rec.unreplayableKeys.has(key)) return
  rec.unreplayableKeys.add(key)
  reportUnreplayableIn(s, reason)
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
function isUndoTargetWithinRecordingIn(
  s: StreamState,
  target: UndoTarget | undefined,
): boolean {
  const rec = s.active
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
 * commands (`gestureClaimed`) — the slider case, where the commit itself
 * happens in the Slider, outside any command. Anything else is a mutation the
 * log cannot replay: count it and say so.
 *
 * Either way the entry ends a coalescing run, so a second drag of the same
 * control becomes a second action — matching the second undo step it created.
 */
function reportDocumentWriteIn(
  s: StreamState,
  description?: string,
  fromPreview = false,
): void {
  const rec = s.active
  const claimed = commandDepth > 0 || (fromPreview && s.gestureClaimed)
  if (!claimed && suppressDepth === 0) noteLiveWorkspaceMutation(s)
  s.coalesceAnchors = new Map()
  s.gestureClaimed = false
  if (!rec) {
    invalidateLastFinishedSessionIn(s)
    return
  }
  if (claimed || suppressDepth > 0) return
  noteUnnamedWrite(s, rec, description)
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
function reportTimelineWriteIn(s: StreamState, description?: string): void {
  const rec = s.active
  // A suppressed compound edit records one synthetic snapshot after it has
  // finished. Its internal undo pushes must not break an unrelated command's
  // coalescing window or relinquish ownership of an in-flight flame preview.
  if (commandDepth > 0 || suppressDepth > 0) return
  noteLiveWorkspaceMutation(s)
  // Outside a command this IS a boundary: an uncovered timeline edit ends any
  // run, exactly as a flame entry does.
  s.coalesceAnchors = new Map()
  s.gestureClaimed = false
  if (!rec) {
    invalidateLastFinishedSessionIn(s)
    return
  }
  noteUnnamedWrite(s, rec, description)
}

/** Direct scrub/play/step controls are transport, not timeline document
 * entries. They still detach stale export metadata, and while recording they
 * receive one honest fidelity marker per take because wall-clock transport is
 * deliberately not replayed. Command-routed seeks are already represented in
 * the log and therefore skip this hook while `commandDepth > 0`. */
function reportTimelineTransportIn(s: StreamState, description: string): void {
  if (commandDepth > 0 || suppressDepth > 0) return
  // An Arcade pilot's playback is the tool's own preview, started so the
  // viewer can see the animation, and the session deliberately does not claim
  // to reproduce it — a replay applies the keyframes and leaves Play to the
  // viewer. Counting it would mark every Cinema take as unfaithful for doing
  // exactly what it was designed to do. A human scrubbing during their own
  // recording is a different thing and still counts.
  if (agentDriving()) return
  noteLiveWorkspaceMutation(s)
  if (!s.active) {
    invalidateLastFinishedSessionIn(s)
    return
  }
  reportUnreplayableOnceIn(s, 'timeline-transport', description)
}

function noteUnnamedWrite(
  s: StreamState,
  rec: ActiveRecording,
  description: string | undefined,
): void {
  rec.unnamedWrites.push({ t: elapsedMs(rec), description })
  s.setUnnamedWriteCount(rec.unnamedWrites.length)
  console.warn(
    '[recorder] Unnamed write during recording — not replayable:',
    description ?? '(no description)',
  )
}

/** Gesture boundary from the flame history's `startPreview`. Opens a fresh
 *  coalescing window: a drag folds into one action, but the next drag of the
 *  same control starts its own. */
function notePreviewStartedIn(s: StreamState): void {
  resetGestureState(s)
}

/** End only the action-folding window for a completed UI gesture.
 *
 * Timeline controls call this after their undo coalescing ends. Keeping
 * `gestureClaimed` intact matters when the same gesture also owns a pending
 * flame-history preview: its later commit must remain attributed to the
 * commands that ran during the drag.
 */
function breakRecordingCoalescingIn(s: StreamState): void {
  s.coalesceAnchors = new Map()
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

export type RecordableCommand = Pick<
  FlameCommand,
  | 'id'
  | 'label'
  | 'coalesceArgs'
  | 'coalesceKey'
  | 'describe'
  | 'focus'
  | 'preservesFinishedSession'
  | 'recordable'
>

/** One seat's recorder. Every method is the per-stream form of the module
 *  function of the same name; the module functions delegate to the `player`
 *  stream so existing callers see no change. */
export interface RecorderStream {
  readonly id: SeatId
  /** `now` lets several streams share one time origin (a duel starts both in
   *  one call). */
  start(
    initial: FlameDescriptor,
    extras?: SessionStartExtras,
    now?: number,
  ): SessionRecordingStartResult
  stop(): RecordedSession | undefined
  cancel(): void
  isRecording: () => boolean
  actionCount: () => number
  unnamedWriteCount: () => number
  lastSession: () => RecordedSession | undefined
  lastFinishedSession(): RecordedSession | undefined
  invalidateLastFinishedSession(): void
  liveWorkspaceMutationGeneration(): number
  recordCommandExecution(
    cmd: RecordableCommand,
    args: readonly unknown[],
    run: () => void,
  ): void
  recordSyntheticAction(
    id: string,
    args: readonly unknown[],
    label?: string,
  ): void
  replaceCurrentRecordedAction(
    id: string,
    args: readonly unknown[],
    label?: string,
  ): void
  reportUnreplayable(reason: string): void
  reportUnreplayableOnce(key: string, reason: string): void
  reportDocumentWrite(description?: string, fromPreview?: boolean): void
  reportTimelineWrite(description?: string): void
  reportTimelineTransport(description: string): void
  reportDerivedWorkspaceWrite(): void
  isUndoTargetWithinRecording(target: UndoTarget | undefined): boolean
  notePreviewStarted(): void
  breakRecordingCoalescing(): void
}

const handles = new Map<SeatId, RecorderStream>()

/** The recorder for one seat, created on first use. */
export function recorderStream(id: SeatId): RecorderStream {
  const existing = handles.get(id)
  if (existing) return existing
  const s = streamState(id)
  const handle: RecorderStream = {
    id,
    start: (initial, extras, now) => startIn(s, initial, extras, now),
    stop: () => stopIn(s),
    cancel: () => {
      cancelIn(s)
    },
    isRecording: s.isRecording,
    actionCount: s.actionCount,
    unnamedWriteCount: s.unnamedWriteCount,
    lastSession: s.lastSession,
    lastFinishedSession: () => lastFinishedSessionIn(s),
    invalidateLastFinishedSession: () => {
      invalidateLastFinishedSessionIn(s)
    },
    liveWorkspaceMutationGeneration: () => s.liveWorkspaceMutationGeneration,
    recordCommandExecution: (cmd, args, run) => {
      recordCommandExecutionIn(s, cmd, args, run)
    },
    recordSyntheticAction: (id_, args, label) => {
      recordSyntheticActionIn(s, id_, args, label)
    },
    replaceCurrentRecordedAction: (id_, args, label) => {
      replaceCurrentRecordedActionIn(s, id_, args, label)
    },
    reportUnreplayable: (reason) => {
      reportUnreplayableIn(s, reason)
    },
    reportUnreplayableOnce: (key, reason) => {
      reportUnreplayableOnceIn(s, key, reason)
    },
    reportDocumentWrite: (description, fromPreview) => {
      reportDocumentWriteIn(s, description, fromPreview)
    },
    reportTimelineWrite: (description) => {
      reportTimelineWriteIn(s, description)
    },
    reportTimelineTransport: (description) => {
      reportTimelineTransportIn(s, description)
    },
    reportDerivedWorkspaceWrite: () => {
      reportDerivedWorkspaceWriteIn(s)
    },
    isUndoTargetWithinRecording: (target) =>
      isUndoTargetWithinRecordingIn(s, target),
    notePreviewStarted: () => {
      notePreviewStartedIn(s)
    },
    breakRecordingCoalescing: () => {
      breakRecordingCoalescingIn(s)
    },
  }
  handles.set(id, handle)
  return handle
}

/** Is any seat recording? The dock's "keep me mounted" question. */
export function anySessionRecording(): boolean {
  for (const s of streams.values()) {
    if (s.isRecording()) return true
  }
  return false
}

// ── Legacy surface: the player stream ───────────────────────────────────────
//
// Every name below existed before streams did and keeps its signature. Each is
// a delegate to the `player` seat, which is the workspace. Nothing that only
// ever had one recorder needs to change.

const player = () => recorderStream(DEFAULT_SEAT)

export const isSessionRecording = (): boolean => player().isRecording()
export const recordedActionCount = (): number => player().actionCount()
export const unnamedWriteCount = (): number => player().unnamedWriteCount()

export function getLiveWorkspaceMutationGeneration(): number {
  return player().liveWorkspaceMutationGeneration()
}

export function startSessionRecording(
  initial: FlameDescriptor,
  extras: SessionStartExtras = {},
): SessionRecordingStartResult {
  return player().start(initial, extras)
}

export function lastFinishedSession(): RecordedSession | undefined {
  return player().lastFinishedSession()
}

export function invalidateLastFinishedSession(): void {
  player().invalidateLastFinishedSession()
}

export function reportDerivedWorkspaceWrite(): void {
  player().reportDerivedWorkspaceWrite()
}

export function stopSessionRecording(): RecordedSession | undefined {
  return player().stop()
}

export function cancelSessionRecording(): void {
  player().cancel()
}

export function recordCommandExecution(
  cmd: RecordableCommand,
  args: readonly unknown[],
  run: () => void,
): void {
  player().recordCommandExecution(cmd, args, run)
}

export function recordSyntheticAction(
  id: string,
  args: readonly unknown[],
  label?: string,
): void {
  player().recordSyntheticAction(id, args, label)
}

export function replaceCurrentRecordedAction(
  id: string,
  args: readonly unknown[],
  label?: string,
): void {
  player().replaceCurrentRecordedAction(id, args, label)
}

export function reportUnreplayable(reason: string): void {
  player().reportUnreplayable(reason)
}

export function reportUnreplayableOnce(key: string, reason: string): void {
  player().reportUnreplayableOnce(key, reason)
}

export function isUndoTargetWithinRecording(
  target: UndoTarget | undefined,
): boolean {
  return player().isUndoTargetWithinRecording(target)
}

export function reportDocumentWrite(
  description?: string,
  fromPreview = false,
): void {
  player().reportDocumentWrite(description, fromPreview)
}

export function reportTimelineWrite(description?: string): void {
  player().reportTimelineWrite(description)
}

export function reportTimelineTransport(description: string): void {
  player().reportTimelineTransport(description)
}

export function notePreviewStarted(): void {
  player().notePreviewStarted()
}

export function breakRecordingCoalescing(): void {
  player().breakRecordingCoalescing()
}

// The timeline reaches the recorder through this leaf rather than importing
// it: a direct import closes a cycle through the flame schema (see
// documentWriteHook.ts). Installed on load, which is early enough — nothing
// can be recorded before the recorder module exists.
setDocumentWriteReporter(reportTimelineWrite)
setTimelineTransportReporter(reportTimelineTransport)
