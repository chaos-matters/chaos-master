# Seat Plumbing Implementation Plan (M2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the four seams that assume one workspace — the command registry, the document-write hook, the WebMCP bridge and the pilot — which seat they are talking about, without changing anything a single-seat app observes.

**Architecture:** Every change is additive: an optional `seatId` on `CommandContext`, an optional trailing seat argument on the two hook reporters, an options bag on `createTimelineState`, a keyed registry plus a current target in the WebMCP bridge, and two optional fields on `PilotDriving`. Defaults are `'player'` everywhere, so existing callers keep their behaviour and existing tests run unmodified.

**Tech Stack:** TypeScript, SolidJS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-split-screen-seats-design.md` — sections 3.2 (routing), 3.3, 3.4, 5.2, 6, 7 (M2).

**Depends on:** M1 (`docs/superpowers/plans/2026-09-03-recorder-streams.md`) merged — this plan calls `recorderStream(id)`.

## Global Constraints

- No user-visible change. Teach and Cinema must behave identically.
- **Do not edit an existing test file** except `pilot.test.ts` and `guard.test.ts`, and there only to _add_ cases. If any other existing test needs changing, stop and report it.
- Defaults are mandatory: every new parameter and field defaults to the player seat.
- `documentWriteHook.ts` must keep importing nothing except the `SeatId` type — it exists to break an import cycle. A `import type` is erased at build time and is safe; a value import is not, so import `DEFAULT_SEAT` nowhere in that file and let callers pass the id.
- No emojis. No `Co-Authored-By` trailer.

## File structure

| File                                             | Change                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `packages/app/src/commands/types.ts`             | `seatId?: SeatId` on `CommandContext`.                                                          |
| `packages/app/src/commands/registry.ts`          | `runCommand` records to `recorderStream(ctx.seatId ?? DEFAULT_SEAT)`.                           |
| `packages/app/src/recorder/documentWriteHook.ts` | Reporters carry a seat id.                                                                      |
| `packages/app/src/utils/timeline.ts`             | `createTimelineState({ seatId })`, passed at its 8 notify sites.                                |
| `packages/app/src/webmcp/contextBridge.ts`       | Keyed registry plus a current target.                                                           |
| `packages/app/src/webmcp/registerWebMcp.ts`      | Registers the context under its seat.                                                           |
| `packages/app/src/arcade/pilot.ts`               | `seatId` and `lock` on `PilotDriving`; `drivingSeat()`.                                         |
| `packages/app/src/arcade/pilotActions.ts`        | Reset the bridge target when a pilot ends.                                                      |
| `packages/app/src/recorder/recorder.ts`          | `reportTimelineTransportIn` skips only the driving seat's stream.                               |
| `packages/app/src/MainWorkspace.tsx`             | Two lines: `seatId: 'player'` on `cmdContext`, `{ seatId: 'player' }` on `createTimelineState`. |

---

### Task 1: `seatId` on the command context, and registry routing

**Files:**

- Modify: `packages/app/src/commands/types.ts` (add to `CommandContext`), `packages/app/src/commands/registry.ts:456-465` (`runCommand`), `packages/app/src/MainWorkspace.tsx` (`cmdContext` object literal, near :3988)
- Test: `packages/app/src/commands/registry.test.ts` (add a describe block)

**Interfaces:**

- Consumes: `recorderStream`, `RecordableCommand` from `@/recorder/recorder`; `SeatId`, `DEFAULT_SEAT` from `@/seats/seatId`.
- Produces: `CommandContext.seatId?: SeatId` — read by `runCommand` to pick the recorder stream.

- [ ] **Step 1: Write the failing test**

Append to `packages/app/src/commands/registry.test.ts`:

```ts
describe('command recording is routed by seat', () => {
  const flame = createTestFlame()

  afterEach(() => {
    recorderStream('player').cancel()
    recorderStream('rival').cancel()
  })

  it('records into the stream named by the context', () => {
    const rival = recorderStream('rival')
    const player = recorderStream('player')
    player.start(flame)
    rival.start(flame)
    const ctx = createMockCommandContext()
    ctx.seatId = 'rival'

    executeCommand('flame.setExposure', ctx, 0.42)

    expect(rival.actionCount()).toBe(1)
    expect(player.actionCount()).toBe(0)
    player.cancel()
    expect(rival.stop()?.actions[0]?.id).toBe('flame.setExposure')
  })

  it('records into the player stream when the context names no seat', () => {
    const player = recorderStream('player')
    player.start(flame)
    const ctx = createMockCommandContext()
    expect(ctx.seatId).toBeUndefined()

    executeCommand('flame.setExposure', ctx, 0.42)

    expect(player.actionCount()).toBe(1)
    player.cancel()
  })
})
```

Add to that file's imports: `import { recorderStream } from '@/recorder/recorder'` and `afterEach` from vitest (`createMockCommandContext` and `createTestFlame` are already imported by the `preflightLiveCommand` block).

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/commands/registry.test.ts`
Expected: FAIL — `ctx.seatId` is not a property of `CommandContext` (type error), and the rival stream records nothing.

