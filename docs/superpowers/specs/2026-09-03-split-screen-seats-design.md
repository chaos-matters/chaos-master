# Split-screen seats — design

Two live flames, edited at the same time, one by the viewer and one by an AI
agent driving the app through WebMCP. This is the plumbing for Duel mode; the
clash mathematics and the round features beyond a clock and start/stop are the
next brainstorm and are out of scope here.

Written 2026-09-03 against `main` at `a8303e8`. Every file and line below was
read on that commit.

## 1. Decisions already taken

Settled in the brainstorm, not re-argued here:

| Question                        | Decision                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What does the AI side do?       | Two flames, **one session**: the workspace owns both; the agent's commands carry a seat id and land on the second flame. The full command surface, one implementation. |
| Turn model                      | **Simultaneous, timed.** The pilot lock is scoped to the agent's seat, not the screen.                                                                                 |
| Viewer's controls during a duel | A **compact duel strip**, not the full sidebar.                                                                                                                        |
| Entrant                         | **Still flames.** No per-seat animation.                                                                                                                               |
| Recording                       | **Both sides recordable, separately monitored.** The recorder becomes multi-stream first, so "AI only / mine only / both / none" is a toggle over one mechanism.       |
| Approach                        | **Scoped sessions** (option 1): no large refactor of `MainWorkspace.tsx`; reuse from new entry points.                                                                 |
| Recorder pattern                | **Stream handle with a default delegate**, not an id threaded through every signature.                                                                                 |

### Naming

The runtime unit is a **seat**, not a "session": `RecordedSession` already
means the saved recording file (`recorder/schema.ts`), and a design that used
"session" for both would be misread at every call site. A duel has two seats,
`player` and `rival`. Everything else keeps its current name.

## 2. What exists today (facts the design rests on)

- `packages/app/src/MainWorkspace.tsx` is 7871 lines and owns every piece of
  editing state. The two stores it owns are already **factories**:
  `createStoreHistory` (called at :678) and `createTimelineState` (:1875).
  Instantiating each a second time needs no change to either.
- The renderer is already multi-instance: `<Flam3>` mounts in 18 places and
  `<Root>` in 18, and the GPU device is a module singleton
  (`WebgpuAdapter.ts`), so two live canvases share one device. Nothing new is
  needed to draw two flames side by side.
- The Home portal (`components/Home/portalScript.ts`, from :150) builds a
  **private `CommandContext`** over its own store and runs real registered
  commands against it. It is the proof that the command layer is already
  per-context. It also documents the bug this design removes: it must wrap
  every dispatch in `withRecordingSuppressed` because the recorder is
  module-global and "survives leaving the workspace".
- Exactly three things are module-global and assume one workspace:
  1. **The recorder** (`recorder/recorder.ts`, 848 lines): eleven pieces of
     module state at :95-131 plus four signals at :147-150. Consumed by 14
     non-test modules; the pivotal one is `commands/registry.ts`, whose
     `runCommand` calls `recordCommandExecution` for every command.
  2. **The WebMCP bridge** (`webmcp/contextBridge.ts`): one `context` slot,
     documented as "called once from MainWorkspace". Read by 19 tool modules
     through `getWebMcpContext()`.
  3. **The pilot** (`arcade/pilot.ts`): three signals; `agentDriving()` gates
     eight sites (`PilotOverlay.tsx`, `MainWorkspace.tsx` :3172 :3198 :4969,
     `recorder.ts`, `shortcuts/useShortcutManager.ts` :26,
     `webmcp/registerWebMcp.ts` :56, `arcadeCinema.ts`, `arcadeTeach.ts` x2).
- The raw-write seam `recorder/documentWriteHook.ts` (41 lines) deliberately
  imports nothing, to break an import cycle, so it carries no context. Its only
  `notifyDocumentWrite` caller is inside `createTimelineState`
  (`utils/timeline.ts:774`); its seven `notifyTimelineTransport` callers are
  all inside the same factory.
- Duel is already a mode: `lib/activeTab.ts` has
  `ArcadeMode = 'teach' | 'cinema' | 'duel' | 'beats'`, and the hub shows a
  greyed card (`ArcadeHub.tsx`, `ready: false`).
- The arena tools exist and are seat-agnostic pure functions over descriptors:
  `scoreFlame.ts`, `simulateClash.ts`, `scoreClashRound.ts`,
  `createClashFlame.ts`, `arenaArchetypes.ts`. They are the raw material for
  the maths brainstorm and are not touched here.

