# Recorder Streams Implementation Plan (M1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the session recorder multi-stream — one independent recording per seat — with every existing export kept as a delegate to the default stream, so nothing observable changes until a second seat exists.

**Architecture:** `recorder/recorder.ts` keeps its file and its public surface. Its eleven pieces of module state become one `StreamState` record per seat in a registry; the two call-stack counters (`commandDepth`, `suppressDepth`) stay module-level. A `RecorderStream` handle exposes the per-stream operations; today's exported functions become one-line delegates to the `player` stream. A source-scanning ratchet test pins the module-level state so it cannot creep back.

**Tech Stack:** TypeScript, SolidJS signals, Vitest (`pnpm --filter chaos-master exec vitest run <path>`), Prettier via the pre-commit hook.

**Spec:** `docs/superpowers/specs/2026-09-03-split-screen-seats-design.md` — sections 3.2, 5.1, 5.4, 6, 7 (M1).

## Global Constraints

- No user-visible change. With one seat, every exported function of `recorder.ts` behaves exactly as before.
- **Do not edit any existing test file in this milestone.** `recorder.test.ts` (2018 lines), `player.test.ts`, `replay.test.ts`, `replayVideo.test.ts`, `replayInterfaceVideo.test.ts`, `timelineActions.test.ts`, `portalScript.test.ts` must pass unmodified. If one fails, the refactor is wrong, not the test.
- `commandDepth` and `suppressDepth` stay module-global (spec 3.2). `withRecordingSuppressed` is unchanged.
- No emojis anywhere. No `Co-Authored-By` trailer on commits.
- Names are fixed: `SeatId`, `DEFAULT_SEAT`, `RecorderStream`, `recorderStream(id)`, `anySessionRecording()`.
- Run from the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm --filter chaos-master exec vitest run packages/app/src/recorder`. The pre-commit hook runs Prettier; the pre-push hook runs typecheck and lint.

## File structure

| File                                                           | Responsibility                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/src/seats/seatId.ts` (new)                       | The `SeatId` type and `DEFAULT_SEAT`. A leaf: imports nothing, so `documentWriteHook.ts` and `contextBridge.ts` can import it later without creating a cycle. |
| `packages/app/src/recorder/recorder.ts` (modify)               | Per-stream state in a registry, the `RecorderStream` handle, and the legacy delegates.                                                                        |
| `packages/app/src/recorder/recorderStreams.test.ts` (new)      | Two-stream behaviour and legacy/stream parity.                                                                                                                |
| `packages/app/src/recorder/recorderStateRatchet.test.ts` (new) | Source-scanning guard on module-level state.                                                                                                                  |

---

### Task 1: The `SeatId` leaf

**Files:**

- Create: `packages/app/src/seats/seatId.ts`
- Test: `packages/app/src/seats/seatId.test.ts`

**Interfaces:**

- Produces: `type SeatId = 'player' | 'rival'`, `const DEFAULT_SEAT: SeatId`, `const SEAT_IDS: readonly SeatId[]`, `function isSeatId(value: unknown): value is SeatId`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/app/src/seats/seatId.test.ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SEAT, isSeatId, SEAT_IDS } from './seatId'