- [ ] **Step 3: Add the field**

In `packages/app/src/commands/types.ts`, add the import and the field as the first member of `CommandContext`, above `beforeCommand`:

```ts
import type { SeatId } from '@/seats/seatId'
```

```ts
export interface CommandContext {
  /**
   * Which seat this context edits. Absent means the workspace's own seat,
   * which is every context that existed before duels: the recorder routes a
   * command's action to `recorderStream(seatId ?? DEFAULT_SEAT)`, so a
   * sandbox or a test that never sets it keeps recording where it always did.
   */
  seatId?: SeatId
  beforeCommand?: () => void
  // …unchanged…
```

- [ ] **Step 4: Route the recording**

In `packages/app/src/commands/registry.ts`, replace the `recordCommandExecution` import with the stream API and rewrite `runCommand`:

```ts
import { recorderStream } from '@/recorder/recorder'
import { DEFAULT_SEAT } from '@/seats/seatId'
```

```ts
function runCommand(
  cmd: FlameCommand,
  ctx: CommandContext,
  args: unknown[],
): void {
  const finalArgs = cmd.normalizeArgs ? cmd.normalizeArgs(ctx, args) : args
  // The seat decides which log the action lands in. Everything the workspace
  // dispatches carries no seat and therefore lands in the player's, which is
  // what every caller before duels meant.
  recorderStream(ctx.seatId ?? DEFAULT_SEAT).recordCommandExecution(
    cmd,
    finalArgs,
    () => {
      cmd.execute(ctx, ...finalArgs)
    },
  )
}
```

- [ ] **Step 5: Name the workspace's seat**

In `packages/app/src/MainWorkspace.tsx`, in the `cmdContext` object literal (it begins `const cmdContext: CommandContext = {` around :3987), add as the first property:

```ts
    seatId: 'player',
```

- [ ] **Step 6: Run the tests**