## 3. Architecture

Four units, each with one job, each testable alone.

### 3.1 `Seat` — the reusable editing unit

`packages/app/src/seats/seat.ts`

```ts
export type SeatId = 'player' | 'rival'
export const DEFAULT_SEAT: SeatId = 'player'

export interface Seat {
  readonly id: SeatId
  flame: Accessor<FlameDescriptor>
  setFlame: HistorySetter<FlameDescriptor>
  history: FlameHistory // the third tuple member of createStoreHistory
  timeline: ReturnType<typeof createTimelineState>
  camera: {
    zoom: Signal<number>
    position: Signal<v2f>
    pixelRatio: Signal<number>
  }
  stream: RecorderStream // see 3.2
  ctx: CommandContext // built by createSeatCommandContext(seat)
  dispose(): void
}

export function createSeat(id: SeatId, initial: FlameDescriptor): Seat
export function createSeatCommandContext(seat: Seat): CommandContext
```

`createSeat` composes the two existing factories with a seat id:
`createStoreHistory(..., { onPreviewStarted: () => seat.stream.notePreviewStarted() })`
and `createTimelineState({ seatId })`. `createSeatCommandContext` builds the
same shape `portalScript.ts` builds today, over real history and a real
timeline, with `seatId` set. The portal keeps its own stub for now (it has no
undo by design); migrating it to `createSeat` is a follow-up, not part of this.

**The player seat is not a new object.** `MainWorkspace` keeps its
`flameDescriptor`, `history`, `timeline` and `cmdContext` exactly as they are
and gains one line: `cmdContext.seatId = 'player'`. Wrapping the workspace's
state in a `Seat` would be the large refactor this design avoids; the
`rival` seat is the first real `createSeat` caller, and the player can migrate
to it later as an incremental cleanup.

### 3.2 `RecorderStream` — the recorder, per seat

`packages/app/src/recorder/recorder.ts` (same file; the change is internal)

Module state is sorted into two kinds.

**Per stream** — moves into `ActiveStream`, one per seat:

| Today (module `let`)                                                            | Why it is per stream                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `active`                                                                        | `ActiveRecording` is already a self-contained record.                                                                                                                                |
| `gestureClaimed`, `coalesceAnchors`                                             | A drag belongs to one store's log; folding must never cross seats.                                                                                                                   |
| `pendingNarration`, `pendingActionIndex`                                        | Both index one seat's action list.                                                                                                                                                   |
| `liveWorkspaceMutationGeneration`                                               | **Latent bug with two seats.** `player.ts` samples it to detect viewer takeover during a replay; a global counter reads the viewer editing seat A as taking over a replay on seat B. |
| `isSessionRecording`, `recordedActionCount`, `unnamedWriteCount`, `lastSession` | Per-seat UI state.                                                                                                                                                                   |

**Global — unchanged:**