describe('seatId', () => {
  it('names the player seat as the default and knows both seats', () => {
    expect(DEFAULT_SEAT).toBe('player')
    expect(SEAT_IDS).toEqual(['player', 'rival'])
    expect(isSeatId('rival')).toBe(true)
    expect(isSeatId('judge')).toBe(false)
    expect(isSeatId(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/seats/seatId.test.ts`
Expected: FAIL — cannot resolve `./seatId`.

- [ ] **Step 3: Write the leaf**

```ts
// packages/app/src/seats/seatId.ts
/**
 * A seat is one editing unit: a flame with its history, a camera, and a
 * recorder stream. The workspace is the `player` seat; a duel adds `rival`.
 *
 * Deliberately a leaf that imports nothing: `recorder/documentWriteHook.ts`
 * and `webmcp/contextBridge.ts` both exist to break import cycles, and both
 * need this type without gaining a dependency.
 */
export type SeatId = 'player' | 'rival'

export const DEFAULT_SEAT: SeatId = 'player'

export const SEAT_IDS: readonly SeatId[] = ['player', 'rival']

export function isSeatId(value: unknown): value is SeatId {
  return (
    typeof value === 'string' && (SEAT_IDS as readonly string[]).includes(value)
  )
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter chaos-master exec vitest run src/seats/seatId.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/seats/seatId.ts packages/app/src/seats/seatId.test.ts
git commit -m "feat(seats): add the SeatId leaf"
```

---

### Task 2: Per-stream state and the `RecorderStream` handle

This is the refactor. It is mechanical, and the rule is: every function that touched module state now takes the stream's state as its first parameter; the exported names become delegates. The existing 2018-line `recorder.test.ts` is the oracle.

**Files:**

- Modify: `packages/app/src/recorder/recorder.ts` (whole file; the structure below replaces lines 95-131, 147-152, and every function body listed in the substitution table)
- Test: `packages/app/src/recorder/recorderStreams.test.ts` (new; written in Task 3 — this task is green when `recorder.test.ts` passes unmodified)

**Interfaces:**

- Consumes: `SeatId`, `DEFAULT_SEAT` from `@/seats/seatId`.
- Produces (all in `recorder.ts`):

```ts
export interface RecorderStream {
  readonly id: SeatId
  /** `now` lets several streams share one time origin (a duel starts both in one call). */
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
export function recorderStream(id: SeatId): RecorderStream
export function anySessionRecording(): boolean
```

Every function exported today keeps its exact name and signature.

- [ ] **Step 1: Replace the module state block**

Delete lines 95-131 (`let active` through `let coalesceAnchors = new Map<string, number>()`) and lines 147-152 (the four `createSignal` calls and their `export { … }`), keeping `commandDepth` and `suppressDepth`. Put this in their place:

```ts
import type { SeatId } from '@/seats/seatId'
import { DEFAULT_SEAT } from '@/seats/seatId'

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

function noteLiveWorkspaceMutation(s: StreamState): void {
  s.liveWorkspaceMutationGeneration++
}
```

Add `Accessor` and `Setter` to the `solid-js` import: `import { createSignal } from 'solid-js'` becomes `import { createSignal } from 'solid-js'` plus `import type { Accessor, Setter } from 'solid-js'`.

- [ ] **Step 2: Apply the substitution table to every internal function**

Rename each function that touched module state to an `…In` form taking `s: StreamState` first, and replace identifiers inside its body exactly as listed. Do not change any other line of a body.

| Function today                                  | New name                                             | Inside the body, replace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noteSessionBudgetExceeded(rec, reason)`        | `noteSessionBudgetExceeded(s, rec, reason)`          | `noteUnnamedWrite(rec, reason)` → `noteUnnamedWrite(s, rec, reason)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `snapshotAction(rec, action, replacingIndex?)`  | `snapshotAction(s, rec, action, replacingIndex?)`    | every `noteSessionBudgetExceeded(rec, …)` → `noteSessionBudgetExceeded(s, rec, …)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `removeAction(rec, index)`                      | `removeAction(s, rec, index)`                        | `setRecordedActionCount(` → `s.setActionCount(`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `noteUnnamedWrite(rec, description)`            | `noteUnnamedWrite(s, rec, description)`              | `setUnnamedWriteCount(` → `s.setUnnamedWriteCount(`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `startSessionRecording(initial, extras)`        | `startIn(s, initial, extras, now)`                   | `active` → `s.active`; `resetGestureState()` → `resetGestureState(s)`; `pendingNarration` → `s.pendingNarration`; `setRecordedActionCount(0)` → `s.setActionCount(0)`; `setUnnamedWriteCount(0)` → `s.setUnnamedWriteCount(0)`; `setLastSession(undefined)` → `s.setLastSession(undefined)`; `setIsSessionRecording(true)` → `s.setIsRecording(true)`; `startedAt: globalThis.performance.now()` → `startedAt: now`                                                                                                                                                                                                  |
| `lastFinishedSession()`                         | `lastFinishedSessionIn(s)`                           | `lastSession()` → `s.lastSession()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `invalidateLastFinishedSession()`               | `invalidateLastFinishedSessionIn(s)`                 | `lastSession()` → `s.lastSession()`; `setLastSession(` → `s.setLastSession(`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `reportDerivedWorkspaceWrite()`                 | `reportDerivedWorkspaceWriteIn(s)`                   | `noteLiveWorkspaceMutation()` → `noteLiveWorkspaceMutation(s)`; `invalidateLastFinishedSession()` → `invalidateLastFinishedSessionIn(s)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `stopSessionRecording()`                        | `stopIn(s)`                                          | `active` → `s.active` (every occurrence, including `sessionFrom(active)` and `removeAction(active, …)` → `removeAction(s, s.active, …)`, `noteSessionBudgetExceeded(active, …)` → `noteSessionBudgetExceeded(s, s.active, …)`); `setIsSessionRecording(false)` → `s.setIsRecording(false)`; `setLastSession(` → `s.setLastSession(`                                                                                                                                                                                                                                                                                  |
| `cancelSessionRecording()`                      | `cancelIn(s)`                                        | `active = undefined` → `s.active = undefined`; `setIsSessionRecording(false)` → `s.setIsRecording(false)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `recordCommandExecution(cmd, args, run)`        | `recordCommandExecutionIn(s, cmd, args, run)`        | `const rec = active` → `const rec = s.active`; `noteLiveWorkspaceMutation()` → `noteLiveWorkspaceMutation(s)`; `invalidateLastFinishedSession()` → `invalidateLastFinishedSessionIn(s)`; `coalesceAnchors` → `s.coalesceAnchors`; `gestureClaimed` → `s.gestureClaimed`; `pendingNarration` → `s.pendingNarration`; `pendingActionIndex` → `s.pendingActionIndex`; `noteUnnamedWrite(rec, …)` → `noteUnnamedWrite(s, rec, …)`; `snapshotAction(rec, …)` → `snapshotAction(s, rec, …)`; `noteSessionBudgetExceeded(rec, …)` → `noteSessionBudgetExceeded(s, rec, …)`; `setRecordedActionCount(` → `s.setActionCount(` |
| `recordSyntheticAction(id, args, label)`        | `recordSyntheticActionIn(s, id, args, label)`        | same replacements as the row above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `replaceCurrentRecordedAction(id, args, label)` | `replaceCurrentRecordedActionIn(s, id, args, label)` | `active` → `s.active`; `pendingActionIndex` → `s.pendingActionIndex`; `coalesceAnchors` → `s.coalesceAnchors`; `snapshotAction(rec, …)` → `snapshotAction(s, rec, …)`; `removeAction(rec, …)` → `removeAction(s, rec, …)`                                                                                                                                                                                                                                                                                                                                                                                            |
| `reportUnreplayable(reason)`                    | `reportUnreplayableIn(s, reason)`                    | `active` → `s.active`; `pendingActionIndex` → `s.pendingActionIndex`; `removeAction(rec, …)` → `removeAction(s, rec, …)`; `coalesceAnchors` → `s.coalesceAnchors`; `setUnnamedWriteCount(` → `s.setUnnamedWriteCount(`                                                                                                                                                                                                                                                                                                                                                                                               |
| `reportUnreplayableOnce(key, reason)`           | `reportUnreplayableOnceIn(s, key, reason)`           | `active` → `s.active`; `reportUnreplayable(reason)` → `reportUnreplayableIn(s, reason)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `isUndoTargetWithinRecording(target)`           | `isUndoTargetWithinRecordingIn(s, target)`           | `active` → `s.active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `reportDocumentWrite(description, fromPreview)` | `reportDocumentWriteIn(s, description, fromPreview)` | `active` → `s.active`; `gestureClaimed` → `s.gestureClaimed`; `coalesceAnchors` → `s.coalesceAnchors`; `noteLiveWorkspaceMutation()` → `noteLiveWorkspaceMutation(s)`; `invalidateLastFinishedSession()` → `invalidateLastFinishedSessionIn(s)`; `noteUnnamedWrite(rec, …)` → `noteUnnamedWrite(s, rec, …)`                                                                                                                                                                                                                                                                                                          |
| `reportTimelineWrite(description)`              | `reportTimelineWriteIn(s, description)`              | same as the row above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `reportTimelineTransport(description)`          | `reportTimelineTransportIn(s, description)`          | `noteLiveWorkspaceMutation()` → `noteLiveWorkspaceMutation(s)`; `if (!active)` → `if (!s.active)`; `invalidateLastFinishedSession()` → `invalidateLastFinishedSessionIn(s)`; `reportUnreplayableOnce(…)` → `reportUnreplayableOnceIn(s, …)`. Keep `if (agentDriving()) return` as it is — M2 scopes it.                                                                                                                                                                                                                                                                                                              |
| `notePreviewStarted()`                          | `notePreviewStartedIn(s)`                            | `resetGestureState()` → `resetGestureState(s)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `breakRecordingCoalescing()`                    | `breakRecordingCoalescingIn(s)`                      | `coalesceAnchors = new Map()` → `s.coalesceAnchors = new Map()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

`elapsedMs`, `sessionFrom`, `compactSessionChars`, `candidateCompactSessionChars`, `persistedSession`, `focusFor` and `withRecordingSuppressed` touch no module state and are unchanged.

Two bodies are shown in full so the shape is unambiguous. `startIn`:

```ts
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
```

`reportDocumentWriteIn`:

```ts
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
```

- [ ] **Step 3: Add the handle, the registry read, and the delegates**

Append after `withRecordingSuppressed` (keep the two `set…Reporter` installs, but point them at the delegates defined below — they must stay at module scope, after the delegates exist):

```ts
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
    cancel: () => cancelIn(s),
    isRecording: s.isRecording,
    actionCount: s.actionCount,
    unnamedWriteCount: s.unnamedWriteCount,
    lastSession: s.lastSession,
    lastFinishedSession: () => lastFinishedSessionIn(s),
    invalidateLastFinishedSession: () => invalidateLastFinishedSessionIn(s),
    liveWorkspaceMutationGeneration: () => s.liveWorkspaceMutationGeneration,
    recordCommandExecution: (cmd, args, run) =>
      recordCommandExecutionIn(s, cmd, args, run),
    recordSyntheticAction: (id_, args, label) =>
      recordSyntheticActionIn(s, id_, args, label),
    replaceCurrentRecordedAction: (id_, args, label) =>
      replaceCurrentRecordedActionIn(s, id_, args, label),
    reportUnreplayable: (reason) => reportUnreplayableIn(s, reason),
    reportUnreplayableOnce: (key, reason) =>
      reportUnreplayableOnceIn(s, key, reason),
    reportDocumentWrite: (description, fromPreview) =>
      reportDocumentWriteIn(s, description, fromPreview),
    reportTimelineWrite: (description) => reportTimelineWriteIn(s, description),
    reportTimelineTransport: (description) =>
      reportTimelineTransportIn(s, description),
    reportDerivedWorkspaceWrite: () => reportDerivedWorkspaceWriteIn(s),
    isUndoTargetWithinRecording: (target) =>
      isUndoTargetWithinRecordingIn(s, target),
    notePreviewStarted: () => notePreviewStartedIn(s),
    breakRecordingCoalescing: () => breakRecordingCoalescingIn(s),
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
```

Move the original two `set…Reporter` lines down to here (they must run after the delegates are defined). Keep the doc comments that sat on the original exported functions: move each onto its `…In` form, since that is where the behaviour now lives.

- [ ] **Step 4: Typecheck and run the untouched oracle**

Run: `pnpm typecheck && pnpm --filter chaos-master exec vitest run src/recorder src/commands src/components/SessionRecorder src/webmcp src/arcade`
Expected: typecheck 0 errors; every file passes, `recorder.test.ts` unmodified. If any `recorder.test.ts` case fails, a substitution was missed — diff the failing function's body against the table.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add packages/app/src/recorder/recorder.ts
git commit -m "refactor(recorder): keep one recording per seat behind a stream handle

Every piece of module state except the two call-stack counters moves into a
per-seat StreamState; recorderStream(id) exposes the per-stream operations and
every existing export delegates to the player seat, so a single-seat app sees
no change. commandDepth and suppressDepth stay module-level on purpose:
nesting is a property of the call stack, and the conservative suppression
only over-suppresses in a case nothing exercises."
```

---

### Task 3: Two-stream behaviour and legacy parity

**Files:**

- Create: `packages/app/src/recorder/recorderStreams.test.ts`

**Interfaces:**

- Consumes: `recorderStream`, `anySessionRecording`, and the legacy exports from `./recorder`; `createTestFlame` from `@/webmcp/testUtils`.

- [ ] **Step 1: Write the tests**

```ts
// packages/app/src/recorder/recorderStreams.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { anySessionRecording, cancelSessionRecording, recordCommandExecution, recorderStream, reportDocumentWrite, reportUnreplayableOnce, recordSyntheticAction, startSessionRecording, stopSessionRecording, withRecordingSuppressed, } from './recorder'
import type { RecordableCommand } from './recorder'
import type { RecordedSession } from './schema'

const setExposure: RecordableCommand = {
  id: 'flame.setExposure',
  label: 'Set exposure',
}
const zoomTo: RecordableCommand = {
  id: 'camera.zoomTo',
  label: 'Zoom to',
  coalesceKey: () => 'zoom',
}

/** Deterministic clocks: `performance.now` counts up 10 ms per read, `Date`
 *  is pinned, so two runs of the same scenario produce equal sessions. */
function pinClocks() {
  let tick = 0
  vi.spyOn(globalThis.performance, 'now').mockImplementation(() => {
    tick += 10
    return tick
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'))
}

/**
 * The scenario every parity check runs: a plain command, a coalescing pair,
 * an unnamed write, a synthetic action and a deduplicated fidelity marker.
 */
function runScenario(api: {
  start: () => void
  command: (cmd: RecordableCommand, args: unknown[]) => void
  documentWrite: () => void
  synthetic: () => void
  unreplayableOnce: () => void
  stop: () => RecordedSession | undefined
}): RecordedSession | undefined {
  api.start()
  api.command(setExposure, [0.4])
  api.command(zoomTo, [2])
  api.command(zoomTo, [3])
  api.documentWrite()
  api.synthetic()
  api.unreplayableOnce()
  api.unreplayableOnce()
  return api.stop()
}

describe('recorder streams', () => {
  const flame = createTestFlame()

  beforeEach(() => {
    pinClocks()
  })
  afterEach(() => {
    recorderStream('player').cancel()
    recorderStream('rival').cancel()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('records the same session through the legacy surface and a non-default stream', () => {
    const legacy = runScenario({
      start: () => startSessionRecording(flame),
      command: (cmd, args) => recordCommandExecution(cmd, args, () => {}),
      documentWrite: () => reportDocumentWrite('slider'),
      synthetic: () => recordSyntheticAction('flame.load', [flame], 'Load'),
      unreplayableOnce: () => reportUnreplayableOnce('k', 'audio tick'),
      stop: stopSessionRecording,
    })
    const rival = recorderStream('rival')
    const viaStream = runScenario({
      start: () => rival.start(flame),
      command: (cmd, args) => rival.recordCommandExecution(cmd, args, () => {}),
      documentWrite: () => rival.reportDocumentWrite('slider'),
      synthetic: () =>
        rival.recordSyntheticAction('flame.load', [flame], 'Load'),
      unreplayableOnce: () => rival.reportUnreplayableOnce('k', 'audio tick'),
      stop: () => rival.stop(),
    })
    expect(legacy).toBeDefined()
    // Timestamps come from the pinned clock, so they match exactly too.
    expect(viaStream).toEqual(legacy)
    // The scenario's shape, so a silent no-op cannot pass as parity.
    expect(legacy?.actions.map((a) => a.id)).toEqual([
      'flame.setExposure',
      'camera.zoomTo',
      'flame.load',
    ])
    expect(legacy?.actions[1]?.args).toEqual([3])
    expect(legacy?.unnamedWriteCount).toBe(2)
  })

  it('keeps two streams independent', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    expect(player.start(flame)).toEqual({ ok: true })
    expect(rival.start(flame)).toEqual({ ok: true })
    expect(anySessionRecording()).toBe(true)

    rival.recordCommandExecution(setExposure, [0.9], () => {})
    rival.reportDocumentWrite('rival slider')

    expect(player.actionCount()).toBe(0)
    expect(player.unnamedWriteCount()).toBe(0)
    expect(rival.actionCount()).toBe(1)
    expect(rival.unnamedWriteCount()).toBe(1)

    const playerSession = player.stop()
    expect(playerSession?.actions).toEqual([])
    expect(rival.isRecording()).toBe(true)
    expect(anySessionRecording()).toBe(true)
    rival.stop()
    expect(anySessionRecording()).toBe(false)
  })

  it('never folds a gesture across streams', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    player.recordCommandExecution(zoomTo, [2], () => {})
    rival.recordCommandExecution(zoomTo, [5], () => {})
    player.recordCommandExecution(zoomTo, [3], () => {})
    expect(player.stop()?.actions.map((a) => a.args)).toEqual([[3]])
    expect(rival.stop()?.actions.map((a) => a.args)).toEqual([[5]])
  })

  it('keeps gesture boundaries per stream', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    player.recordCommandExecution(zoomTo, [2], () => {})
    // A drag boundary on the rival must not end the player's coalescing run.
    rival.notePreviewStarted()
    player.recordCommandExecution(zoomTo, [3], () => {})
    expect(player.stop()?.actions).toHaveLength(1)
    rival.stop()
  })

  it('counts live mutations per stream', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    const before = rival.liveWorkspaceMutationGeneration()
    player.recordCommandExecution(setExposure, [0.1], () => {})
    player.reportDocumentWrite('x')
    expect(rival.liveWorkspaceMutationGeneration()).toBe(before)
    expect(player.liveWorkspaceMutationGeneration()).toBeGreaterThan(before)
  })

  it('suppresses every stream, deliberately', () => {
    // Pinned so a later scoping of suppressDepth is a decision, not a drift.
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    withRecordingSuppressed(() => {
      rival.recordCommandExecution(setExposure, [0.2], () => {
        player.recordCommandExecution(setExposure, [0.3], () => {})
      })
    })
    expect(player.stop()?.actions).toEqual([])
    expect(rival.stop()?.actions).toEqual([])
  })

  it('lets a duel share one time origin', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    const origin = 500
    expect(player.start(flame, {}, origin)).toEqual({ ok: true })
    expect(rival.start(flame, {}, origin)).toEqual({ ok: true })
    // The pinned clock reads 10 ms later on every call, so both first actions
    // sit at the same offset from the shared origin, not from two starts.
    player.recordCommandExecution(setExposure, [0.4], () => {})
    rival.recordCommandExecution(setExposure, [0.5], () => {})
    const p = player.stop()?.actions[0]?.t ?? -1
    const r = rival.stop()?.actions[0]?.t ?? -1
    expect(p).toBeGreaterThan(0)
    expect(r - p).toBe(10)
  })

  it('cancels one stream without touching the other', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    cancelSessionRecording()
    expect(player.isRecording()).toBe(false)
    expect(rival.isRecording()).toBe(true)
    rival.cancel()
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm --filter chaos-master exec vitest run src/recorder/recorderStreams.test.ts`
Expected: PASS, 8 tests. If `expect(viaStream).toEqual(legacy)` fails on `createdAt`, the `Date` fake is not applied — check `vi.useFakeTimers({ toFake: ['Date'] })` runs before `start`.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/recorder/recorderStreams.test.ts
git commit -m "test(recorder): pin two-stream isolation and legacy parity"
```

---

### Task 4: The module-state ratchet

**Files:**

- Create: `packages/app/src/recorder/recorderStateRatchet.test.ts`

- [ ] **Step 1: Write the test**

```ts
// packages/app/src/recorder/recorderStateRatchet.test.ts
import { describe, expect, it } from 'vitest'
import recorderSource from './recorder.ts?raw'

/**
 * Per-seat state lives in `StreamState`; only the two call-stack counters may
 * be module-level. This reads the source so a later edit cannot quietly add
 * a `let` that would be shared by every seat again — the class of bug that
 * made the recorder single-workspace in the first place.
 */
describe('recorder module state', () => {
  const topLevelLets = [
    ...recorderSource.matchAll(/^let\s+([A-Za-z_$][\w$]*)/gm),
  ]
    .map((m) => m[1])
    .sort()
  const topLevelSignals = [
    ...recorderSource.matchAll(/^const\s+\[[^\]]*\]\s*=\s*createSignal/gm),
  ]

  it('keeps only the re-entrancy counters at module level', () => {
    expect(topLevelLets).toEqual(['commandDepth', 'suppressDepth'])
  })

  it('creates no module-level signals', () => {
    expect(topLevelSignals).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm --filter chaos-master exec vitest run src/recorder/recorderStateRatchet.test.ts`
Expected: PASS. (`?raw` imports are already used by `uiCoverageRatchet.test.ts`, so Vite handles them.)

- [ ] **Step 3: Full verification and commit**

Run: `pnpm typecheck && pnpm lint && pnpm --filter chaos-master exec vitest run`
Expected: 0 type errors, lint clean (the one pre-existing warning in `AncestryTreeModal.tsx` is not yours), every test file passes.

```bash
git add packages/app/src/recorder/recorderStateRatchet.test.ts
git commit -m "test(recorder): ratchet module-level state to the two counters"
```

---

### Task 5: Open the PR

- [ ] **Step 1: Push and open**

```bash
git push -u origin HEAD
gh pr create --base main --title "refactor(recorder): one recording per seat behind a stream handle" --body-file - <<'EOF'
M1 of docs/superpowers/specs/2026-09-03-split-screen-seats-design.md.

The recorder keeps its file and every public name. Its module state becomes a per-seat StreamState in a registry; recorderStream(id) exposes the per-stream operations; every existing export delegates to the player seat. commandDepth and suppressDepth stay module-level on purpose (call-stack properties; the conservative suppression is pinned by a test).

No user-visible change. recorder.test.ts (2018 lines) and every other existing test file run unmodified.

New tests: legacy-vs-stream parity on a scripted scenario with pinned clocks, two-stream isolation (actions, unnamed writes, coalescing, gesture boundaries, mutation stamps), shared time origin for a duel, and a source ratchet that allows only the two counters at module level.
EOF
```

- [ ] **Step 2: Confirm CI is green before merging.** Do not merge; the reviewer merges.

## Self-review

- Spec coverage: 3.2 (state split, handle, delegates, routing prerequisites) — Tasks 2-3; 5.1 — Task 3; 5.4 — Task 4; 6 items 1-4 — Tasks 2-4. Routing by `ctx.seatId` and the hook's seat parameter are M2 (next plan), by design.
- Placeholders: none; the substitution table names every function and identifier.
- Type consistency: `RecordableCommand` is defined in Task 2 and used in Task 3; `start(initial, extras?, now?)` matches across the handle, `startIn`, and the delegate.