Run: `pnpm typecheck && pnpm --filter chaos-master exec vitest run src/commands src/recorder`
Expected: PASS, including the two new cases.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/commands/types.ts packages/app/src/commands/registry.ts packages/app/src/commands/registry.test.ts packages/app/src/MainWorkspace.tsx
git commit -m "feat(commands): route a command's recording by its seat"
```

---

### Task 2: The document-write hook carries a seat

**Files:**

- Modify: `packages/app/src/recorder/documentWriteHook.ts`, `packages/app/src/recorder/recorder.ts` (the two `set…Reporter` installs), `packages/app/src/utils/timeline.ts` (factory signature and 8 notify sites)
- Test: `packages/app/src/recorder/documentWriteHook.test.ts` (new)

**Interfaces:**

- Consumes: `recorderStream` from `./recorder`; `SeatId`, `DEFAULT_SEAT`.
- Produces: `notifyDocumentWrite(description?: string, seatId?: SeatId)`, `notifyTimelineTransport(description: string, seatId?: SeatId)`, `createTimelineState(options?: { seatId?: SeatId })`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/app/src/recorder/documentWriteHook.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { notifyDocumentWrite, notifyTimelineTransport, } from './documentWriteHook'
import { recorderStream } from './recorder'

/**
 * The hook is the one seam with no CommandContext — it exists to break an
 * import cycle — so the seat has to arrive as an argument from whichever
 * store owns the write.
 */
describe('documentWriteHook seat routing', () => {
  const flame = createTestFlame()

  afterEach(() => {
    recorderStream('player').cancel()
    recorderStream('rival').cancel()
  })

  it('sends an unattributed write to the player stream', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    notifyDocumentWrite('timeline edit')
    expect(player.unnamedWriteCount()).toBe(1)
    expect(rival.unnamedWriteCount()).toBe(0)
  })

  it('sends a seated write only to that seat', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    notifyDocumentWrite('timeline edit', 'rival')
    expect(player.unnamedWriteCount()).toBe(0)
    expect(rival.unnamedWriteCount()).toBe(1)
  })

  it('routes transport the same way', () => {
    const rival = recorderStream('rival')
    rival.start(flame)
    notifyTimelineTransport('Timeline playback transport', 'rival')
    expect(rival.unnamedWriteCount()).toBe(1)
    expect(recorderStream('player').unnamedWriteCount()).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/recorder/documentWriteHook.test.ts`
Expected: FAIL — the reporters take no seat, so the second and third cases route to the player.

- [ ] **Step 3: Widen the hook**