| Stays module-level | Why                                                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commandDepth`     | Nesting is a property of the call stack, not of a store.                                                                                                                                                                                                                                                        |
| `suppressDepth`    | Same. It is conservative: it suppresses every stream. The one case that over-suppresses — a replay on one seat while the other records live — does not occur in Duel. Documented and pinned by a test (section 5.3) rather than scoped now, which leaves all 19 `withRecordingSuppressed` call sites untouched. |

The handle:

```ts
export interface RecorderStream {
  readonly id: SeatId
  start(
    initial: FlameDescriptor,
    extras?: SessionStartExtras,
  ): SessionRecordingStartResult
  stop(): RecordedSession | undefined
  cancel(): void
  isRecording: Accessor<boolean>
  actionCount: Accessor<number>
  unnamedWriteCount: Accessor<number>
  lastSession: Accessor<RecordedSession | undefined>
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

export function recorderStream(id: SeatId): RecorderStream // created on first use
export function anySessionRecording(): boolean // derived over all streams
```

**Every function `recorder.ts` exports today keeps its name and signature** and
becomes a one-line delegate to `recorderStream(DEFAULT_SEAT)`. The four
exported signals stay exported and are the default stream's. This is the whole
regression story for the recorder: with one seat, nothing observable changes,
and the 2018-line `recorder.test.ts` runs unmodified.

Routing — how a call reaches the right stream:

1. Commands: `runCommand(cmd, ctx, args)` in `commands/registry.ts` already
   holds the context. It becomes
   `recorderStream(ctx.seatId ?? DEFAULT_SEAT).recordCommandExecution(...)`.
   One line.
2. Raw writes: `documentWriteHook.ts` keeps importing nothing; its reporter
   signatures gain a trailing `seatId` with a default:
   `notifyDocumentWrite(description?, seatId = DEFAULT_SEAT)`,
   `notifyTimelineTransport(description, seatId = DEFAULT_SEAT)`.
   `createTimelineState({ seatId })` captures the id at construction and passes
   it at its 1 + 7 call sites. The two `reportDocumentWrite` and two
   `notePreviewStarted` call sites in the workspace stay on the default.
3. Gesture boundaries: the store that owns the gesture owns the seat, same
   mechanism as 2.
4. Narration: `arcade_narrate` writes to the **driving seat's** stream
   (section 3.4), which is what makes the folding in `narrationMode.ts`
   land on the right log.

### 3.3 The WebMCP bridge — a registry with a target

`packages/app/src/webmcp/contextBridge.ts`

```ts
export function setWebMcpContext(
  ctx: CommandContext,
  seatId: SeatId = DEFAULT_SEAT,
): void
export function clearWebMcpContext(seatId: SeatId = DEFAULT_SEAT): void
export function getWebMcpContext(seatId?: SeatId): CommandContext | undefined // no arg = current target
export function setWebMcpTarget(seatId: SeatId): void
export function getWebMcpTarget(): SeatId
```

`getWebMcpContext()` with no argument returns the **current target**, which is
`player` unless a duel has moved it. So all 19 tool modules — `execute_command`,
`get_flame`, `set_flame`, the arcade tools — operate on the rival seat during a
duel **with zero per-tool change**. Two invariants keep this safe:

- The target resets to `DEFAULT_SEAT` whenever the pilot leaves `driving`
  (`finishPilot` and `resetPilot`), so a stopped duel cannot leave the tools
  pointed at a disposed seat.
- `clearWebMcpContext(seatId)` on the current target resets the target.

The tool-level guard in `registerWebMcp.ts:56` (mutating non-arcade tools are
refused while driving) is unchanged and still applies.

### 3.4 The pilot — scoped to a seat

`packages/app/src/arcade/pilot.ts`

`PilotDriving` gains two fields:

```ts
seatId: SeatId // whose flame the agent is editing
lock: 'screen' | 'seat'
```

`startPilot` defaults them to `'player'` / `'screen'`, so Teach and Cinema are
byte-for-byte unchanged. `agentDriving()` keeps meaning "any seat". New:
`drivingSeat(): SeatId | undefined`.

The eight `agentDriving()` gates, by intent:

| Gate                                                                      | Under `lock: 'seat'`                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PilotOverlay` shield + banner                                            | Rendered inside the rival `SeatView` container instead of the screen. Esc-twice and Stop behave as today.     |
| Keyboard shortcuts (`useShortcutManager.ts:26`)                           | **Live.** The viewer is playing; Ctrl+Z on the player seat is theirs. The rival seat has no keyboard surface. |
| Toast muting, autosave consent deferral (`MainWorkspace.tsx` :3172 :3198) | Unchanged — global while any pilot drives; harmless and keeps the round quiet.                                |
| Canvas gate (`MainWorkspace.tsx:4969`)                                    | Unchanged; the workspace canvas is parked during a duel anyway (3.5).                                         |
| Tool guard (`registerWebMcp.ts:56`)                                       | Unchanged.                                                                                                    |
| `reportTimelineTransport` early return (`recorder.ts`)                    | Becomes per stream: only the driving seat's stream skips.                                                     |
| `arcadeCinema.ts`, `arcadeTeach.ts` "already active" checks               | Unchanged.                                                                                                    |

### 3.5 `DuelStage` — the split-screen view

`packages/app/src/components/Duel/`

- `DuelStage.tsx` — mounted in `MainWorkspace` in place of the canvas region
  while `arcadeMode() === 'duel'` and a duel is live. CSS grid, `1fr 1fr`. Owns
  the rival `Seat` for the duel's lifetime and disposes it on close.
- `SeatView.tsx` — one seat: its own `WheelZoomCamera2D` bound to the seat's
  `camera` signals, wrapping one `<Flam3>` over the seat's `flame()`. Quality
  is the workspace preset (the guard already forbids raising it). The player
  seat's view reads the **same** `flameDescriptor` store the sidebar edits.
- `DuelControls.tsx` — the compact strip under the player seat. Every button is
  an existing command through `executeCommand(id, playerCtx, ...)`:
  `flame.randomize`, `flame.mutate`, `flame.applyPalette` (via the existing
  `PaletteSelector`), the existing `QuickVariationPicker`, `camera.center`,
  `camera.zoomTo`, `history.undo`, `history.redo`. No new commands.
- `DuelClock.tsx` + `createDuelClock(durationMs)` — one shared countdown;
  reaching zero ends the duel through the same `finishPilot` path as Stop.
- The workspace's own `<Flam3>` is parked while the stage is up
  (`renderInterval = Infinity`, the same trick the modals use), so the player's
  flame renders once, not twice. Both `SeatView` canvases unmount with the
  stage — the idle-GPU floor with the duel closed must equal today's.

Duel is **2D only** in this scope. `SeatView` binds `WheelZoomCamera2D`; a
player flame with `dimensions: 3` is refused by `arcade_start_duel` with a
message naming the reason, and the rival is always created 2D. 3D seats need
the 3D camera binding and auto-exposure duplicated per seat and are a
follow-up.

### 3.6 Duel tools

`packages/app/src/webmcp/tools/arcadeDuel.ts`, exposed like the other arcade
tools, listed in `docs/webmcp.md`.

- `arcade_start_duel { durationSeconds?: 60-600 = 180, rivalFrom?: 'blank' | 'mirror' = 'mirror' }`
  Refuses if a pilot or a recording is already active (same wording as Teach).
  Creates the rival seat (`mirror` = deep copy of the player's flame at start;
  `blank` = the same `BLANK_CANVAS_STEPS` Teach uses), starts streams according
  to the recording toggle, starts the pilot with
  `{ mode: 'duel', seatId: 'rival', lock: 'seat' }`, sets the bridge target to
  `rival`, starts the clock, closes the hub. Returns the brief: the rival's
  allow-list, the clock, and the step budget.
- `arcade_end_duel { title?, summary? }` — stops the clock, stops both streams,
  ends the pilot, resets the target, saves, shows the result card.
- Allow-list `DUEL_ALLOWED`: `flame.` and `camera.` with the same locks the
  guard already applies (point count, dimensions, quality), plus
  `lesson.note`. No `timeline.`, no `view.`, no `sidebar.`.

**Atomic start and stop.** Both streams start inside one synchronous
`startDuel()` with a single `performance.now()` origin passed to both, so their
action timestamps share a zero. If the second stream fails to start, the first
is cancelled and the tool returns the error. Stop is one synchronous call that
stops both before anything is saved.

### 3.7 Recording toggle and what gets saved

`recorderUi.ts` gains a persisted `duelRecording: 'both' | 'rival' | 'player' | 'none'`
(default `'both'`), shown on the duel panel in the hub.

Saving, in this scope: each recorded stream's `RecordedSession` is saved
**separately** through the existing `ctx.recorder.save`, named
`Duel: <title> — your flame` and `Duel: <title> — the AI's flame`. Each is
replayable today with the existing replay, alone. A combined duel file with a
lockstep two-seat replay is a follow-up (section 7) and is designed so nothing
here has to change for it: both streams already share a time origin.

### 3.8 The result card and the judging seam

`arcade_end_duel` shows both flames side by side, each seat's step count, the
elapsed time, and one verdict line. The verdict comes through one interface:

```ts
export interface DuelJudge {
  judge(
    player: FlameDescriptor,
    rival: FlameDescriptor,
  ): {
    winner: SeatId | 'draw'
    line: string // one sentence for the card
  }
}
```

The v0 implementation compares the existing `scoreFlame` totals and says so in
its line ("Judged on the arena score sheet"). It is the seam the clash-maths
brainstorm replaces; nothing else on the card depends on how it decides.

## 4. Data flow

**An agent step lands on the rival.** `execute_command` → `getWebMcpContext()`
returns the rival's ctx (target moved by `arcade_start_duel`) → `guardCommand`
against `DUEL_ALLOWED` → `preflightLiveCommand` normalizes → `executeCommand`
→ `runCommand` → `recorderStream('rival').recordCommandExecution` → the
command mutates the rival seat's store. The player's store, history and log
are never touched.

**A viewer drag lands on the player.** The sidebar and `DuelControls` dispatch
with the workspace `cmdContext` (`seatId: 'player'`) → default stream → the
workspace store, exactly as today. A drag on the player `SeatView` camera is
the workspace camera, so `notePreviewStarted` reaches the default stream.

**Replaying a saved duel take.** Each saved file is a normal `RecordedSession`
and replays through the existing `player.ts` against the workspace. The
per-stream `liveWorkspaceMutationGeneration` is what makes this correct once
two seats exist: a replay on one seat cannot mistake edits on the other for
takeover.

## 5. Test plan

### 5.1 Unit — recorder streams (`recorder/recorderStreams.test.ts`, new)

- Two streams record independently: an action on `rival` appears only in
  `rival`'s session; counts and `unnamedWriteCount` do not cross.
- Coalescing never crosses streams: the same `${id} ${key}` anchor on both
  seats folds within each and never between them.
- `liveWorkspaceMutationGeneration` is per stream: a command on `player` does
  not move `rival`'s stamp.
- Gesture state is per stream: `notePreviewStarted` on one seat does not reset
  the other's anchors.
- Suppression is global and documented: `withRecordingSuppressed` around a
  `rival` command also suppresses a `player` command inside it. This pins the
  conservative behaviour so a later scoping is a deliberate change.
- Atomic duel start: if the second `start()` fails, the first stream is not
  recording afterwards; both `startedAt` values are the origin passed in.
- Default-delegate parity (the important one): a scripted scenario run through
  the **old module functions** and the same scenario through
  `recorderStream('player')` produce deep-equal `RecordedSession`s, with
  `performance.now` faked so timestamps are deterministic.

### 5.2 Unit — routing and seams

- `registry.test.ts`: `runCommand` records to the stream named by
  `ctx.seatId`; a context with no `seatId` records to the default.
- `documentWriteHook`: `notifyDocumentWrite('x')` without a seat reaches the
  default stream; with `'rival'` reaches only `rival`.
- `contextBridge.test.ts` (new): one seat behaves exactly as today whether or
  not a target was ever set; `setWebMcpTarget('rival')` redirects the no-arg
  read; the target resets on `finishPilot` and on `resetPilot`; clearing the
  target seat resets the target.
- `pilot.test.ts`: `startPilot` without the new fields yields
  `seatId: 'player', lock: 'screen'`; `drivingSeat()` follows.
- `guard.test.ts`: `DUEL_ALLOWED` admits `flame.` and `camera.`, refuses
  `timeline.`, `view.`, `sidebar.`, `history.`, exports, and the locked render
  settings.

### 5.3 Unit — seat isolation (`seats/seat.test.ts`, new)

Modelled on `portalScript.test.ts`, which already proves this kind of claim:
build a `rival` seat next to a mock player context, run `flame.addTransform`,
`flame.setAffine`, `flame.randomize` through the rival ctx, and assert the
player descriptor is deep-equal to its snapshot before and after; then the
reverse. Assert `dispose()` clears the rival's stream and bridge entry.

### 5.4 Unit — the ratchet (`recorder/recorderStateRatchet.test.ts`, new)

Follows the existing `uiCoverageRatchet.test.ts` pattern: reads
`recorder.ts` as text and asserts the only top-level mutable bindings are
`commandDepth`, `suppressDepth` and the stream registry. Per-stream state
cannot silently creep back to module scope in a later edit.

### 5.5 Component (`@solidjs/testing-library`)

- `DuelStage` renders two `SeatView`s; the pilot shield is inside the rival
  container and the player container has no shield.
- `DuelControls` buttons dispatch through a context with `seatId: 'player'`
  (spy on `executeCommand`).
- `DuelClock` counts down and calls the end handler once at zero.
- `PilotOverlay` with `lock: 'screen'` is unchanged (existing tests) and with
  `lock: 'seat'` renders no full-screen backdrop.

### 5.6 Browser, headed, real GPU (throwaway spec, not committed)

The same shape as today's probes, kept in `~/agent-out/chaos-master/<date>/`:

1. `arcade_start_duel` through `window.webmcp`; assert two canvases, the lock
   only over the rival.
2. `execute_command flame.randomize` → the rival flame changes, the player
   flame is deep-equal to before (via `get_flame` after moving the target, and
   the workspace's own state).
3. Click Dice on the player strip → the player flame changes, the rival does
   not.
4. `arcade_end_duel` → both takes saved, each replays alone; the bridge
   target is `player` again; `arcade_status` says idle.
5. Teach and Cinema each run end to end afterwards (the probe scripts from
   today) — the hackathon-video modes are proven undisturbed.

### 5.7 Existing suites that must stay green **unmodified**

`recorder.test.ts` (2018 lines), `player.test.ts`, `replay.test.ts`,
`replayVideo.test.ts`, `replayInterfaceVideo.test.ts`,
`timelineActions.test.ts`, `portalScript.test.ts`, `webmcp.test.ts`,
`registry.test.ts`, `pilot.test.ts`, `guard.test.ts`, `arcadeTeach.test.ts`,
`arcadeCinema.test.ts`, `PilotOverlay.test.tsx`, and the e2e smoke suite.

## 6. Regression strategy

The whole design is arranged so that **nothing observable changes until a
second seat exists**, and that claim is enforced rather than asserted:

1. **Delegate parity by construction.** Every existing export of
   `recorder.ts`, `documentWriteHook.ts` and `contextBridge.ts` keeps its name
   and signature. New capability is additive: new functions, optional trailing
   parameters with defaults, optional fields on `PilotDriving` and
   `CommandContext`.
2. **No edits to existing tests in the first two milestones.** M1 and M2 may
   add test files; a diff that touches an existing test file is a review
   finding to be justified explicitly, because it means behaviour moved.
3. **Parity test** (5.1, last bullet): old API and stream API produce
   deep-equal sessions for the same scenario.
4. **Ratchet test** (5.4): module state cannot regress.
5. **Static surface checks already in the repo keep running:** all 87 commands
   keep explicit replay policies (`registry.test.ts`), the WebMCP tool count
   and names are asserted in `webmcp.test.ts` and change only in M3 (two new
   tools, added to the assertion in the same commit).
6. **Mock context needs nothing.** `createMockCommandContext()` gains no
   required field; `seatId` is optional and defaults to the player, so every
   test that builds a context today is untouched.
7. **Perf gate.** Before and after M3, with the duel closed, the idle GPU
   counter recipe from the render investigation must report the same submit
   rate; the stage must unmount both canvases.
8. **Manual gate before M3 merges:** Teach and Cinema end to end in a real
   browser (5.6, step 5).
9. **Each milestone is independently mergeable** and ships no user-visible
   change until M3, so a regression found later bisects to one PR.

## 7. Milestones

|                               | Scope                                                                                                                                                                                                                                                 | User-visible                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| M1                            | Recorder streams: `RecorderStream`, `recorderStream()`, `anySessionRecording()`, delegates, parity + ratchet tests.                                                                                                                                   | None.                                               |
| M2                            | `seatId` on `CommandContext` (optional); registry routing; hook seat parameter; `createTimelineState({ seatId })`; bridge registry + target; pilot `seatId`/`lock`; `drivingSeat()`.                                                                  | None.                                               |
| M3                            | `createSeat`, `createSeatCommandContext`; `DuelStage`, `SeatView`, `DuelControls`, `DuelClock`; `arcade_start_duel` / `arcade_end_duel`; `DUEL_ALLOWED`; `DuelJudge` v0; recording toggle; separate saves; Duel card `ready: true`; `docs/webmcp.md`. | Duel mode, 2D, still flames, both sides recordable. |
| Follow-ups (not in this spec) | Combined `DuelRecording` file with lockstep two-seat replay; 3D seats; migrating the player and the Home portal onto `createSeat`; scoping `suppressDepth`.                                                                                           | —                                                   |

The clash mathematics (replacing `DuelJudge` v0) and the round features beyond
the clock and start/stop are the next brainstorm, after M3 is on `main`.

## 8. Error handling

- `arcade_start_duel` refuses, with the reason: a pilot already driving; a
  recording already running; a 3D player flame; a stream that fails to start
  (the other is cancelled first).
- Stop, Esc-twice, the clock reaching zero, and leaving the Arcade tab all end
  the duel through `finishPilot`; both takes are kept exactly as a stopped
  Teach take is kept today.
- A tool call that arrives after the duel ended finds the target back on
  `player` and the guard idle, and is handled as it is today.
- Page unload during a duel loses the in-memory takes, as it does for every
  recording today; not changed here.

## 9. Non-goals

Clash mathematics; animated entrants; 3D seats; human versus human; a second
sidebar; extracting `MainWorkspace` into a mountable `<Workspace>`; a combined
duel replay file; scoping `withRecordingSuppressed`.