Replace the type aliases and the four functions in `packages/app/src/recorder/documentWriteHook.ts` (keep the file's header comment; add only a type-only import, which is erased at build time and therefore does not create the cycle the file exists to avoid):

```ts
import type { SeatId } from '@/seats/seatId'

type DocumentWriteReporter = (description?: string, seatId?: SeatId) => void
type TimelineTransportReporter = (description: string, seatId?: SeatId) => void

let reporter: DocumentWriteReporter | undefined
let transportReporter: TimelineTransportReporter | undefined

export function setDocumentWriteReporter(fn: DocumentWriteReporter): void {
  reporter = fn
}

/** `seatId` is supplied by the store that owns the write — each timeline
 *  instance captures its own at construction. Omitted means the player. */
export function notifyDocumentWrite(
  description?: string,
  seatId?: SeatId,
): void {
  reporter?.(description, seatId)
}

export function setTimelineTransportReporter(
  fn: TimelineTransportReporter,
): void {
  transportReporter = fn
}

export function notifyTimelineTransport(
  description: string,
  seatId?: SeatId,
): void {
  transportReporter?.(description, seatId)
}
```

- [ ] **Step 4: Widen the two installs in `recorder.ts`**

Replace the two install lines at the bottom of `packages/app/src/recorder/recorder.ts`:

```ts
setDocumentWriteReporter((description, seatId) =>
  recorderStream(seatId ?? DEFAULT_SEAT).reportTimelineWrite(description),
)
setTimelineTransportReporter((description, seatId) =>
  recorderStream(seatId ?? DEFAULT_SEAT).reportTimelineTransport(description),
)
```

- [ ] **Step 5: Give the timeline factory a seat**

In `packages/app/src/utils/timeline.ts`:

```ts
import type { SeatId } from '@/seats/seatId'

export type TimelineStateOptions = {
  /** Which seat's recorder this timeline's writes belong to. Omitted means
   *  the workspace's own seat. */
  seatId?: SeatId
}

export function createTimelineState(options: TimelineStateOptions = {}) {
  const seatId = options.seatId
  // …unchanged body…
```

Then add `, seatId` as the second argument at all eight notify sites: `notifyDocumentWrite('timeline edit', seatId)` at :774, and `notifyTimelineTransport('…', seatId)` at :1312, :1345, :1357, :1363, :1374, :1380 (six sites; the seventh is the same call inside `togglePlay`). Grep to confirm none is missed:

Run: `grep -n "notifyDocumentWrite(\|notifyTimelineTransport(" packages/app/src/utils/timeline.ts`
Expected: every line ends `, seatId)`.

- [ ] **Step 6: Name the workspace timeline's seat**

In `packages/app/src/MainWorkspace.tsx:1875`:

```ts
const timeline = createTimelineState({ seatId: 'player' })
```

- [ ] **Step 7: Run**

Run: `pnpm typecheck && pnpm --filter chaos-master exec vitest run src/recorder src/utils src/commands`
Expected: PASS; `timelineActions.test.ts` and `recorder.test.ts` unmodified and green.

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/recorder/documentWriteHook.ts packages/app/src/recorder/documentWriteHook.test.ts packages/app/src/recorder/recorder.ts packages/app/src/utils/timeline.ts packages/app/src/MainWorkspace.tsx
git commit -m "feat(recorder): carry the seat through the document-write hook

The hook has no CommandContext by design, so each timeline instance captures
its seat at construction and passes it with every write. Omitting it still
means the player seat, which is every caller that existed before seats."
```

---

### Task 3: The WebMCP bridge becomes a registry with a target

**Files:**

- Modify: `packages/app/src/webmcp/contextBridge.ts`, `packages/app/src/webmcp/registerWebMcp.ts:94-137`
- Test: `packages/app/src/webmcp/contextBridge.test.ts` (new)

**Interfaces:**

- Produces: `setWebMcpContext(ctx, seatId?)`, `clearWebMcpContext(seatId?)`, `getWebMcpContext(seatId?)`, `setWebMcpTarget(seatId)`, `getWebMcpTarget()`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/app/src/webmcp/contextBridge.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { createMockCommandContext } from './testUtils'
import { clearWebMcpContext, getWebMcpContext, getWebMcpTarget, setWebMcpContext, setWebMcpTarget, } from './contextBridge'

describe('webmcp context bridge', () => {
  afterEach(() => {
    clearWebMcpContext('player')
    clearWebMcpContext('rival')
  })

  it('behaves as one context when nothing sets a target', () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    expect(getWebMcpTarget()).toBe('player')
    expect(getWebMcpContext()).toBe(ctx)
    clearWebMcpContext()
    expect(getWebMcpContext()).toBeUndefined()
  })

  it('redirects the no-argument read to the current target', () => {
    const player = createMockCommandContext()
    const rival = createMockCommandContext()
    setWebMcpContext(player)
    setWebMcpContext(rival, 'rival')
    expect(getWebMcpContext()).toBe(player)

    setWebMcpTarget('rival')
    // Every tool reads with no argument, so all of them follow the target.
    expect(getWebMcpContext()).toBe(rival)
    // An explicit read still reaches the seat it names.
    expect(getWebMcpContext('player')).toBe(player)
  })

  it('resets the target when the targeted seat is cleared', () => {
    setWebMcpContext(createMockCommandContext())
    setWebMcpContext(createMockCommandContext(), 'rival')
    setWebMcpTarget('rival')
    clearWebMcpContext('rival')
    expect(getWebMcpTarget()).toBe('player')
    expect(getWebMcpContext()).toBeDefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/webmcp/contextBridge.test.ts`
Expected: FAIL — `setWebMcpTarget` is not exported.

- [ ] **Step 3: Rewrite the bridge**

Replace everything below the header comment in `packages/app/src/webmcp/contextBridge.ts` (keep the header, and extend its last paragraph as shown):

```ts
import type { CommandContext } from '@/commands/types'
import type { SeatId } from '@/seats/seatId'
import { DEFAULT_SEAT } from '@/seats/seatId'

const contexts = new Map<SeatId, CommandContext>()

/**
 * Which seat the tools act on.
 *
 * Every tool reads `getWebMcpContext()` with no argument, so moving this is
 * how a duel points the whole tool surface at the rival's flame without
 * touching a single tool. It returns to the player whenever the targeted
 * seat is cleared, and `finishPilot` resets it when a session ends.
 */
let target: SeatId = DEFAULT_SEAT

/** Install the live CommandContext for a seat. Called from MainWorkspace for
 *  the player, and from the duel for the rival. */
export function setWebMcpContext(
  ctx: CommandContext,
  seatId: SeatId = DEFAULT_SEAT,
): void {
  contexts.set(seatId, ctx)
}

/**
 * Read a seat's live CommandContext; with no argument, the current target.
 *
 * Returns `undefined` before MainWorkspace mounts or after it unmounts. Tool
 * implementations must handle the missing-context case with a descriptive
 * error so the LLM can self-correct.
 */
export function getWebMcpContext(seatId?: SeatId): CommandContext | undefined {
  return contexts.get(seatId ?? target)
}

/** Tear down one seat's bridge entry. Called from MainWorkspace's `onCleanup`
 *  and when a duel disposes its rival seat. */
export function clearWebMcpContext(seatId: SeatId = DEFAULT_SEAT): void {
  contexts.delete(seatId)
  // A target pointing at a seat that no longer exists would make every tool
  // report "workspace not ready" with no way back.
  if (target === seatId) target = DEFAULT_SEAT
}

export function setWebMcpTarget(seatId: SeatId): void {
  target = seatId
}

export function getWebMcpTarget(): SeatId {
  return target
}
```

Extend the header's last paragraph to: `MainWorkspace installs the live context via `setWebMcpContext`after building its`cmdContext`; a duel installs a second one for its rival seat and moves the target. The tools read it via `getWebMcpContext`. Until a context is installed, tool calls return errors gracefully.`

- [ ] **Step 4: Register under a seat**

In `packages/app/src/webmcp/registerWebMcp.ts`, give `registerWebMcpTools` an optional seat and use it in both places:

```ts
export function registerWebMcpTools(
  cmdContext: CommandContext,
  seatId: SeatId = DEFAULT_SEAT,
): () => void {
  // 1. Install the bridge so tools can reach the app state.
  setWebMcpContext(cmdContext, seatId)
```

and in the returned cleanup, `clearWebMcpContext()` becomes `clearWebMcpContext(seatId)`. Add `import type { SeatId } from '@/seats/seatId'` and `import { DEFAULT_SEAT } from '@/seats/seatId'`.

- [ ] **Step 5: Run**

Run: `pnpm typecheck && pnpm --filter chaos-master exec vitest run src/webmcp`
Expected: PASS; `webmcp.test.ts` unmodified and green.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/webmcp/contextBridge.ts packages/app/src/webmcp/contextBridge.test.ts packages/app/src/webmcp/registerWebMcp.ts
git commit -m "feat(webmcp): key the context bridge by seat with a current target

Every tool reads the bridge with no argument, so moving the target is how a
duel points the whole tool surface at the rival's flame without touching a
single tool. The target returns to the player whenever its seat is cleared."
```

---

### Task 4: The pilot knows its seat and how much it locks

**Files:**

- Modify: `packages/app/src/arcade/pilot.ts`, `packages/app/src/arcade/pilotActions.ts`, `packages/app/src/recorder/recorder.ts` (`reportTimelineTransportIn`)
- Test: `packages/app/src/arcade/pilot.test.ts` (add cases)

**Interfaces:**

- Produces: `PilotDriving.seatId: SeatId`, `PilotDriving.lock: 'screen' | 'seat'`, `drivingSeat(): SeatId | undefined`.

- [ ] **Step 1: Write the failing test**

Append to `packages/app/src/arcade/pilot.test.ts`:

```ts
describe('pilot seats', () => {
  afterEach(() => {
    resetPilot()
  })

  it('defaults to owning the whole screen on the player seat', () => {
    expect(start()).toEqual({ ok: true })
    expect(drivingState()).toMatchObject({ seatId: 'player', lock: 'screen' })
    expect(drivingSeat()).toBe('player')
  })

  it('can drive the rival seat with a seat-scoped lock', () => {
    expect(
      startPilot({
        mode: 'duel',
        title: 'Duel',
        stepBudget: 40,
        allowed: ['flame.'],
        qualityRankAtStart: 1,
        seatId: 'rival',
        lock: 'seat',
        now: 0,
      }),
    ).toEqual({ ok: true })
    expect(drivingSeat()).toBe('rival')
    expect(drivingState()?.lock).toBe('seat')
    resetPilot()
    expect(drivingSeat()).toBeUndefined()
  })
})
```

Add `drivingSeat` and `startPilot` to that file's import list if not already present.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/arcade/pilot.test.ts`
Expected: FAIL — `drivingSeat` is not exported and `seatId` is not on the state.

- [ ] **Step 3: Add the fields**

In `packages/app/src/arcade/pilot.ts`, add to `PilotDriving` after `allowed`:

```ts
/**
 * Whose flame the agent is editing. Teach and Cinema drive the workspace's
 * own seat; a duel drives the rival's.
 */
seatId: SeatId
/**
 * How much the lock covers. `'screen'` is the Teach/Cinema shield: the
 * whole editor is the agent's and the viewer watches. `'seat'` covers only
 * the agent's half, because in a duel the viewer is playing too and needs
 * their own controls and their own keyboard.
 */
lock: 'screen' | 'seat'
```

In `startPilot`, accept them as optional and default them, so every existing caller is unchanged:

```ts
export function startPilot(
  input: Omit<PilotDriving, 'phase' | 'startedAt' | 'steps' | 'seatId' | 'lock'> & {
    now?: number
    seatId?: SeatId
    lock?: 'screen' | 'seat'
  },
): { ok: true } | { ok: false; error: string } {
```

and inside `setPilot({ … })` add:

```ts
    seatId: input.seatId ?? DEFAULT_SEAT,
    lock: input.lock ?? 'screen',
```

Add the accessor beside `drivingState`:

```ts
/** The seat an agent is currently editing, if any. */
export function drivingSeat(): SeatId | undefined {
  return drivingState()?.seatId
}
```

Import `SeatId` (type) and `DEFAULT_SEAT` (value) from `@/seats/seatId`.

- [ ] **Step 4: Scope the transport skip to the driving seat**

In `packages/app/src/recorder/recorder.ts`, in `reportTimelineTransportIn`, replace `if (agentDriving()) return` with:

```ts
// An Arcade pilot's playback is the tool's own preview, started so the
// viewer can see the animation, and the session deliberately does not claim
// to reproduce it — a replay applies the keyframes and leaves Play to the
// viewer. Only the seat the agent drives is exempt: in a duel the viewer is
// editing the other seat, and their transport counts as it always has.
if (drivingSeat() === s.id) return
```

Change the import from `agentDriving` to `drivingSeat`.

- [ ] **Step 5: Reset the target when a pilot ends**

In `packages/app/src/arcade/pilotActions.ts`, inside `finishPilot`, immediately after `clearNarration()`:

```ts
// The tools follow the bridge target; leaving it on a seat whose duel has
// ended would point every later call at a disposed context.
setWebMcpTarget(DEFAULT_SEAT)
```

Add `import { setWebMcpTarget } from '@/webmcp/contextBridge'` and `import { DEFAULT_SEAT } from '@/seats/seatId'`.

- [ ] **Step 6: Run**

Run: `pnpm typecheck && pnpm --filter chaos-master exec vitest run src/arcade src/recorder src/webmcp`
Expected: PASS; `arcadeTeach.test.ts`, `arcadeCinema.test.ts` and `PilotOverlay.test.tsx` unmodified and green.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/arcade/pilot.ts packages/app/src/arcade/pilot.test.ts packages/app/src/arcade/pilotActions.ts packages/app/src/recorder/recorder.ts
git commit -m "feat(arcade): give the pilot a seat and a lock scope

Teach and Cinema keep the whole-screen lock on the player seat by default. A
duel drives the rival seat with a seat-scoped lock, and the transport skip
now exempts only the seat the agent drives — the viewer editing the other one
counts as it always has."
```

---

### Task 5: Verify nothing moved, then open the PR

- [ ] **Step 1: Full suite and the modes that ship**

Run: `pnpm typecheck && pnpm lint && pnpm --filter chaos-master exec vitest run && pnpm validate-wgsl`
Expected: all green; the only lint warning is the pre-existing one in `AncestryTreeModal.tsx`.

- [ ] **Step 2: Prove Teach and Cinema still work end to end**

Start the dev server (`.claude/launch.json` → `chaos-master-dev`, https://localhost:5173), then run this throwaway probe from `packages/app`. It is not committed; keep it under `~/agent-out/chaos-master/<date>/`.

```js
// probe.mjs — node probe.mjs from packages/app
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  headless: false,
  args: ['--ignore-certificate-errors', '--enable-unsafe-webgpu'],
})
const page = await browser.newPage({ ignoreHTTPSErrors: true })
await page.goto('https://localhost:5173/', { waitUntil: 'load' })
await page.waitForFunction(() => window.webmcp !== undefined, {
  timeout: 120000,
})
await page.waitForTimeout(4000)
const call = (n, i) =>
  page.evaluate(([n, i]) => window.webmcp.executeTool(n, i), [n, i])
const text = (r) => JSON.parse(r.content[0].text)
console.log(
  'lesson',
  text(await call('arcade_start_lesson', { topic: 'variations' })).ok,
)
console.log(
  'cmd',
  text(
    await call('execute_command', {
      commandId: 'flame.addTransform',
      args: [],
    }),
  ),
)
console.log('end', text(await call('arcade_end_lesson', { title: 'probe' })).ok)
await page.waitForTimeout(1500)
console.log('cinema', text(await call('arcade_start_cinema', {})).ok)
console.log(
  'keys',
  text(
    await call('arcade_set_keyframes', {
      durationFrames: 60,
      tracks: [
        {
          path: 'camera.zoom',
          keyframes: [
            { frame: 0, value: 1 },
            { frame: 60, value: 2 },
          ],
        },
      ],
    }),
  ),
)
console.log(
  'endc',
  text(await call('arcade_end_cinema', { title: 'probe' })).ok,
)
await browser.close()
```

Expected: every `ok` is `true`, `execute_command` returns `success: true`, `arcade_set_keyframes` returns `trackCount: 1`.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --base main --title "feat(seats): teach the four workspace seams which seat they mean" --body-file - <<'EOF'
M2 of docs/superpowers/specs/2026-09-03-split-screen-seats-design.md. Depends on the recorder-streams PR.

Every change is additive and defaults to the player seat, so a single-seat app observes nothing:

- `CommandContext.seatId?` decides which recorder stream `runCommand` records into.
- The document-write hook carries a seat; each `createTimelineState({ seatId })` instance passes its own. The hook still imports nothing but a type, which is why the cycle it exists to break stays broken.
- The WebMCP bridge is keyed by seat with a current target, so moving the target redirects all 19 tools without touching one of them. It resets when the targeted seat is cleared, and `finishPilot` resets it too.
- `PilotDriving` gains `seatId` and `lock: 'screen' | 'seat'`, both defaulted. The recorder's transport skip now exempts only the seat the agent drives.

No existing test file changed except `pilot.test.ts` and `registry.test.ts`, and only to add cases. Teach and Cinema verified end to end in a real browser.
EOF
```

- [ ] **Step 4: Confirm CI is green. Do not merge; the reviewer merges.**

## Self-review

- Spec coverage: 3.2 routing items 1-3 — Tasks 1-2; 3.3 — Task 3; 3.4 (`seatId`, `lock`, `drivingSeat`, transport skip, target reset) — Task 4; 5.2 — Tasks 1-4; 6 items 1, 2, 6 — throughout. The eight `agentDriving()` gates are re-read in M3, where a seat-scoped lock first exists.
- Placeholders: none; every edit names its file, its anchor and its replacement text.
- Type consistency: `SeatId`/`DEFAULT_SEAT` come from `@/seats/seatId` in every file; `recorderStream(id)` and `RecordableCommand` match M1's exports; `registerWebMcpTools(ctx, seatId?)` matches the call M3 makes.
