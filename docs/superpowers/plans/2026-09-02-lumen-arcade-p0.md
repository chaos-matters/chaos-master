# Lumen Arcade P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/arcade` on Lumen Apeiron: a hub where a WebMCP agent (ChatGPT's browser or Chrome) can run two AI-driven modes, Teach (records a replayable lesson) and Cinema (keyframes an animation), behind a hard lock with a Stop button, plus the fixes and docs the hackathon rules require.

**Architecture:** Agent tools (`document.modelContext.registerTool`) dispatch every write through the existing command registry with `executeCommand`, so the semantic session recorder captures the agent's work as a `.steps.json` session. A module-global "pilot" state (idle → driving → ended) owns the lock overlay, the step budget and the guard table. Mode-entry tools start the recorder through a new `ctx.recorder` seam; end tools save the session to the existing IndexedDB library. The hub is a third app tab (`#arcade`) reached by a worker redirect from `/arcade`.

**Tech Stack:** SolidJS + CSS Modules, Valibot (`@/valibot`), Vitest, Playwright, Cloudflare Worker (`packages/app/src/worker/index.ts`), pnpm workspace.

**Spec:** `~/.dotfiles/personal/chaos-master/hackaton/10-plan1-detailed-spec.md` (audit: `00-audit-feature-webmcp-ui.md`, rough plan: `01-plan1-arcade-rough.md`).

## Global Constraints

- Branch `feat/hackathon-webmcp-designs`; commit after every task; commit messages `feat(arcade): ...` / `fix(webmcp): ...`; never add a `Co-Authored-By` trailer.
- No emojis anywhere (code, UI, logs, commits). Icons are SVG components from `packages/app/src/icons` (add new `.svg` files there and export them from `icons/index.ts`).
- Every agent-initiated state change goes through `executeCommand(id, ctx, ...args)` from `@/commands/registry` after `preflightReplayCommand(id, args)`. Never call `ctx.setFlameDescriptor` or `ctx.timeline.setTracks` from a tool.
- Tool `description` ≤ 500 characters; tool results ≤ ~1.5 KB of JSON.
- Imports use the `@/` alias (`@/commands/registry`, `@/recorder/recorder`, `@/webmcp/contextBridge`, `@/valibot`).
- Commands to run (from the repo root): `pnpm typecheck`, `pnpm lint`, `pnpm --filter chaos-master exec vitest run <path>`, `pnpm test:e2e -- tests/arcade.spec.ts`.
- All tests in `packages/app/src/**/*.test.ts` run under Vitest; import `'@/commands/builtins'` at the top of any test that dispatches commands.
- Quality never goes up while the agent drives: preset order `low < mid < high < ultra` (`components/Quality/QualityPresets.tsx`).

## File structure

| Path                                                                                                                      | Responsibility                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/app/src/webmcp/testUtils.ts`                                                                                    | Shared test helpers: `createTestFlame()`, `createMockCommandContext()` (moved out of `webmcp.test.ts`)    |
| `packages/app/src/webmcp/tools/executeCommand.ts`                                                                         | Generic command escape hatch: preflight → guard → recorded dispatch                                       |
| `packages/app/src/commands/builtins/lesson.ts`                                                                            | `lesson.note` command (narration captions, recorded and replayable)                                       |
| `packages/app/src/arcade/narration.ts`                                                                                    | Narration signal + log written by `lesson.note`                                                           |
| `packages/app/src/arcade/pilot.ts`                                                                                        | Pilot state machine (idle / driving / ended), step counter, log                                           |
| `packages/app/src/arcade/topics.ts`                                                                                       | Teach topic catalog, Cinema allow-list, prompt-card text                                                  |
| `packages/app/src/arcade/guard.ts`                                                                                        | Pure guard: allowed commands, quality clamp, blocked prefixes                                             |
| `packages/app/src/arcade/pilotActions.ts`                                                                                 | `finishPilot(ctx, reason, ...)`: stop recorder, save session, end pilot (shared by tools and Stop button) |
| `packages/app/src/webmcp/tools/arcadeTeach.ts`                                                                            | `arcade_status`, `arcade_start_lesson`, `arcade_narrate`, `arcade_end_lesson`                             |
| `packages/app/src/webmcp/tools/arcadeCinema.ts`                                                                           | `arcade_start_cinema`, `arcade_get_animatable_paths`, `arcade_set_keyframes`, `arcade_end_cinema`         |
| `packages/app/src/webmcp/registerWebMcp.ts`                                                                               | Adds the "while driving, only guarded tools" gate in `wrapTool`                                           |
| `packages/app/src/commands/types.ts`                                                                                      | `CommandContext.recorder` and `CommandContext.arcade` seams                                               |
| `packages/app/src/MainWorkspace.tsx`                                                                                      | Wires both seams, mounts `PilotOverlay`, hides the recorder dock while driving                            |
| `packages/app/src/shortcuts/useShortcutManager.ts`                                                                        | Ignores shortcuts while driving                                                                           |
| `packages/app/src/components/Arcade/PilotOverlay.tsx` + `.module.css`                                                     | Lock shield, banner, Stop, live step list, end card                                                       |
| `packages/app/src/lib/activeTab.ts`                                                                                       | Third tab `arcade` (`#arcade`, `#arcade=<mode>`)                                                          |
| `packages/app/src/worker/index.ts`                                                                                        | `308 /arcade → /#arcade`                                                                                  |
| `packages/app/src/App.tsx`                                                                                                | Mounts `ArcadeHub` when the tab is `arcade`                                                               |
| `packages/app/src/arcade/webmcpDetect.ts`                                                                                 | `detectWebMcp()` for the status pill                                                                      |
| `packages/app/src/components/Arcade/ArcadeHub.tsx`, `ArcadeModePanel.tsx`, `WebMcpStatusPill.tsx`, `ArcadeHub.module.css` | The hub                                                                                                   |
| `packages/app/src/icons/{stop,robot,film,lock}.svg`                                                                       | New icons                                                                                                 |
| `tests/arcade.spec.ts`                                                                                                    | Playwright journeys through `window.webmcp`                                                               |
| `docs/webmcp.md`, `docs/recorder-coverage.md`                                                                             | Rules-required documentation                                                                              |

---

### Task 1: Recorded dispatch for `execute_command` (audit finding F1)

**Files:**

- Create: `packages/app/src/webmcp/testUtils.ts`
- Modify: `packages/app/src/webmcp/webmcp.test.ts` (move two helpers out)
- Modify: `packages/app/src/webmcp/tools/executeCommand.ts`
- Test: `packages/app/src/webmcp/tools/executeCommand.test.ts`

**Interfaces:**

- Produces: `createTestFlame(): FlameDescriptor` and `createMockCommandContext(): CommandContext` exported from `@/webmcp/testUtils` (every later test uses them).
- Produces: `execute_command` result `{ success: true, commandId }` unchanged; side effect: the action is now recorded.

- [x] **Step 1: Move the test helpers into `testUtils.ts`**

Cut `function createTestFlame()` and `function createMockCommandContext()` (they start at `webmcp.test.ts:25` and `:74`; cut through the closing `}` of `createMockCommandContext`) into a new file and export them. Keep the `vi` import:

```ts
// packages/app/src/webmcp/testUtils.ts
import { vi } from 'vitest'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export function createTestFlame(): FlameDescriptor {
  // ... body moved verbatim from webmcp.test.ts
}

export function createMockCommandContext(): CommandContext {
  // ... body moved verbatim from webmcp.test.ts
}
```

In `webmcp.test.ts` replace the removed functions with:

```ts
import { createMockCommandContext, createTestFlame } from './testUtils'
```

While moving, fix the mock's `setFlameDescriptor` so it honours the real `HistorySetter` contract (`(draft) => T | void`): most commands mutate the draft and return nothing, which the old mock turned into `flame = undefined`. Replace its body with:

```ts
    setFlameDescriptor: vi.fn((fn: (draft: FlameDescriptor) => FlameDescriptor | void) => {
      undoStack.push(flame)
      const draft = JSON.parse(JSON.stringify(flame)) as FlameDescriptor
      const result = fn(draft)
      flame = result ?? draft
      redoStack.length = 0
    }) as any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
```

Run: `pnpm --filter chaos-master exec vitest run src/webmcp/webmcp.test.ts`
Expected: PASS (same count as before the move).

- [x] **Step 2: Write the failing test**

```ts
// packages/app/src/webmcp/tools/executeCommand.test.ts
import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { executeCommandTool } from './executeCommand'

describe('execute_command dispatch', () => {
  afterEach(() => {
    cancelSessionRecording()
    clearWebMcpContext()
  })

  it('records the command in an active session and honours beforeCommand', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    expect(startSessionRecording(ctx.flameDescriptor())).toEqual({ ok: true })

    const result = await executeCommandTool.execute(
      { commandId: 'flame.setExposure', args: [0.42] },
      {},
    )

    expect(result).toEqual({ success: true, commandId: 'flame.setExposure' })
    expect(ctx.beforeCommand).toHaveBeenCalledTimes(1)
    expect(ctx.flameDescriptor().renderSettings.exposure).toBe(0.42)
    const session = stopSessionRecording()
    expect(session?.actions.map((a) => [a.id, a.args])).toEqual([
      ['flame.setExposure', [0.42]],
    ])
  })

  it('still rejects invalid args before dispatch', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const result = await executeCommandTool.execute(
      { commandId: 'flame.setExposure', args: ['not-a-number'] },
      {},
    )
    expect(result).toHaveProperty('error')
    expect(ctx.beforeCommand).not.toHaveBeenCalled()
  })
})
```

- [x] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/webmcp/tools/executeCommand.test.ts`
Expected: FAIL — `session.actions` is `[]` and `beforeCommand` was not called (replay dispatch bypasses both).

- [x] **Step 4: Switch the dispatch path**

```ts
// packages/app/src/webmcp/tools/executeCommand.ts (execute body, replacing the executeReplayCommand call)
import { executeCommand, preflightReplayCommand } from '@/commands/registry'
// ...
const preflightError = preflightReplayCommand(commandId, args)
if (preflightError !== undefined) {
  return { error: preflightError }
}

try {
  // Live dispatch: recorded by the session recorder, args normalised,
  // and `beforeCommand` hands any paused replay back first. The replay
  // path (`executeReplayCommand`) skips all three, which is right for a
  // .steps.json file and wrong for an agent driving the editor.
  executeCommand(commandId, ctx, ...args)
} catch (e) {
  return {
    error: `Command failed: ${e instanceof Error ? e.message : String(e)}`,
  }
}

return { success: true, commandId }
```

Remove the now-unused `executeReplayCommand` import.

- [x] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter chaos-master exec vitest run src/webmcp/tools/executeCommand.test.ts src/webmcp/webmcp.test.ts`
Expected: PASS. If `flame.setExposure` with a string arg is accepted by preflight (no explicit validator), change the second test's command to `timeline.setDuration` with `['x']` (it has `validateReplayArgs`), and keep the assertion.

- [x] **Step 6: Commit**

```bash
git add packages/app/src/webmcp/testUtils.ts packages/app/src/webmcp/webmcp.test.ts packages/app/src/webmcp/tools/executeCommand.ts packages/app/src/webmcp/tools/executeCommand.test.ts
git commit -m "fix(webmcp): dispatch execute_command through the recorded live path"
```

---

### Task 2: `lesson.note` command and the narration signal

**Files:**

- Create: `packages/app/src/arcade/narration.ts`
- Create: `packages/app/src/commands/builtins/lesson.ts`
- Modify: `packages/app/src/commands/builtins/index.ts`
- Test: `packages/app/src/commands/builtins/lesson.test.ts`

**Interfaces:**

- Produces: `narration(): string | undefined`, `narrationLog(): { t: number; text: string }[]`, `clearNarration()` from `@/arcade/narration`.
- Produces: command id `'lesson.note'` with args `[text: string]` (1–400 chars), `validateReplayArgs`, `label: 'Narration'`.

- [x] **Step 1: Write the failing test**

```ts
// packages/app/src/commands/builtins/lesson.test.ts
import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand, preflightReplayCommand } from '@/commands/registry'
import { clearNarration, narration, narrationLog } from '@/arcade/narration'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { createMockCommandContext } from '@/webmcp/testUtils'

describe('lesson.note', () => {
  afterEach(() => {
    clearNarration()
    cancelSessionRecording()
  })

  it('sets the narration and is recorded like any command', () => {
    const ctx = createMockCommandContext()
    startSessionRecording(ctx.flameDescriptor())
    executeCommand('lesson.note', ctx, 'Adding a spherical variation next.')
    expect(narration()).toBe('Adding a spherical variation next.')
    expect(narrationLog()).toHaveLength(1)
    const session = stopSessionRecording()
    expect(session?.actions[0]).toMatchObject({
      id: 'lesson.note',
      args: ['Adding a spherical variation next.'],
      label: 'Narration',
    })
  })

  it('rejects empty, non-string and oversized text at preflight', () => {
    expect(preflightReplayCommand('lesson.note', [''])).toBeTypeOf('string')
    expect(preflightReplayCommand('lesson.note', [42])).toBeTypeOf('string')
    expect(preflightReplayCommand('lesson.note', ['x'.repeat(401)])).toBeTypeOf(
      'string',
    )
    expect(preflightReplayCommand('lesson.note', ['fine'])).toBeUndefined()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/commands/builtins/lesson.test.ts`
Expected: FAIL — module `@/arcade/narration` not found.

- [x] **Step 3: Implement the signal and the command**

```ts
// packages/app/src/arcade/narration.ts
import { createSignal } from 'solid-js'

/**
 * What the agent last said, and everything it has said this take. Written
 * only by the `lesson.note` command so narration is recorded and replays as
 * a caption; read by the pilot overlay and the replay caption path.
 */
export const MAX_NARRATION_CHARS = 400
export const MAX_NARRATION_LOG = 200

const [narration, setNarration] = createSignal<string | undefined>()
const [narrationLog, setNarrationLog] = createSignal<
  { t: number; text: string }[]
>([])

export { narration, narrationLog }

export function pushNarration(text: string): void {
  setNarration(text)
  setNarrationLog((log) => [
    ...log.slice(-(MAX_NARRATION_LOG - 1)),
    { t: Date.now(), text },
  ])
}

export function clearNarration(): void {
  setNarration(undefined)
  setNarrationLog([])
}
```

```ts
// packages/app/src/commands/builtins/lesson.ts
import { MAX_NARRATION_CHARS, pushNarration } from '@/arcade/narration'
import { registerCommand } from '../registry'

function isNarrationText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_NARRATION_CHARS
  )
}

registerCommand({
  id: 'lesson.note',
  label: 'Narration',
  description: 'A sentence the AI says about the step it is about to take',
  validateReplayArgs(args) {
    if (args.length !== 1 || !isNarrationText(args[0])) {
      return `narration expects one non-empty string of at most ${MAX_NARRATION_CHARS} characters`
    }
    return undefined
  },
  execute(_ctx, text?: unknown) {
    if (isNarrationText(text)) pushNarration(text)
  },
})
```

Add `import './lesson'` to `packages/app/src/commands/builtins/index.ts` (alphabetical, after `./history`).

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter chaos-master exec vitest run src/commands/builtins/lesson.test.ts src/recorder`
Expected: PASS, including the existing recorder suites (a new command with a validator must not trip the coverage ratchet test; if `uiCoverageRatchet.test.ts` fails, add `lesson.note` to its allow-list exactly as it lists other non-UI commands).

- [x] **Step 5: Document the command**

Append to the "Covered" table in `docs/recorder-coverage.md`:

```markdown
| Arcade narration | AI narration lines during Teach / Cinema (no UI control; issued by the `arcade_narrate` tool) | `lesson.note` (text is the caption on replay) |
```

- [x] **Step 6: Commit**

```bash
git add packages/app/src/arcade/narration.ts packages/app/src/commands/builtins/lesson.ts packages/app/src/commands/builtins/index.ts packages/app/src/commands/builtins/lesson.test.ts docs/recorder-coverage.md
git commit -m "feat(arcade): add lesson.note narration command"
```

---

### Task 3: `ctx.recorder` and `ctx.arcade` seams

**Files:**

- Modify: `packages/app/src/commands/types.ts` (inside `CommandContext`, after `history?`)
- Modify: `packages/app/src/MainWorkspace.tsx` (`cmdContext` at ~3901; the `startExtras` closure at ~4827; `openReplaySession` at ~635; `qualityPreset()` signal)
- Modify: `packages/app/src/webmcp/testUtils.ts` (mock seams)

**Interfaces:**

- Produces on `CommandContext`:

```ts
recorder?: {
  isRecording: () => boolean
  start: () => SessionRecordingStartResult
  stop: () => RecordedSession | undefined
  cancel: () => void
  save: (session: RecordedSession, name: string) => Promise<void>
  openReplay: (session: RecordedSession) => void
  actionCount: () => number
}
arcade?: {
  openHub: (mode?: 'teach' | 'cinema' | 'duel' | 'beats') => void
  closeHub: () => void
  toast: (text: string) => void
  qualityPreset: () => string
}
```

- [x] **Step 1: Add the types**

```ts
// packages/app/src/commands/types.ts — add imports at the top
import type { RecordedSession } from '@/recorder/schema'
import type { SessionRecordingStartResult } from '@/recorder/recorder'

// ... inside `export interface CommandContext`, after the `history?` member:
  /**
   * Session recorder as the workspace exposes it to tools. Optional because
   * sandboxes (Home portal, tests) have no recorder. `start` captures the
   * same timeline/audio/sonification/view extras the recorder dock does.
   */
  recorder?: {
    isRecording: () => boolean
    start: () => SessionRecordingStartResult
    stop: () => RecordedSession | undefined
    cancel: () => void
    save: (session: RecordedSession, name: string) => Promise<void>
    openReplay: (session: RecordedSession) => void
    actionCount: () => number
  }
  /** Arcade hub and pilot affordances the tools may drive. */
  arcade?: {
    openHub: (mode?: 'teach' | 'cinema' | 'duel' | 'beats') => void
    closeHub: () => void
    toast: (text: string) => void
    qualityPreset: () => string
  }
```

Run: `pnpm typecheck` — Expected: PASS (both members optional; `createMockCommandContext` compiles unchanged).

- [x] **Step 2: Extract the recorder extras closure in `MainWorkspace.tsx`**

Above `const cmdContext: CommandContext = {` (~line 3901) add:

```ts
/** Same snapshot the recorder dock passes as `startExtras`; shared with the
 *  `ctx.recorder.start` seam so an agent-started take records the same
 *  side state as a human-started one. */
function captureRecorderStartExtras(): SessionStartExtras {
  return {
    timeline: cmdContext.timeline.edit?.snapshot(),
    audio: cmdContext.audio?.snapshot(),
    sonification: captureSonificationSnapshot(),
    view: {
      qualityPreset: qualityPreset(),
      pixelRatio: pixelRatio() as 1 | 0.5 | 0.25,
      adaptiveFilter: adaptiveFilterEnabled(),
      stochasticFilter: stochasticFilterEnabled(),
      flyMode: flyMode(),
      showTimeline: showTimeline(),
      sidebarOpen: showSidebar(),
      paletteRestoreColors: deepClone(prePaletteColors()),
    },
  }
}
```

(`SessionStartExtras` is already imported by the dock; add `import type { SessionStartExtras } from './recorder/recorder'` if `MainWorkspace.tsx` lacks it.) Replace the body of the dock's `startExtras={() => { ... }}` prop (~4827) with `startExtras={captureRecorderStartExtras}`.

- [x] **Step 3: Wire the seams into `cmdContext`**

Add to the `cmdContext` object literal (after `history`):

```ts
    recorder: {
      isRecording: isSessionRecording,
      start: () => {
        const result = startSessionRecording(flameDescriptor, captureRecorderStartExtras())
        if (result.ok && timeline.isPlaying()) {
          withRecordingSuppressed(() => timeline.pause())
        }
        return result
      },
      stop: stopSessionRecording,
      cancel: cancelSessionRecording,
      save: async (session, name) => {
        await storeSession(session, name)
        setExternalSessionLibraryRevision((n) => n + 1)
      },
      openReplay: openReplaySession,
      actionCount: recordedActionCount,
    },
    arcade: {
      openHub: (mode) => setActiveTab('arcade', mode),
      closeHub: () => setActiveTab('workspace'),
      toast: (text) => showToast(text, 3500),
      qualityPreset: () => qualityPreset(),
    },
```

Imports to add in `MainWorkspace.tsx` if missing: `isSessionRecording, startSessionRecording, stopSessionRecording, cancelSessionRecording, recordedActionCount, withRecordingSuppressed` from `./recorder/recorder`; `storeSession` from `./utils/sessionsDB`; `setActiveTab` from `./lib/activeTab`. `setExternalSessionLibraryRevision` is the setter of the existing `externalSessionLibraryRevision` signal (used at ~4861); if it is named differently, use that name. `setActiveTab(tab, mode?)` gains its second parameter in Task 9; until then call `setActiveTab('arcade')` and ignore `mode`.

- [x] **Step 4: Mock the seams in `testUtils.ts`**

In `createMockCommandContext()` add:

```ts
    recorder: {
      isRecording: vi.fn(() => false),
      start: vi.fn(() => ({ ok: true }) as const),
      stop: vi.fn(() => undefined),
      cancel: vi.fn(),
      save: vi.fn(async () => {}),
      openReplay: vi.fn(),
      actionCount: vi.fn(() => 0),
    },
    arcade: {
      openHub: vi.fn(),
      closeHub: vi.fn(),
      toast: vi.fn(),
      qualityPreset: vi.fn(() => 'mid'),
    },
```

- [x] **Step 5: Verify**

Run: `pnpm typecheck && pnpm --filter chaos-master exec vitest run src/webmcp src/recorder`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/app/src/commands/types.ts packages/app/src/MainWorkspace.tsx packages/app/src/webmcp/testUtils.ts
git commit -m "feat(arcade): expose recorder and arcade seams on the command context"
```

---

### Task 4: Pilot state machine and topic catalog

**Files:**

- Create: `packages/app/src/arcade/pilot.ts`
- Create: `packages/app/src/arcade/topics.ts`
- Test: `packages/app/src/arcade/pilot.test.ts`, `packages/app/src/arcade/topics.test.ts`

**Interfaces:**

- Produces from `@/arcade/pilot`: `PilotMode`, `PilotState`, `PilotDriving`, `PilotEnded`, `PilotEndReason`, signals `pilot()`, `pilotLog()`, `lastPilotSession()`, functions `agentDriving()`, `drivingState()`, `startPilot(input)`, `notePilotStep(kind, text)`, `pilotStepsRemaining()`, `appendPilotLog(kind, text)`, `endPilot(reason, extras)`, `resetPilot()`, `pilotElapsedMs(now?)`.
- Produces from `@/arcade/topics`: `TopicId`, `LessonTopic`, `LESSON_TOPICS`, `TOPIC_IDS`, `isTopicId()`, `ALWAYS_ALLOWED`, `CINEMA_ALLOWED`, `CINEMA_STEP_BUDGET`, `BLANK_CANVAS_STEPS`, `teachPromptCard(topic)`, `cinemaPromptCard(description)`.

- [x] **Step 1: Write the failing tests**

```ts
// packages/app/src/arcade/pilot.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { agentDriving, drivingState, endPilot, notePilotStep, pilot, pilotLog, pilotStepsRemaining, resetPilot, startPilot, } from './pilot'

const start = () =>
  startPilot({
    mode: 'teach',
    topic: 'variations',
    title: 'Teaching: Variations',
    stepBudget: 2,
    allowed: ['flame.'],
    qualityRankAtStart: 1,
    now: 1000,
  })

describe('pilot state machine', () => {
  afterEach(() => resetPilot())

  it('starts idle, drives, counts steps against the budget, ends', () => {
    expect(pilot()).toEqual({ phase: 'idle' })
    expect(start()).toEqual({ ok: true })
    expect(agentDriving()).toBe(true)
    expect(notePilotStep('command', 'Add transform')).toBe(1)
    expect(notePilotStep('narrate', 'Now the colour')).toBe(0)
    expect(notePilotStep('command', 'One too many')).toBe(-1)
    expect(pilotStepsRemaining()).toBe(0)
    expect(drivingState()?.steps).toBe(2)
    const ended = endPilot('finished', {
      title: 'Three families',
      sessionName: 'Lesson: Variations — Three families',
      now: 61_000,
    })
    expect(ended).toMatchObject({
      phase: 'ended',
      reason: 'finished',
      steps: 2,
      durationMs: 60_000,
    })
    expect(agentDriving()).toBe(false)
    expect(pilotLog().map((e) => e.kind)).toEqual([
      'system',
      'command',
      'narrate',
      'system',
    ])
  })

  it('refuses to start twice and ignores steps when not driving', () => {
    expect(start()).toEqual({ ok: true })
    expect(start()).toMatchObject({ ok: false })
    resetPilot()
    expect(notePilotStep('command', 'x')).toBe(-1)
    expect(endPilot('finished', {})).toBeUndefined()
  })
})
```

```ts
// packages/app/src/arcade/topics.test.ts
import { describe, expect, it } from 'vitest'
import { CINEMA_ALLOWED, cinemaPromptCard, isTopicId, LESSON_TOPICS, teachPromptCard, TOPIC_IDS, } from './topics'

describe('lesson topics', () => {
  it('has four P0 topics with goals, budgets and allow-lists', () => {
    expect(TOPIC_IDS).toEqual(['variations', 'affine', 'color', 'camera'])
    for (const id of TOPIC_IDS) {
      const t = LESSON_TOPICS[id]
      expect(t.goal.length).toBeGreaterThan(40)
      expect(t.stepBudget).toBeGreaterThanOrEqual(20)
      expect(t.allowed.length).toBeGreaterThan(0)
    }
    expect(isTopicId('color')).toBe(true)
    expect(isTopicId('audio')).toBe(false)
  })

  it('prompt cards name the tools the agent must call', () => {
    const card = teachPromptCard('affine')
    expect(card).toContain('arcade_start_lesson')
    expect(card).toContain('arcade_narrate')
    expect(card).toContain('arcade_end_lesson')
    expect(card).toContain('affine')
    const cinema = cinemaPromptCard('slow zoom into the core')
    expect(cinema).toContain('slow zoom into the core')
    expect(cinema).toContain('arcade_set_keyframes')
    expect(CINEMA_ALLOWED).toContain('timeline.')
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter chaos-master exec vitest run src/arcade`
Expected: FAIL — modules not found.

- [x] **Step 3: Implement `pilot.ts`**

```ts
// packages/app/src/arcade/pilot.ts
import { createSignal } from 'solid-js'
import type { RecordedSession } from '@/recorder/schema'

/**
 * "An agent is driving the editor" as one module-global state, the same way
 * `webmcp/contextBridge.ts` holds the command context: tools, the lock
 * overlay and the shortcut manager all read it, none of them own it.
 */
export type PilotMode = 'teach' | 'cinema' | 'duel' | 'beats'
export type PilotEndReason = 'finished' | 'stopped' | 'budget' | 'error'
export type PilotLogKind = 'command' | 'narrate' | 'error' | 'system'
export type PilotLogEntry = { t: number; kind: PilotLogKind; text: string }

export type PilotDriving = {
  phase: 'driving'
  mode: PilotMode
  topic?: string
  /** Banner title, e.g. "Teaching: Variations". */
  title: string
  startedAt: number
  steps: number
  stepBudget: number
  /** Exact command ids, or prefixes ending in ".", the guard accepts. */
  allowed: readonly string[]
  /** Index into guard.QUALITY_ORDER when the session started. */
  qualityRankAtStart: number
}

export type PilotEnded = {
  phase: 'ended'
  mode: PilotMode
  topic?: string
  reason: PilotEndReason
  title: string
  summary?: string
  sessionName?: string
  steps: number
  durationMs: number
}

export type PilotState = { phase: 'idle' } | PilotDriving | PilotEnded

export const MAX_PILOT_LOG = 50

const [pilot, setPilot] = createSignal<PilotState>({ phase: 'idle' })
const [pilotLog, setPilotLog] = createSignal<PilotLogEntry[]>([])
const [lastPilotSession, setLastPilotSession] = createSignal<
  RecordedSession | undefined
>()

export { pilot, pilotLog, lastPilotSession }

export const agentDriving = (): boolean => pilot().phase === 'driving'

export function drivingState(): PilotDriving | undefined {
  const s = pilot()
  return s.phase === 'driving' ? s : undefined
}

export function appendPilotLog(kind: PilotLogKind, text: string): void {
  setPilotLog((log) => [
    ...log.slice(-(MAX_PILOT_LOG - 1)),
    { t: Date.now(), kind, text },
  ])
}

export function startPilot(
  input: Omit<PilotDriving, 'phase' | 'startedAt' | 'steps'> & { now?: number },
): { ok: true } | { ok: false; error: string } {
  if (pilot().phase === 'driving') {
    return {
      ok: false,
      error: 'An Arcade session is already active. Finish or stop it first.',
    }
  }
  setPilotLog([])
  setLastPilotSession(undefined)
  setPilot({
    phase: 'driving',
    mode: input.mode,
    topic: input.topic,
    title: input.title,
    startedAt: input.now ?? performance.now(),
    steps: 0,
    stepBudget: input.stepBudget,
    allowed: input.allowed,
    qualityRankAtStart: input.qualityRankAtStart,
  })
  appendPilotLog('system', `${input.title} started`)
  return { ok: true }
}

/** Count one step. Returns the remaining budget, or -1 when nothing was counted. */
export function notePilotStep(
  kind: 'command' | 'narrate',
  text: string,
): number {
  const s = pilot()
  if (s.phase !== 'driving' || s.steps >= s.stepBudget) return -1
  setPilot({ ...s, steps: s.steps + 1 })
  appendPilotLog(kind, text)
  return s.stepBudget - (s.steps + 1)
}

export function pilotStepsRemaining(): number {
  const s = drivingState()
  return s ? Math.max(0, s.stepBudget - s.steps) : 0
}

export function pilotElapsedMs(now = performance.now()): number {
  const s = drivingState()
  return s ? Math.max(0, now - s.startedAt) : 0
}

export function endPilot(
  reason: PilotEndReason,
  extras: {
    title?: string
    summary?: string
    sessionName?: string
    session?: RecordedSession
    now?: number
  },
): PilotEnded | undefined {
  const s = pilot()
  if (s.phase !== 'driving') return undefined
  const ended: PilotEnded = {
    phase: 'ended',
    mode: s.mode,
    topic: s.topic,
    reason,
    title: extras.title ?? s.title,
    summary: extras.summary,
    sessionName: extras.sessionName,
    steps: s.steps,
    durationMs: Math.max(0, (extras.now ?? performance.now()) - s.startedAt),
  }
  setLastPilotSession(extras.session)
  setPilot(ended)
  appendPilotLog('system', `${ended.title}: ${reason}`)
  return ended
}

export function resetPilot(): void {
  setPilot({ phase: 'idle' })
  setPilotLog([])
  setLastPilotSession(undefined)
}
```

- [x] **Step 4: Implement `topics.ts`**

```ts
// packages/app/src/arcade/topics.ts
export type TopicId = 'variations' | 'affine' | 'color' | 'camera'

export interface LessonTopic {
  id: TopicId
  title: string
  /** Sent to the agent verbatim as the lesson goal. */
  goal: string
  /** Exact ids or prefixes ending in "." (see guard.isCommandAllowed). */
  allowed: readonly string[]
  stepBudget: number
  defaultStartFrom: 'blank' | 'current'
}

/** Commands every Arcade mode may use. */
export const ALWAYS_ALLOWED = [
  'lesson.note',
  'sidebar.open',
  'sidebar.close',
] as const

export const LESSON_TOPICS: Record<TopicId, LessonTopic> = {
  variations: {
    id: 'variations',
    title: 'Variations',
    goal: 'From a blank canvas, build a flame with three transforms that show three different variation families (for example linear, spherical and swirl). Change one weight and one parameter per transform so the viewer sees what each does. Narrate before each group of changes.',
    allowed: [
      'flame.addTransform',
      'flame.deleteTransform',
      'flame.addVariation',
      'flame.deleteVariation',
      'flame.setVariation',
      'flame.setVariationWeight',
      'flame.setVariationParams',
      'flame.setVariationVisible',
      'flame.setProbability',
      'flame.setColorSpeed',
      'camera.',
    ],
    stepBudget: 30,
    defaultStartFrom: 'blank',
  },
  affine: {
    id: 'affine',
    title: 'Affine transforms',
    goal: 'Show what the affine matrix does: on one transform demonstrate scale, rotation, shear and translation one at a time, then add a final transform and rotate it. Narrate what each coefficient means before changing it.',
    allowed: [
      'flame.addTransform',
      'flame.setTransformAffine',
      'flame.setAffine',
      'flame.setFinalAffine',
      'flame.setFinalTransform',
      'flame.applySymmetry',
      'flame.setProbability',
      'camera.',
    ],
    stepBudget: 30,
    defaultStartFrom: 'blank',
  },
  color: {
    id: 'color',
    title: 'Colour and tone',
    goal: 'Keep the current flame. Walk through colour: apply a palette, set one transform colour by hand, change colour speed, then tune exposure, gamma, vibrancy, contrast and background. Narrate the visual effect you expect before each change.',
    allowed: [
      'flame.applyPalette',
      'flame.removePalette',
      'flame.setTransformColor',
      'flame.setAllTransformColors',
      'flame.setColorSpeed',
      'flame.setExposure',
      'flame.setGamma',
      'flame.setVibrancy',
      'flame.setContrast',
      'flame.setBackgroundColor',
      'flame.setDrawMode',
    ],
    stepBudget: 25,
    defaultStartFrom: 'current',
  },
  camera: {
    id: 'camera',
    title: 'Camera and framing',
    goal: 'Keep the current flame. Centre it, zoom into one detail, zoom back out, then explain skip iterations and draw mode by changing each once. Narrate what the viewer should look at.',
    allowed: [
      'camera.',
      'flame.setSkipIters',
      'flame.setDrawMode',
      'view.setShowTimeline',
    ],
    stepBudget: 20,
    defaultStartFrom: 'current',
  },
}

export const TOPIC_IDS = Object.keys(LESSON_TOPICS) as TopicId[]

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === 'string' && value in LESSON_TOPICS
}

/** Same reset the Example 1 creation tour performs. */
export const BLANK_CANVAS_STEPS: readonly (readonly [string, ...unknown[]])[] =
  [
    ['flame.clearTransforms'],
    ['flame.setSkipIters', 1],
    ['flame.setExposure', 0.25],
    ['flame.setDrawMode', 'light'],
    ['camera.center'],
    ['camera.zoomTo', 1],
  ]

export const CINEMA_ALLOWED = [
  'timeline.',
  'camera.',
  'view.setShowTimeline',
  'flame.setExposure',
  'flame.setVibrancy',
  'flame.setContrast',
] as const
export const CINEMA_STEP_BUDGET = 40

export function teachPromptCard(topic: TopicId): string {
  return `Teach me ${LESSON_TOPICS[topic].title.toLowerCase()} in Lumen Apeiron. Call arcade_start_lesson with topic "${topic}", then build the example step by step using only the commands listed in the lesson brief. Before each group of changes call arcade_narrate with one sentence explaining what you are about to do and why. Check your work with get_flame. When done, call arcade_end_lesson with a short title and summary.`
}

export function cinemaPromptCard(description: string): string {
  const wish =
    description.trim() || 'a slow, cinematic move that suits this flame'
  return `Animate my current flame in Lumen Apeiron: ${wish}. Call arcade_start_cinema, then arcade_get_animatable_paths to see what you can keyframe, then arcade_set_keyframes with tracks that realise the description (use easing, keep it under 10 seconds unless I say otherwise), then play it with execute_command timeline.play. Narrate your choices with arcade_narrate. Ask me if you want changes, and finish with arcade_end_cinema.`
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter chaos-master exec vitest run src/arcade`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/app/src/arcade/pilot.ts packages/app/src/arcade/topics.ts packages/app/src/arcade/pilot.test.ts packages/app/src/arcade/topics.test.ts
git commit -m "feat(arcade): pilot state machine and lesson topic catalog"
```

---

### Task 5: Guard table

**Files:**

- Create: `packages/app/src/arcade/guard.ts`
- Test: `packages/app/src/arcade/guard.test.ts`

**Interfaces:**

- Produces: `QUALITY_ORDER`, `qualityRank(key: unknown): number`, `isCommandAllowed(commandId, allowed): boolean`, `guardCommand(commandId, args, state: PilotState): string | undefined`.

- [x] **Step 1: Write the failing test**

```ts
// packages/app/src/arcade/guard.test.ts
import { describe, expect, it } from 'vitest'
import { guardCommand, isCommandAllowed, qualityRank } from './guard'
import type { PilotState } from './pilot'

const driving: PilotState = {
  phase: 'driving',
  mode: 'teach',
  topic: 'variations',
  title: 'Teaching: Variations',
  startedAt: 0,
  steps: 0,
  stepBudget: 30,
  allowed: ['flame.addTransform', 'camera.', 'view.', 'lesson.note'],
  qualityRankAtStart: 1,
}

describe('guardCommand', () => {
  it('does nothing when nobody is driving', () => {
    expect(guardCommand('export.png', [], { phase: 'idle' })).toBeUndefined()
  })
  it('matches exact ids and dot-prefixes', () => {
    expect(isCommandAllowed('flame.addTransform', driving.allowed)).toBe(true)
    expect(isCommandAllowed('flame.addVariation', driving.allowed)).toBe(false)
    expect(isCommandAllowed('camera.zoomTo', driving.allowed)).toBe(true)
  })
  it('blocks exports, history and disallowed commands with a readable reason', () => {
    expect(guardCommand('export.png', [], driving)).toMatch(/not available/)
    expect(guardCommand('history.undo', [], driving)).toMatch(/not available/)
    expect(guardCommand('flame.setExposure', [0.5], driving)).toMatch(
      /not allowed in teach\/variations/,
    )
  })
  it('never raises quality above the starting preset', () => {
    expect(qualityRank('mid')).toBe(1)
    expect(
      guardCommand('view.setQualityPreset', ['low'], driving),
    ).toBeUndefined()
    expect(guardCommand('view.setQualityPreset', ['high'], driving)).toMatch(
      /Quality/,
    )
    expect(
      guardCommand('view.setQualityPreset', ['nonsense'], driving),
    ).toMatch(/Quality/)
  })
  it('locks point count, dimensions and quality render settings', () => {
    const s: PilotState = { ...driving, allowed: ['flame.'] }
    expect(
      guardCommand('flame.setRenderSetting', ['pointCount', 10], s),
    ).toMatch(/locked/)
    expect(
      guardCommand('flame.updateRenderSettings', [{ dimensions: 3 }], s),
    ).toMatch(/locked/)
    expect(
      guardCommand('flame.setRenderSetting', ['gamma', 2], s),
    ).toBeUndefined()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/arcade/guard.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `guard.ts`**

```ts
// packages/app/src/arcade/guard.ts
import type { PilotState } from './pilot'

/** Order of `components/Quality/QualityPresets.tsx` keys, lowest first. */
export const QUALITY_ORDER = ['low', 'mid', 'high', 'ultra'] as const

export function qualityRank(key: unknown): number {
  return typeof key === 'string'
    ? (QUALITY_ORDER as readonly string[]).indexOf(key)
    : -1
}

export function isCommandAllowed(
  commandId: string,
  allowed: readonly string[],
): boolean {
  return allowed.some((entry) =>
    entry.endsWith('.') ? commandId.startsWith(entry) : entry === commandId,
  )
}

const BLOCKED_PREFIXES = ['export.', 'history.'] as const
const LOCKED_RENDER_SETTING = /pointcount|dimensions|quality|resolution/i

/**
 * Pure policy for one agent-issued command. Returns the reason to refuse, or
 * undefined to let it through. Only applies while a pilot is driving.
 */
export function guardCommand(
  commandId: string,
  args: readonly unknown[],
  state: PilotState,
): string | undefined {
  if (state.phase !== 'driving') return undefined
  if (BLOCKED_PREFIXES.some((p) => commandId.startsWith(p))) {
    return `${commandId} is not available while the AI drives`
  }
  if (!isCommandAllowed(commandId, state.allowed)) {
    const scope = state.topic ? `${state.mode}/${state.topic}` : state.mode
    return `${commandId} is not allowed in ${scope}. Allowed: ${state.allowed.join(', ')}`
  }
  if (commandId === 'view.setQualityPreset') {
    const rank = qualityRank(args[0])
    if (rank < 0 || rank > state.qualityRankAtStart) {
      const cap =
        QUALITY_ORDER[state.qualityRankAtStart] ?? 'the starting preset'
      return `Quality can only stay at or below "${cap}" while the AI drives`
    }
  }
  if (
    commandId === 'flame.setRenderSetting' &&
    typeof args[0] === 'string' &&
    LOCKED_RENDER_SETTING.test(args[0])
  ) {
    return `Render setting "${args[0]}" is locked while the AI drives`
  }
  if (
    commandId === 'flame.updateRenderSettings' &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    Object.keys(args[0] as object).some((k) => LOCKED_RENDER_SETTING.test(k))
  ) {
    return 'Point count, dimensions and quality are locked while the AI drives'
  }
  return undefined
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter chaos-master exec vitest run src/arcade/guard.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/app/src/arcade/guard.ts packages/app/src/arcade/guard.test.ts
git commit -m "feat(arcade): command guard for agent-driven sessions"
```

---

### Task 6: Teach tools, shared finish action, driving gate

**Files:**

- Create: `packages/app/src/arcade/pilotActions.ts`
- Create: `packages/app/src/webmcp/tools/arcadeTeach.ts`
- Modify: `packages/app/src/webmcp/tools/executeCommand.ts` (guard + budget + step count)
- Modify: `packages/app/src/webmcp/registerWebMcp.ts` (`wrapTool` driving gate)
- Modify: `packages/app/src/webmcp/tools/index.ts` (register)
- Test: `packages/app/src/webmcp/tools/arcadeTeach.test.ts`

**Interfaces:**

- Produces: `finishPilot(ctx, reason, opts?)` from `@/arcade/pilotActions` returning `Promise<PilotEnded | { error: string }>`; tools `arcade_status`, `arcade_start_lesson`, `arcade_narrate`, `arcade_end_lesson`.
- Consumes: Task 3 seams, Task 4 pilot/topics, Task 5 guard, Task 2 `lesson.note`.

- [x] **Step 1: Write the failing test**

```ts
// packages/app/src/webmcp/tools/arcadeTeach.test.ts
import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentDriving, pilot, resetPilot } from '@/arcade/pilot'
import { cancelSessionRecording } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { wrapTool } from '@/webmcp/registerWebMcp'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { arcadeEndLesson, arcadeNarrate, arcadeStartLesson, arcadeStatus, } from './arcadeTeach'
import { executeCommandTool } from './executeCommand'
import { setFlame } from './setFlame'

function ctxWithRecorder() {
  const ctx = createMockCommandContext()
  const stopped = {
    version: 1,
    actions: [{ t: 0, id: 'flame.setExposure', args: [0.3] }],
  }
  ctx.recorder!.stop = vi.fn(() => stopped as never)
  setWebMcpContext(ctx)
  return ctx
}

describe('Teach tools', () => {
  afterEach(() => {
    resetPilot()
    cancelSessionRecording()
    clearWebMcpContext()
  })

  it('starts a lesson: recorder on, hub closed, blank canvas, brief returned', async () => {
    const ctx = ctxWithRecorder()
    const brief = (await arcadeStartLesson.execute(
      { topic: 'variations' },
      {},
    )) as Record<string, unknown>
    expect(brief).toMatchObject({
      ok: true,
      topic: 'variations',
      stepBudget: 30,
    })
    expect(ctx.recorder!.start).toHaveBeenCalledTimes(1)
    expect(ctx.arcade!.closeHub).toHaveBeenCalledTimes(1)
    expect(ctx.sidebar.setOpen).toHaveBeenCalledWith(true)
    expect(Object.keys(ctx.flameDescriptor().transforms)).toHaveLength(0)
    expect(agentDriving()).toBe(true)
  })

  it('rejects unknown topics and double starts', async () => {
    ctxWithRecorder()
    expect(
      await arcadeStartLesson.execute({ topic: 'audio' }, {}),
    ).toHaveProperty('error')
    await arcadeStartLesson.execute({ topic: 'color' }, {})
    expect(
      await arcadeStartLesson.execute({ topic: 'color' }, {}),
    ).toHaveProperty('error')
  })

  it('narrates and counts steps, guards execute_command, ends and saves', async () => {
    const ctx = ctxWithRecorder()
    await arcadeStartLesson.execute({ topic: 'color' }, {})
    expect(
      await arcadeNarrate.execute({ text: 'Warmer palette first.' }, {}),
    ).toMatchObject({ ok: true, steps: 1 })
    expect(
      await executeCommandTool.execute(
        { commandId: 'flame.setExposure', args: [0.3] },
        {},
      ),
    ).toMatchObject({ success: true, steps: 2 })
    expect(
      await executeCommandTool.execute(
        { commandId: 'flame.addTransform', args: ['linearVar'] },
        {},
      ),
    ).toHaveProperty('error')
    const status = (await arcadeStatus.execute({}, {})) as Record<
      string,
      unknown
    >
    expect(status).toMatchObject({
      phase: 'driving',
      mode: 'teach',
      topic: 'color',
      steps: 2,
      locked: true,
    })
    const ended = (await arcadeEndLesson.execute(
      { title: 'Warm tones', summary: 'Palette then exposure.' },
      {},
    )) as Record<string, unknown>
    expect(ended).toMatchObject({
      ok: true,
      steps: 2,
      sessionName: 'Lesson: Colour and tone — Warm tones',
    })
    expect(ctx.recorder!.save).toHaveBeenCalledWith(
      expect.anything(),
      'Lesson: Colour and tone — Warm tones',
    )
    expect(pilot().phase).toBe('ended')
    expect(await arcadeNarrate.execute({ text: 'late' }, {})).toHaveProperty(
      'error',
    )
  })

  it('gates non-arcade write tools while driving', async () => {
    ctxWithRecorder()
    await arcadeStartLesson.execute({ topic: 'color' }, {})
    const wrapped = wrapTool(setFlame)
    const result = (await wrapped.execute({ flame: {} }, {})) as {
      isError?: boolean
    }
    expect(result.isError).toBe(true)
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/webmcp/tools/arcadeTeach.test.ts`
Expected: FAIL — module `./arcadeTeach` not found.

- [x] **Step 3: Implement `pilotActions.ts`**

```ts
// packages/app/src/arcade/pilotActions.ts
import { clearNarration } from './narration'
import { appendPilotLog, drivingState, endPilot } from './pilot'
import { isTopicId, LESSON_TOPICS } from './topics'
import type { PilotDriving, PilotEnded, PilotEndReason } from './pilot'
import type { CommandContext } from '@/commands/types'

function topicTitle(s: PilotDriving): string | undefined {
  return isTopicId(s.topic) ? LESSON_TOPICS[s.topic].title : undefined
}

export function defaultPilotTitle(s: PilotDriving): string {
  return s.mode === 'cinema' ? 'Animation' : (topicTitle(s) ?? 'Lesson')
}

export function sessionNameFor(
  s: PilotDriving,
  title: string,
  reason: PilotEndReason,
): string {
  const kind = s.mode === 'cinema' ? 'Animation' : 'Lesson'
  const suffix = reason === 'finished' ? '' : ` (${reason})`
  const topic = topicTitle(s)
  return topic
    ? `${kind}${suffix}: ${topic} — ${title}`
    : `${kind}${suffix}: ${title}`
}

/**
 * The one way a driving session ends: stop the recorder, save what it
 * captured under a library name, move the pilot to `ended`. Used by the end
 * tools and by the Stop button, so both save the take.
 */
export async function finishPilot(
  ctx: CommandContext,
  reason: PilotEndReason,
  opts: { title?: string; summary?: string } = {},
): Promise<PilotEnded | { error: string }> {
  const s = drivingState()
  if (!s) return { error: 'No active Arcade session.' }
  const title = (opts.title ?? '').trim().slice(0, 80) || defaultPilotTitle(s)
  const session = ctx.recorder?.stop()
  let sessionName: string | undefined
  if (session) {
    sessionName = sessionNameFor(s, title, reason)
    try {
      await ctx.recorder?.save(session, sessionName)
    } catch (error) {
      console.warn('[arcade] could not save the session', error)
      appendPilotLog('error', 'Could not save the session to the library')
    }
  }
  clearNarration()
  const ended = endPilot(reason, {
    title,
    summary: opts.summary?.slice(0, 400),
    sessionName,
    session,
  })
  ctx.arcade?.toast(sessionName ? `Saved "${sessionName}"` : `${title} ended`)
  return ended ?? { error: 'No active Arcade session.' }
}
```

- [x] **Step 4: Implement `arcadeTeach.ts`**

```ts
// packages/app/src/webmcp/tools/arcadeTeach.ts
import { qualityRank } from '@/arcade/guard'
import { clearNarration, narration } from '@/arcade/narration'
import { agentDriving, drivingState, notePilotStep, pilot, pilotElapsedMs, pilotStepsRemaining, startPilot, } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { ALWAYS_ALLOWED, BLANK_CANVAS_STEPS, isTopicId, LESSON_TOPICS, TOPIC_IDS, } from '@/arcade/topics'
import { executeCommand, preflightReplayCommand } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

const NOT_READY = {
  error: 'Workspace not ready. The flame editor has not finished loading.',
}

export const arcadeStatus: WebMcpTool = {
  name: 'arcade_status',
  description:
    'Read the Arcade session state: phase (idle, driving, ended), mode, topic, steps used and remaining, elapsed time, whether the editor is locked, whether a recording is active, and the last narration. Call it when unsure what to do next.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: () => {
    const ctx = getWebMcpContext()
    const s = pilot()
    const driving = s.phase === 'driving' ? s : undefined
    return {
      phase: s.phase,
      mode: s.phase === 'idle' ? undefined : s.mode,
      topic: s.phase === 'idle' ? undefined : s.topic,
      title: s.phase === 'idle' ? undefined : s.title,
      steps: driving?.steps ?? (s.phase === 'ended' ? s.steps : 0),
      stepBudget: driving?.stepBudget,
      remaining: pilotStepsRemaining(),
      elapsedMs: Math.round(pilotElapsedMs()),
      locked: agentDriving(),
      recorderActive: ctx?.recorder?.isRecording() ?? false,
      narration: narration(),
      lastEnd:
        s.phase === 'ended'
          ? { reason: s.reason, sessionName: s.sessionName }
          : undefined,
    }
  },
}

export const arcadeStartLesson: WebMcpTool = {
  name: 'arcade_start_lesson',
  description:
    'Start a Teach session: locks the editor, starts recording, and returns the lesson brief (goal, allowed commands, step budget). Topics: variations, affine, color, camera. Then use arcade_narrate and execute_command, and finish with arcade_end_lesson.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', enum: TOPIC_IDS, description: 'Lesson topic' },
      startFrom: {
        type: 'string',
        enum: ['blank', 'current'],
        description:
          'Start from a blank canvas or the current flame (default depends on the topic)',
      },
    },
    required: ['topic'],
  },
  execute: (input) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    if (!ctx.recorder || !ctx.arcade)
      return { error: 'This workspace cannot record sessions.' }
    const raw = (input ?? {}) as { topic?: unknown; startFrom?: unknown }
    if (!isTopicId(raw.topic))
      return { error: `Unknown topic. Choose one of: ${TOPIC_IDS.join(', ')}` }
    const topic = LESSON_TOPICS[raw.topic]
    const startFrom =
      raw.startFrom === 'blank' || raw.startFrom === 'current'
        ? raw.startFrom
        : topic.defaultStartFrom
    if (agentDriving())
      return {
        error: 'An Arcade session is already active. Finish or stop it first.',
      }
    if (ctx.recorder.isRecording())
      return {
        error:
          'A recording is already running. Ask the user to stop it, then call arcade_start_lesson again.',
      }
    const started = ctx.recorder.start()
    if (!started.ok)
      return { error: `Could not start recording: ${started.reason}` }
    const allowed = [...topic.allowed, ...ALWAYS_ALLOWED]
    const pilotResult = startPilot({
      mode: 'teach',
      topic: topic.id,
      title: `Teaching: ${topic.title}`,
      stepBudget: topic.stepBudget,
      allowed,
      qualityRankAtStart: qualityRank(ctx.arcade.qualityPreset()),
    })
    if (!pilotResult.ok) {
      ctx.recorder.cancel()
      return { error: pilotResult.error }
    }
    clearNarration()
    ctx.arcade.closeHub()
    executeCommand('sidebar.open', ctx, true)
    if (startFrom === 'blank') {
      for (const [id, ...args] of BLANK_CANVAS_STEPS)
        executeCommand(id, ctx, ...args)
    }
    return {
      ok: true,
      topic: topic.id,
      goal: topic.goal,
      startFrom,
      allowedCommands: allowed,
      stepBudget: topic.stepBudget,
      tips: [
        'Call arcade_narrate with one sentence before each group of commands.',
        'Use execute_command with a commandId from allowedCommands; use list_commands with a prefix to see arguments.',
        'Check the result with get_flame; finish with arcade_end_lesson.',
      ],
    }
  },
}

export const arcadeNarrate: WebMcpTool = {
  name: 'arcade_narrate',
  description:
    'Say one sentence to the viewer about the step you are about to take. Shown live and recorded as a caption in the replay. Counts as one step of the budget. Only valid while an Arcade session is active.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'One sentence, at most 400 characters',
      },
    },
    required: ['text'],
  },
  execute: (input) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    const s = drivingState()
    if (!s)
      return {
        error:
          'No active Arcade session. Call arcade_start_lesson or arcade_start_cinema first.',
      }
    const text =
      typeof (input as { text?: unknown })?.text === 'string'
        ? (input as { text: string }).text.trim()
        : ''
    if (pilotStepsRemaining() <= 0)
      return {
        error:
          'Step budget exhausted. Finish now with arcade_end_lesson or arcade_end_cinema.',
      }
    const invalid = preflightReplayCommand('lesson.note', [text])
    if (invalid) return { error: invalid }
    executeCommand('lesson.note', ctx, text)
    const remaining = notePilotStep('narrate', text)
    return { ok: true, steps: s.steps + 1, remaining }
  },
}

export const arcadeEndLesson: WebMcpTool = {
  name: 'arcade_end_lesson',
  description:
    "Finish the Teach session: stops recording, saves the lesson to the user's library, unlocks the editor and shows the replay card. Provide a short title and a one-sentence summary.",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'At most 80 characters' },
      summary: { type: 'string', description: 'At most 400 characters' },
    },
  },
  execute: async (input) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    const s = drivingState()
    if (!s || s.mode !== 'teach') return { error: 'No active lesson.' }
    const raw = (input ?? {}) as { title?: unknown; summary?: unknown }
    const ended = await finishPilot(ctx, 'finished', {
      title: typeof raw.title === 'string' ? raw.title : undefined,
      summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    })
    if ('error' in ended) return ended
    return {
      ok: true,
      title: ended.title,
      sessionName: ended.sessionName,
      steps: ended.steps,
      durationMs: Math.round(ended.durationMs),
      replayHint:
        'The user can now replay the lesson from the end card or the Arcade library.',
    }
  },
}
```

- [x] **Step 5: Add guard, budget and step counting to `execute_command`**

Final `execute` body of `packages/app/src/webmcp/tools/executeCommand.ts`:

```ts
import { guardCommand } from '@/arcade/guard'
import { appendPilotLog, drivingState, notePilotStep, pilotStepsRemaining, } from '@/arcade/pilot'
import { executeCommand, getCommand, preflightReplayCommand, } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

function describeStep(commandId: string, args: unknown[]): string {
  const label = getCommand(commandId)?.label ?? commandId
  let rendered = ''
  try {
    rendered = JSON.stringify(args)
  } catch {
    rendered = ''
  }
  return rendered.length > 80
    ? `${label} ${rendered.slice(0, 77)}...`
    : `${label} ${rendered}`
}

// ... inside execute, after `commandId`/`args` are extracted:
const driving = drivingState()
if (driving) {
  const blocked = guardCommand(commandId, args, driving)
  if (blocked) {
    appendPilotLog('error', blocked)
    return { error: blocked }
  }
  if (pilotStepsRemaining() <= 0) {
    return {
      error:
        'Step budget exhausted. Finish now with arcade_end_lesson or arcade_end_cinema.',
    }
  }
}
const preflightError = preflightReplayCommand(commandId, args)
if (preflightError !== undefined) return { error: preflightError }
try {
  executeCommand(commandId, ctx, ...args)
} catch (e) {
  return {
    error: `Command failed: ${e instanceof Error ? e.message : String(e)}`,
  }
}
if (driving) {
  const remaining = notePilotStep('command', describeStep(commandId, args))
  return { success: true, commandId, steps: driving.steps + 1, remaining }
}
return { success: true, commandId }
```

- [x] **Step 6: Add the driving gate to `wrapTool`**

```ts
// packages/app/src/webmcp/registerWebMcp.ts
import { agentDriving } from '@/arcade/pilot'
// ...
const DRIVING_SAFE_TOOLS = new Set(['execute_command'])

export const wrapTool = (tool: WebMcpTool): WebMcpTool => ({
  ...tool,
  execute: async (args: unknown, context: { signal?: AbortSignal }) => {
    if (
      agentDriving() &&
      !tool.annotations?.readOnlyHint &&
      !tool.name.startsWith('arcade_') &&
      !DRIVING_SAFE_TOOLS.has(tool.name)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `${tool.name} is unavailable while an Arcade session is active. Use execute_command (guarded) or the arcade_* tools.`,
          },
        ],
        isError: true,
      }
    }
    try {
      const raw = await tool.execute(args, context)
      return toMcpResult(raw)
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `${tool.name} failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      }
    }
  },
})
```

- [x] **Step 7: Register the tools**

In `packages/app/src/webmcp/tools/index.ts` import `{ arcadeEndLesson, arcadeNarrate, arcadeStartLesson, arcadeStatus } from './arcadeTeach'`, add them to the `export { ... }` block, and to `allTools`: `arcadeStatus` in the read group (after `getUndoState`), the three write tools after `executeCommandTool`.

- [x] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter chaos-master exec vitest run src/webmcp src/arcade && pnpm typecheck`
Expected: PASS. `webmcp.test.ts` has a test that counts registered tools or checks description length; update the expected count if it is hard-coded (4 new tools).

- [x] **Step 9: Commit**

```bash
git add packages/app/src/arcade/pilotActions.ts packages/app/src/webmcp/tools/arcadeTeach.ts packages/app/src/webmcp/tools/arcadeTeach.test.ts packages/app/src/webmcp/tools/executeCommand.ts packages/app/src/webmcp/registerWebMcp.ts packages/app/src/webmcp/tools/index.ts packages/app/src/webmcp/webmcp.test.ts
git commit -m "feat(arcade): Teach tools, guarded execute_command, driving gate"
```

---

### Task 7: Pilot overlay (lock, Stop, live steps, end card) and shortcut gate

**Files:**

- Create: `packages/app/src/icons/stop.svg`, `packages/app/src/icons/robot.svg`
- Modify: `packages/app/src/icons/index.ts`
- Create: `packages/app/src/components/Arcade/pilotFormat.ts`
- Create: `packages/app/src/components/Arcade/PilotOverlay.tsx`, `PilotOverlay.module.css`
- Modify: `packages/app/src/shortcuts/useShortcutManager.ts`
- Modify: `packages/app/src/MainWorkspace.tsx` (mount overlay ~7705; recorder dock `Show` ~4824)
- Test: `packages/app/src/components/Arcade/pilotFormat.test.ts`

**Interfaces:**

- Produces: `<PilotOverlay ctx={cmdContext} />`; `formatElapsed(ms): string` ("0:42", "12:05"); `reasonLabel(reason): string`.
- Consumes: `pilot`, `drivingState`, `pilotLog`, `lastPilotSession`, `resetPilot`, `agentDriving` (Task 4); `finishPilot` (Task 6); `ctx.recorder.openReplay`, `ctx.arcade.openHub` (Task 3).

- [x] **Step 1: Write the failing test**

```ts
// packages/app/src/components/Arcade/pilotFormat.test.ts
import { describe, expect, it } from 'vitest'
import { formatElapsed, reasonLabel } from './pilotFormat'

describe('pilot formatting', () => {
  it('formats elapsed time as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(42_000)).toBe('0:42')
    expect(formatElapsed(725_400)).toBe('12:05')
  })
  it('labels end reasons for humans', () => {
    expect(reasonLabel('finished')).toBe('Finished')
    expect(reasonLabel('stopped')).toBe('Stopped by you')
    expect(reasonLabel('budget')).toBe('Step budget reached')
    expect(reasonLabel('error')).toBe('Ended after an error')
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/components/Arcade`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the helpers and icons**

```ts
// packages/app/src/components/Arcade/pilotFormat.ts
import type { PilotEndReason } from '@/arcade/pilot'

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function reasonLabel(reason: PilotEndReason): string {
  switch (reason) {
    case 'finished':
      return 'Finished'
    case 'stopped':
      return 'Stopped by you'
    case 'budget':
      return 'Step budget reached'
    case 'error':
      return 'Ended after an error'
  }
}
```

```svg
<!-- packages/app/src/icons/stop.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
```

```svg
<!-- packages/app/src/icons/robot.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><circle cx="9" cy="14" r="1.5"/><circle cx="15" cy="14" r="1.5"/><path d="M12 8V4M9 4h6M2 13h2M20 13h2"/></svg>
```

In `icons/index.ts` add `import Robot from './robot.svg'` and `import Stop from './stop.svg'` in alphabetical order, and add `Robot,` and `Stop,` to the `export { ... }` list.

- [x] **Step 4: Implement the overlay**

```tsx
// packages/app/src/components/Arcade/PilotOverlay.tsx
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { agentDriving, drivingState, lastPilotSession, pilot, pilotElapsedMs, pilotLog, resetPilot, } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { Robot, Stop } from '@/icons'
import { formatElapsed, reasonLabel } from './pilotFormat'
import ui from './PilotOverlay.module.css'
import type { PilotEnded } from '@/arcade/pilot'
import type { CommandContext } from '@/commands/types'

const ESC_ARM_MS = 1500

/**
 * Hard lock while an agent drives: a full-screen shield swallows pointer
 * input, the banner says what is happening, and Stop (or Esc twice) ends the
 * take and still saves it. When the pilot ends, the same component shows the
 * end card with Replay / Back to Arcade.
 */
export function PilotOverlay(props: { ctx: CommandContext }) {
  const [escArmed, setEscArmed] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  let escTimer: number | undefined
  let railEl: HTMLElement | undefined

  const stop = () => {
    void finishPilot(props.ctx, 'stopped')
  }

  createEffect(() => {
    if (!agentDriving()) return
    const tick = window.setInterval(() => setElapsed(pilotElapsedMs()), 1000)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      if (escArmed()) {
        setEscArmed(false)
        stop()
        return
      }
      setEscArmed(true)
      window.clearTimeout(escTimer)
      escTimer = window.setTimeout(() => setEscArmed(false), ESC_ARM_MS)
    }
    document.addEventListener('keydown', onKey, true)
    onCleanup(() => {
      window.clearInterval(tick)
      window.clearTimeout(escTimer)
      document.removeEventListener('keydown', onKey, true)
      setElapsed(0)
    })
  })

  createEffect(() => {
    pilotLog()
    railEl?.scrollTo({ top: railEl.scrollHeight })
  })

  const ended = () =>
    pilot().phase === 'ended' ? (pilot() as PilotEnded) : undefined

  return (
    <>
      <Show when={drivingState()}>
        {(s) => (
          <div
            class={ui.shield}
            role="dialog"
            aria-modal="true"
            aria-label="AI is driving the editor"
          >
            <div class={ui.banner}>
              <Robot class={ui.icon} aria-hidden="true" />
              <div class={ui.titleBlock}>
                <div class={ui.title}>{s().title}</div>
                <div class={ui.meta}>
                  step {s().steps} of {s().stepBudget} ·{' '}
                  {formatElapsed(elapsed())} · recording
                </div>
              </div>
              <button
                type="button"
                class={ui.stop}
                onClick={stop}
                aria-label="Stop the AI and keep what was recorded"
              >
                <Stop aria-hidden="true" />
                {escArmed() ? 'Press Esc again to stop' : 'Stop'}
              </button>
            </div>
            <aside
              class={ui.rail}
              aria-label="Steps so far"
              aria-live="polite"
              ref={railEl}
            >
              <For each={pilotLog()}>
                {(entry) => (
                  <div
                    classList={{
                      [ui.entry]: true,
                      [ui.narrate]: entry.kind === 'narrate',
                      [ui.error]: entry.kind === 'error',
                      [ui.system]: entry.kind === 'system',
                    }}
                  >
                    {entry.text}
                  </div>
                )}
              </For>
            </aside>
            <div class={ui.hint}>
              You are watching. Press Esc twice or Stop to take over.
            </div>
          </div>
        )}
      </Show>
      <Show when={ended()}>
        {(e) => (
          <div
            class={ui.endBackdrop}
            role="dialog"
            aria-modal="true"
            aria-label={`${e().title}: ${reasonLabel(e().reason)}`}
          >
            <div class={ui.endCard}>
              <h2 class={ui.endTitle}>{e().title}</h2>
              <p class={ui.endMeta}>
                {e().steps} steps · {formatElapsed(e().durationMs)} ·{' '}
                {reasonLabel(e().reason)}
              </p>
              <Show when={e().summary}>
                {(summary) => <p class={ui.endSummary}>{summary()}</p>}
              </Show>
              <Show when={e().sessionName}>
                {(name) => (
                  <p class={ui.endSaved}>Saved to your library as "{name()}"</p>
                )}
              </Show>
              <div class={ui.endActions}>
                <Show when={lastPilotSession()}>
                  {(session) => (
                    <button
                      type="button"
                      class={ui.primary}
                      onClick={() => {
                        const s = session()
                        resetPilot()
                        props.ctx.recorder?.openReplay(s)
                      }}
                    >
                      Replay
                    </button>
                  )}
                </Show>
                <button
                  type="button"
                  onClick={() => {
                    resetPilot()
                    props.ctx.arcade?.openHub()
                  }}
                >
                  Back to Arcade
                </button>
                <button type="button" onClick={resetPilot}>
                  Stay in the editor
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </>
  )
}
```

```css
/* packages/app/src/components/Arcade/PilotOverlay.module.css */
.shield {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: all;
  background: rgba(4, 6, 12, 0.35);
  backdrop-filter: blur(1px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-columns: 1fr 320px;
}
.banner {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  background: rgba(10, 14, 24, 0.92);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #f2f4f8;
  font:
    500 14px/1.3 system-ui,
    sans-serif;
}
.icon {
  width: 22px;
  height: 22px;
  color: #8ab4ff;
}
.titleBlock {
  flex: 1;
  min-width: 0;
}
.title {
  font-size: 15px;
  font-weight: 600;
}
.meta {
  font-size: 12px;
  opacity: 0.75;
}
.stop {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 90, 90, 0.6);
  background: rgba(160, 30, 30, 0.85);
  color: #fff;
  font:
    600 13px system-ui,
    sans-serif;
  cursor: pointer;
}
.stop:focus-visible {
  outline: 2px solid #ffb3b3;
  outline-offset: 2px;
}
.rail {
  grid-column: 2;
  grid-row: 2;
  margin: 12px;
  padding: 10px;
  overflow-y: auto;
  border-radius: 10px;
  background: rgba(10, 14, 24, 0.88);
  color: #dfe4ee;
  font:
    13px/1.4 system-ui,
    sans-serif;
}
.entry {
  padding: 6px 8px;
  border-left: 2px solid rgba(255, 255, 255, 0.15);
  margin-bottom: 4px;
}
.narrate {
  border-left-color: #8ab4ff;
  font-style: italic;
}
.error {
  border-left-color: #ff6b6b;
  color: #ffb3b3;
}
.system {
  opacity: 0.6;
}
.hint {
  grid-column: 1 / -1;
  padding: 8px 18px;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  font:
    12px system-ui,
    sans-serif;
  background: rgba(10, 14, 24, 0.7);
}
.endBackdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background: rgba(4, 6, 12, 0.6);
}
.endCard {
  width: min(520px, 92vw);
  padding: 24px;
  border-radius: 14px;
  background: #0f1422;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f2f4f8;
  font:
    14px/1.5 system-ui,
    sans-serif;
}
.endTitle {
  margin: 0 0 6px;
  font-size: 20px;
}
.endMeta,
.endSaved {
  margin: 0 0 8px;
  opacity: 0.75;
  font-size: 13px;
}
.endSummary {
  margin: 0 0 12px;
}
.endActions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}
.endActions button {
  padding: 9px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font:
    600 13px system-ui,
    sans-serif;
  cursor: pointer;
}
.primary {
  background: #2f6fed !important;
  border-color: #2f6fed !important;
}
```

- [x] **Step 5: Gate shortcuts and mount the overlay**

`packages/app/src/shortcuts/useShortcutManager.ts`: add `import { agentDriving } from '@/arcade/pilot'` and, as the first line of `onKeydown`, `if (agentDriving()) return`.

`packages/app/src/MainWorkspace.tsx`: import `{ PilotOverlay } from './components/Arcade/PilotOverlay'` and `{ agentDriving } from './arcade/pilot'`; render `<PilotOverlay ctx={cmdContext} />` immediately before `<Show when={showArena()}>` (~line 7705); change the recorder dock condition (~4824) to `<Show when={(recorderVisible() || isSessionRecording()) && !agentDriving()}>` (the pilot's Stop owns the take while driving, so hiding the dock cannot strand a recording).

- [x] **Step 6: Verify**

> Automated half done. The manual `pnpm start` half could not run in this environment: the dev server is HTTPS with a self-signed certificate (`@vitejs/plugin-basic-ssl`) that the agent's browser pane refuses. The same journey is covered by `tests/arcade.spec.ts` (Task 11), which runs against the production preview with `ignoreHTTPSErrors`.

Run: `pnpm --filter chaos-master exec vitest run src/components/Arcade && pnpm typecheck && pnpm lint`
Expected: PASS. Then `pnpm start`, open `http://localhost:5173/`, in the console run `await webmcp.execute('arcade_start_lesson', { topic: 'variations' })` — the banner and rail appear, clicks on the sidebar do nothing, `Ctrl+S` does nothing; run `await webmcp.execute('execute_command', { commandId: 'flame.addTransform', args: ['linearVar'] })` — a rail entry appears; click Stop — the end card shows "Stopped by you" and "Saved to your library as ...".

- [x] **Step 7: Commit**

```bash
git add packages/app/src/icons packages/app/src/components/Arcade packages/app/src/shortcuts/useShortcutManager.ts packages/app/src/MainWorkspace.tsx
git commit -m "feat(arcade): pilot lock overlay with Stop, live steps and end card"
```

---

### Task 8: Cinema tools (paths catalog, validated keyframes)

**Files:**

- Create: `packages/app/src/arcade/animatablePaths.ts`
- Create: `packages/app/src/webmcp/tools/arcadeCinema.ts`
- Modify: `packages/app/src/webmcp/testUtils.ts` (add `timeline.edit` mock)
- Modify: `packages/app/src/webmcp/tools/index.ts` (register)
- Test: `packages/app/src/arcade/animatablePaths.test.ts`, `packages/app/src/webmcp/tools/arcadeCinema.test.ts`

**Interfaces:**

- Produces from `@/arcade/animatablePaths`: `CatalogEntry`, `buildAnimatableCatalog(flame): CatalogEntry[]`, `SetKeyframesInput` (Valibot schema + type), `buildTimelineSnapshot(raw, catalog): { ok: true; snapshot; keyframeCount } | { ok: false; error }`, constants `MAX_CINEMA_FRAMES = 1800`, `MAX_CINEMA_TRACKS = 64`, `MAX_CINEMA_KEYFRAMES_PER_TRACK = 64`.
- Produces tools `arcade_start_cinema`, `arcade_get_animatable_paths`, `arcade_set_keyframes`, `arcade_end_cinema`.
- Path grammar (from `utils/timeline.ts` apply loop): bare `TIMELINE_PARAMETERS` paths (`exposure`, `camera.zoom`, ...), `transform.{tid}.preAffine.{a-f}`, `transform.{tid}.postAffine.{a-f}`, `transform.{tid}.color.{x|y}`, `transform.{tid}.probability`, `transform.{tid}.colorSpeed`, `{tid}.{vid}` (variation weight), `finalTransform.{a-f}`.

- [x] **Step 1: Write the failing tests**

```ts
// packages/app/src/arcade/animatablePaths.test.ts
import { describe, expect, it } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { buildAnimatableCatalog, buildTimelineSnapshot, } from './animatablePaths'

describe('animatable catalog', () => {
  const flame = createTestFlame()
  const catalog = buildAnimatableCatalog(flame)
  const paths = catalog.map((e) => e.path)

  it('lists render, camera, transform, variation and final paths with current values', () => {
    expect(paths).toContain('exposure')
    expect(paths).toContain('camera.zoom')
    expect(paths).toContain('transform.t1.preAffine.a')
    expect(paths).toContain('transform.t2.probability')
    expect(paths).toContain('t2.v2')
    expect(paths).toContain('finalTransform.a')
    expect(catalog.find((e) => e.path === 'exposure')?.current).toBe(0.25)
    expect(catalog.find((e) => e.path === 't2.v2')?.current).toBe(0.7)
  })

  it('builds a valid timeline snapshot from good input', () => {
    const built = buildTimelineSnapshot(
      {
        fps: 30,
        durationFrames: 120,
        loopMode: 'seamless',
        tracks: [
          {
            path: 'camera.zoom',
            keyframes: [
              { frame: 0, value: 1, easing: 'easeInOut' },
              { frame: 120, value: 2 },
            ],
          },
          {
            path: 't2.v2',
            keyframes: [
              { frame: 0, value: 0.7 },
              { frame: 60, value: 1.2, interp: 'spline' },
            ],
          },
        ],
      },
      catalog,
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.keyframeCount).toBe(4)
    expect(built.snapshot.config).toMatchObject({
      fps: 30,
      endFrame: 120,
      loopMode: 'seamless',
      loop: true,
    })
    expect(built.snapshot.tracks[0]).toMatchObject({
      parameterPath: 'camera.zoom',
    })
    expect(built.snapshot.tracks[0]?.keyframes[1]).toMatchObject({
      frame: 120,
      easing: 'linear',
      interp: 'linear',
    })
  })

  it('rejects unknown paths, frames past the end, wrong value types and duplicates', () => {
    const base = { durationFrames: 60 }
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [{ path: 'nope', keyframes: [{ frame: 0, value: 1 }] }],
        },
        catalog,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('Unknown path'),
    })
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [{ path: 'exposure', keyframes: [{ frame: 61, value: 1 }] }],
        },
        catalog,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('past durationFrames'),
    })
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [{ path: 'exposure', keyframes: [{ frame: 0, value: 'x' }] }],
        },
        catalog,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('expects a number'),
    })
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [
            { path: 'exposure', keyframes: [{ frame: 0, value: 1 }] },
            { path: 'exposure', keyframes: [{ frame: 0, value: 2 }] },
          ],
        },
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('twice') })
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [
            {
              path: 'exposure',
              keyframes: [
                { frame: 10, value: 1 },
                { frame: 10, value: 2 },
              ],
            },
          ],
        },
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('increasing') })
  })
})
```

```ts
// packages/app/src/webmcp/tools/arcadeCinema.test.ts
import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { pilot, resetPilot } from '@/arcade/pilot'
import { cancelSessionRecording } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { arcadeEndCinema, arcadeGetAnimatablePaths, arcadeSetKeyframes, arcadeStartCinema, } from './arcadeCinema'

describe('Cinema tools', () => {
  afterEach(() => {
    resetPilot()
    cancelSessionRecording()
    clearWebMcpContext()
  })

  it('starts, lists paths, applies keyframes through timeline.loadTimeline, ends', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    expect(await arcadeStartCinema.execute({}, {})).toMatchObject({
      ok: true,
      stepBudget: 40,
    })
    expect(ctx.recorder!.start).toHaveBeenCalledTimes(1)
    const paths = (await arcadeGetAnimatablePaths.execute({}, {})) as {
      render: { path: string }[]
      transforms: { id: string }[]
    }
    expect(paths.render.map((p) => p.path)).toContain('exposure')
    expect(paths.transforms.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(JSON.stringify(paths).length).toBeLessThan(2000)

    const result = await arcadeSetKeyframes.execute(
      {
        durationFrames: 90,
        tracks: [
          {
            path: 'camera.zoom',
            keyframes: [
              { frame: 0, value: 1 },
              { frame: 90, value: 1.8 },
            ],
          },
        ],
      },
      {},
    )
    expect(result).toMatchObject({
      ok: true,
      trackCount: 1,
      keyframeCount: 2,
      durationSeconds: 3,
    })
    expect(ctx.timeline.edit!.load).toHaveBeenCalledTimes(1)
    expect(
      await arcadeSetKeyframes.execute(
        {
          durationFrames: 90,
          tracks: [{ path: 'bogus', keyframes: [{ frame: 0, value: 1 }] }],
        },
        {},
      ),
    ).toHaveProperty('error')

    const ended = await arcadeEndCinema.execute({ title: 'Slow push-in' }, {})
    expect(ended).toMatchObject({
      ok: true,
      sessionName: 'Animation: Slow push-in',
    })
    expect(pilot().phase).toBe('ended')
  })

  it('refuses keyframes when no cinema session is active', async () => {
    setWebMcpContext(createMockCommandContext())
    expect(
      await arcadeSetKeyframes.execute({ durationFrames: 30, tracks: [] }, {}),
    ).toHaveProperty('error')
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter chaos-master exec vitest run src/arcade/animatablePaths.test.ts src/webmcp/tools/arcadeCinema.test.ts`
Expected: FAIL — modules not found.

- [x] **Step 3: Implement `animatablePaths.ts`**

```ts
// packages/app/src/arcade/animatablePaths.ts
import { EasingCurve, KeyframeInterpolation, tryValidateTimelineSnapshot, } from '@/flame/schema/timeline'
import { TIMELINE_PARAMETERS } from '@/utils/timeline'
import * as v from '@/valibot'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'

export type CatalogType = 'number' | 'string' | 'color'
export type CatalogEntry = {
  path: string
  type: CatalogType
  group: string
  current?: unknown
}

export const MAX_CINEMA_FRAMES = 1800
export const MAX_CINEMA_TRACKS = 64
export const MAX_CINEMA_KEYFRAMES_PER_TRACK = 64

const AFFINE_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const

function renderCurrent(flame: FlameDescriptor, path: string): unknown {
  const rs = flame.renderSettings as unknown as Record<string, unknown>
  const camera = rs.camera as
    | { position?: [number, number]; zoom?: number; rotation?: number }
    | undefined
  switch (path) {
    case 'camera.x':
      return camera?.position?.[0]
    case 'camera.y':
      return camera?.position?.[1]
    case 'camera.zoom':
      return camera?.zoom
    case 'camera.rotation':
      return camera?.rotation
    default:
      return rs[path]
  }
}

/** Every path the timeline can drive for this flame, with its current value. */
export function buildAnimatableCatalog(flame: FlameDescriptor): CatalogEntry[] {
  const entries: CatalogEntry[] = TIMELINE_PARAMETERS.map((p) => ({
    path: p.path,
    type: p.type === 'array' ? 'color' : p.type,
    group: p.group,
    current: renderCurrent(flame, p.path),
  }))
  for (const [tid, t] of Object.entries(flame.transforms ?? {})) {
    const group = `Transform ${tid}`
    for (const matrix of ['preAffine', 'postAffine'] as const) {
      const affine = t[matrix] as Record<string, number> | undefined
      for (const k of AFFINE_KEYS) {
        entries.push({
          path: `transform.${tid}.${matrix}.${k}`,
          type: 'number',
          group,
          current: affine?.[k],
        })
      }
    }
    entries.push({
      path: `transform.${tid}.probability`,
      type: 'number',
      group,
      current: t.probability,
    })
    entries.push({
      path: `transform.${tid}.colorSpeed`,
      type: 'number',
      group,
      current: t.colorSpeed,
    })
    entries.push({
      path: `transform.${tid}.color.x`,
      type: 'number',
      group,
      current: t.color?.x,
    })
    entries.push({
      path: `transform.${tid}.color.y`,
      type: 'number',
      group,
      current: t.color?.y,
    })
    for (const [vid, variation] of Object.entries(t.variations ?? {})) {
      entries.push({
        path: `${tid}.${vid}`,
        type: 'number',
        group: `${group} variations`,
        current: variation.weight,
      })
    }
  }
  const final = flame.finalTransform as Record<string, number> | undefined
  for (const k of AFFINE_KEYS) {
    entries.push({
      path: `finalTransform.${k}`,
      type: 'number',
      group: 'Final transform',
      current: final?.[k],
    })
  }
  return entries
}

const KeyframeInput = v.object({
  frame: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_CINEMA_FRAMES),
  ),
  value: v.union([
    v.number(),
    v.pipe(v.string(), v.maxLength(64)),
    v.tuple([v.number(), v.number(), v.number()]),
    v.tuple([v.number(), v.number(), v.number(), v.number()]),
  ]),
  easing: v.optional(EasingCurve),
  interp: v.optional(KeyframeInterpolation),
})

const TrackInput = v.object({
  path: v.pipe(v.string(), v.nonEmpty(), v.maxLength(512)),
  keyframes: v.pipe(
    v.array(KeyframeInput),
    v.minLength(1),
    v.maxLength(MAX_CINEMA_KEYFRAMES_PER_TRACK),
  ),
})

export const SetKeyframesInput = v.object({
  fps: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(60)),
    30,
  ),
  durationFrames: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(2),
    v.maxValue(MAX_CINEMA_FRAMES),
  ),
  loopMode: v.optional(v.picklist(['off', 'seamless', 'cycle']), 'off'),
  tracks: v.pipe(
    v.array(TrackInput),
    v.minLength(1),
    v.maxLength(MAX_CINEMA_TRACKS),
  ),
})
export type SetKeyframesInput = v.InferOutput<typeof SetKeyframesInput>

function valueType(value: unknown): CatalogType {
  return typeof value === 'number'
    ? 'number'
    : typeof value === 'string'
      ? 'string'
      : 'color'
}

/** Validate agent input against the catalog and produce a `timeline.loadTimeline` snapshot. */
export function buildTimelineSnapshot(
  raw: unknown,
  catalog: CatalogEntry[],
):
  | { ok: true; snapshot: TimelineSnapshot; keyframeCount: number }
  | { ok: false; error: string } {
  const parsed = v.safeParse(SetKeyframesInput, raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.issues
        .map((i) => i.message)
        .join('; ')
        .slice(0, 300)}`,
    }
  }
  const input = parsed.output
  const byPath = new Map(catalog.map((e) => [e.path, e]))
  const seen = new Set<string>()
  let keyframeCount = 0
  for (const track of input.tracks) {
    const entry = byPath.get(track.path)
    if (!entry)
      return {
        ok: false,
        error: `Unknown path "${track.path}". Call arcade_get_animatable_paths for the list.`,
      }
    if (seen.has(track.path))
      return { ok: false, error: `Path "${track.path}" appears twice.` }
    seen.add(track.path)
    let last = -1
    for (const k of track.keyframes) {
      if (k.frame > input.durationFrames) {
        return {
          ok: false,
          error: `Frame ${k.frame} on "${track.path}" is past durationFrames ${input.durationFrames}.`,
        }
      }
      if (k.frame <= last)
        return {
          ok: false,
          error: `Keyframes on "${track.path}" must have increasing, unique frames.`,
        }
      last = k.frame
      const actual = valueType(k.value)
      if (actual !== entry.type)
        return {
          ok: false,
          error: `"${track.path}" expects a ${entry.type} value, got ${actual}.`,
        }
      keyframeCount++
    }
  }
  const snapshot = {
    config: {
      fps: input.fps,
      timeScale: 1,
      startFrame: 0,
      endFrame: input.durationFrames,
      loop: true,
      autoFps: false,
      loopMode: input.loopMode,
    },
    currentFrame: 0,
    animationEnabled: true,
    tracks: input.tracks.map((t) => ({
      parameterPath: t.path,
      keyframes: t.keyframes.map((k) => ({
        frame: k.frame,
        value: k.value,
        easing: k.easing ?? 'linear',
        interp: k.interp ?? 'linear',
      })),
    })),
  }
  const validated = tryValidateTimelineSnapshot(snapshot)
  if (!validated)
    return {
      ok: false,
      error:
        'The timeline snapshot did not pass validation (a limit was exceeded).',
    }
  return { ok: true, snapshot: validated, keyframeCount }
}
```

- [x] **Step 4: Implement `arcadeCinema.ts`**

```ts
// packages/app/src/webmcp/tools/arcadeCinema.ts
import { buildAnimatableCatalog, buildTimelineSnapshot, MAX_CINEMA_FRAMES, MAX_CINEMA_KEYFRAMES_PER_TRACK, MAX_CINEMA_TRACKS, } from '@/arcade/animatablePaths'
import { qualityRank } from '@/arcade/guard'
import { clearNarration } from '@/arcade/narration'
import { agentDriving, drivingState, notePilotStep, pilotStepsRemaining, startPilot, } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { ALWAYS_ALLOWED, CINEMA_ALLOWED, CINEMA_STEP_BUDGET, } from '@/arcade/topics'
import { executeCommand, preflightReplayCommand } from '@/commands/registry'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { CatalogEntry } from '@/arcade/animatablePaths'
import type { WebMcpTool } from '@/webmcp/types'

const NOT_READY = {
  error: 'Workspace not ready. The flame editor has not finished loading.',
}
const EASINGS = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
]
const INTERPS = ['linear', 'constant', 'spline']

export const arcadeStartCinema: WebMcpTool = {
  name: 'arcade_start_cinema',
  description:
    'Start a Cinema session on the current flame: locks the editor, starts recording and opens the timeline. Then call arcade_get_animatable_paths, arcade_set_keyframes, play with execute_command commandId "timeline.play", and finish with arcade_end_cinema.',
  inputSchema: { type: 'object', properties: {} },
  execute: () => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    if (!ctx.recorder || !ctx.arcade)
      return { error: 'This workspace cannot record sessions.' }
    if (agentDriving())
      return {
        error: 'An Arcade session is already active. Finish or stop it first.',
      }
    if (ctx.recorder.isRecording())
      return {
        error: 'A recording is already running. Ask the user to stop it first.',
      }
    const started = ctx.recorder.start()
    if (!started.ok)
      return { error: `Could not start recording: ${started.reason}` }
    const allowed = [...CINEMA_ALLOWED, ...ALWAYS_ALLOWED]
    const result = startPilot({
      mode: 'cinema',
      title: 'Animating your flame',
      stepBudget: CINEMA_STEP_BUDGET,
      allowed,
      qualityRankAtStart: qualityRank(ctx.arcade.qualityPreset()),
    })
    if (!result.ok) {
      ctx.recorder.cancel()
      return { error: result.error }
    }
    clearNarration()
    ctx.arcade.closeHub()
    executeCommand('view.setShowTimeline', ctx, true)
    return {
      ok: true,
      stepBudget: CINEMA_STEP_BUDGET,
      allowedCommands: allowed,
      tips: [
        'Call arcade_get_animatable_paths first.',
        'arcade_set_keyframes replaces the whole animation; send all tracks each time.',
        'Keep it under 10 seconds unless asked; use easeInOut for camera moves.',
      ],
    }
  },
}

function summarize(
  catalog: CatalogEntry[],
  config: { fps: number; endFrame: number; loopMode?: string } | undefined,
) {
  const simple = (group: string) =>
    catalog
      .filter((e) => e.group === group)
      .map((e) => ({ path: e.path, type: e.type, current: e.current }))
  const transformIds = [
    ...new Set(
      catalog
        .filter((e) => e.path.startsWith('transform.'))
        .map((e) => e.path.split('.')[1]!),
    ),
  ]
  return {
    render: simple('Render'),
    palette: simple('Palette'),
    color: simple('Color'),
    camera: simple('Camera'),
    transforms: transformIds.map((id) => ({
      id,
      affine: `transform.${id}.preAffine.{a-f} | transform.${id}.postAffine.{a-f}`,
      other: [
        `transform.${id}.probability`,
        `transform.${id}.colorSpeed`,
        `transform.${id}.color.x`,
        `transform.${id}.color.y`,
      ],
      variations: catalog
        .filter((e) => e.group === `Transform ${id} variations`)
        .map((e) => ({ path: e.path, weight: e.current })),
    })),
    finalTransform: 'finalTransform.{a-f}',
    limits: {
      maxFrames: MAX_CINEMA_FRAMES,
      maxTracks: MAX_CINEMA_TRACKS,
      maxKeyframesPerTrack: MAX_CINEMA_KEYFRAMES_PER_TRACK,
      fps: '1-60',
    },
    easings: EASINGS,
    interps: INTERPS,
    current: config
      ? {
          fps: config.fps,
          durationFrames: config.endFrame,
          loopMode: config.loopMode ?? 'off',
        }
      : undefined,
  }
}

export const arcadeGetAnimatablePaths: WebMcpTool = {
  name: 'arcade_get_animatable_paths',
  description:
    'List every parameter path the timeline can keyframe for the current flame (render settings, palette, camera, per-transform affine coefficients, probability, colour, variation weights, final transform) with current values, limits, easing and interpolation names.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: () => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    return summarize(
      buildAnimatableCatalog(ctx.flameDescriptor()),
      ctx.timeline.edit?.snapshot().config,
    )
  },
}

export const arcadeSetKeyframes: WebMcpTool = {
  name: 'arcade_set_keyframes',
  description:
    'Replace the animation with the given tracks (validated against arcade_get_animatable_paths). fps 1-60, durationFrames 2-1800, loopMode off|seamless|cycle, each track { path, keyframes: [{ frame, value, easing?, interp? }] }. Applied as one undoable, recorded step. Requires an active Cinema session.',
  inputSchema: {
    type: 'object',
    properties: {
      fps: {
        type: 'integer',
        description: 'Frames per second, 1-60 (default 30)',
      },
      durationFrames: { type: 'integer', description: 'Total frames, 2-1800' },
      loopMode: { type: 'string', enum: ['off', 'seamless', 'cycle'] },
      tracks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            keyframes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  frame: { type: 'integer' },
                  value: {
                    description:
                      'number, string, or [r,g,b] / [r,g,b,a] for colour paths',
                  },
                  easing: { type: 'string', enum: EASINGS },
                  interp: { type: 'string', enum: INTERPS },
                },
                required: ['frame', 'value'],
              },
            },
          },
          required: ['path', 'keyframes'],
        },
      },
    },
    required: ['durationFrames', 'tracks'],
  },
  execute: (input) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    const s = drivingState()
    if (!s || s.mode !== 'cinema')
      return {
        error: 'No active Cinema session. Call arcade_start_cinema first.',
      }
    if (pilotStepsRemaining() <= 0)
      return {
        error: 'Step budget exhausted. Finish now with arcade_end_cinema.',
      }
    const built = buildTimelineSnapshot(
      input,
      buildAnimatableCatalog(ctx.flameDescriptor()),
    )
    if (!built.ok) return { error: built.error }
    const invalid = preflightReplayCommand('timeline.loadTimeline', [
      built.snapshot,
    ])
    if (invalid) return { error: invalid }
    executeCommand('timeline.loadTimeline', ctx, built.snapshot)
    executeCommand('timeline.setAnimationEnabled', ctx, true)
    const trackCount = built.snapshot.tracks.length
    const remaining = notePilotStep(
      'command',
      `Set ${trackCount} tracks, ${built.keyframeCount} keyframes`,
    )
    return {
      ok: true,
      trackCount,
      keyframeCount: built.keyframeCount,
      durationSeconds: Number(
        (built.snapshot.config.endFrame / built.snapshot.config.fps).toFixed(2),
      ),
      remaining,
      next: 'Play it with execute_command commandId "timeline.play"; narrate with arcade_narrate; finish with arcade_end_cinema.',
    }
  },
}

export const arcadeEndCinema: WebMcpTool = {
  name: 'arcade_end_cinema',
  description:
    "Finish the Cinema session: stops recording, saves the animation session to the user's library, unlocks the editor and shows the replay card. Provide a short title.",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'At most 80 characters' },
      summary: { type: 'string', description: 'At most 400 characters' },
    },
  },
  execute: async (input) => {
    const ctx = getWebMcpContext()
    if (!ctx) return NOT_READY
    const s = drivingState()
    if (!s || s.mode !== 'cinema') return { error: 'No active Cinema session.' }
    const raw = (input ?? {}) as { title?: unknown; summary?: unknown }
    const ended = await finishPilot(ctx, 'finished', {
      title: typeof raw.title === 'string' ? raw.title : undefined,
      summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    })
    if ('error' in ended) return ended
    return {
      ok: true,
      title: ended.title,
      sessionName: ended.sessionName,
      steps: ended.steps,
      durationMs: Math.round(ended.durationMs),
    }
  },
}
```

- [x] **Step 5: Mock the timeline edit seam and register**

In `testUtils.ts` add inside the `timeline` object: `edit: { snapshot: vi.fn(() => ({ config: { fps: 30, timeScale: 1, startFrame: 0, endFrame: 90, loop: true }, tracks: [] })), load: vi.fn() },`. In `tools/index.ts` import the four tools from `./arcadeCinema`, export them, and add `arcadeGetAnimatablePaths` to the read group and `arcadeStartCinema`, `arcadeSetKeyframes`, `arcadeEndCinema` after the Teach tools.

- [x] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter chaos-master exec vitest run src/arcade src/webmcp && pnpm typecheck`
Expected: PASS. If `tryValidateTimelineSnapshot` rejects `autoFps: false` or `loop` in your snapshot, read `flame/schema/timeline.ts:176-215` and match its field names exactly.

- [x] **Step 7: Commit**

```bash
git add packages/app/src/arcade/animatablePaths.ts packages/app/src/arcade/animatablePaths.test.ts packages/app/src/webmcp/tools/arcadeCinema.ts packages/app/src/webmcp/tools/arcadeCinema.test.ts packages/app/src/webmcp/testUtils.ts packages/app/src/webmcp/tools/index.ts
git commit -m "feat(arcade): Cinema tools with validated keyframe tracks"
```

---

### Task 9: Routing: `#arcade` tab and `/arcade` redirect

**Files:**

- Modify: `packages/app/src/lib/activeTab.ts`
- Modify: `packages/app/src/worker/index.ts` (after the `/benchmarks/` canonicalisation, ~line 380)
- Test: `packages/app/src/lib/activeTab.test.ts`

**Interfaces:**

- Produces: `AppTab = 'home' | 'workspace' | 'arcade'`, `ArcadeMode`, `tabFromHash(hash?)`, `arcadeModeFromHash(hash?)`, signal `arcadeMode()`, `setActiveTab(tab, mode?)`.

- [x] **Step 1: Write the failing test**

```ts
// packages/app/src/lib/activeTab.test.ts
import { describe, expect, it } from 'vitest'
import { arcadeModeFromHash, tabFromHash } from './activeTab'

describe('tab routing by fragment', () => {
  it('maps hashes to tabs', () => {
    expect(tabFromHash('')).toBe('workspace')
    expect(tabFromHash('#home')).toBe('home')
    expect(tabFromHash('#arcade')).toBe('arcade')
    expect(tabFromHash('#arcade=teach')).toBe('arcade')
    expect(tabFromHash('#arcadex')).toBe('workspace')
  })
  it('extracts only valid arcade modes', () => {
    expect(arcadeModeFromHash('#arcade=cinema')).toBe('cinema')
    expect(arcadeModeFromHash('#arcade=bogus')).toBeUndefined()
    expect(arcadeModeFromHash('#arcade')).toBeUndefined()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/lib/activeTab.test.ts`
Expected: FAIL — `tabFromHash` is not exported.

- [x] **Step 3: Implement**

Replace the relevant parts of `packages/app/src/lib/activeTab.ts` so it reads:

```ts
export type AppTab = 'home' | 'workspace' | 'arcade'
export type ArcadeMode = 'teach' | 'cinema' | 'duel' | 'beats'

const HOME_HASH = '#home'
const ARCADE_HASH = '#arcade'
const ARCADE_MODES: readonly ArcadeMode[] = ['teach', 'cinema', 'duel', 'beats']

export function tabFromHash(
  hash: string = globalThis.location?.hash ?? '',
): AppTab {
  if (hash === HOME_HASH) return 'home'
  if (hash === ARCADE_HASH || hash.startsWith(`${ARCADE_HASH}=`))
    return 'arcade'
  return 'workspace'
}

export function arcadeModeFromHash(
  hash: string = globalThis.location?.hash ?? '',
): ArcadeMode | undefined {
  const match = /^#arcade=([a-z]+)$/.exec(hash)
  const mode = match?.[1]
  return ARCADE_MODES.includes(mode as ArcadeMode)
    ? (mode as ArcadeMode)
    : undefined
}

const [activeTab, setActiveTabSignal] = createSignal<AppTab>(tabFromHash())
const [arcadeMode, setArcadeModeSignal] = createSignal<ArcadeMode | undefined>(
  arcadeModeFromHash(),
)

export { activeTab, arcadeMode }

function hashFor(tab: AppTab, mode?: ArcadeMode): string {
  if (tab === 'home') return HOME_HASH
  if (tab === 'arcade') return mode ? `${ARCADE_HASH}=${mode}` : ARCADE_HASH
  return ''
}

export function setActiveTab(tab: AppTab, mode?: ArcadeMode): void {
  setActiveTabSignal(tab)
  setArcadeModeSignal(tab === 'arcade' ? mode : undefined)
  const { location, history } = globalThis
  if (!location || !history) return
  const next = `${location.pathname}${location.search}${hashFor(tab, mode)}`
  if (`${location.pathname}${location.search}${location.hash}` !== next) {
    history.replaceState(history.state, '', next)
  }
}

globalThis.addEventListener?.('hashchange', () => {
  setActiveTabSignal(tabFromHash())
  setArcadeModeSignal(arcadeModeFromHash())
})

export const workspaceIsVisible = () => activeTab() === 'workspace'
```

Keep the existing doc comments. In `packages/app/src/worker/index.ts`, directly after the `/benchmarks/` redirect block:

```ts
// The Arcade has a real path for sharing, but the app routes tabs by
// fragment (lib/activeTab.ts), so hand it to the SPA as `#arcade`.
if (
  (pathname === '/arcade' || pathname === '/arcade/') &&
  (request.method === 'GET' || request.method === 'HEAD')
) {
  url.pathname = '/'
  url.hash = 'arcade'
  return Response.redirect(url.toString(), 308)
}
```

- [x] **Step 4: Verify**

Run: `pnpm --filter chaos-master exec vitest run src/lib && pnpm typecheck`
Expected: PASS. Then `pnpm --filter chaos-master exec wrangler dev --env dev` and in another shell `curl -sI http://localhost:8787/arcade | grep -i '^location'` — Expected: `location: http://localhost:8787/#arcade`. Stop wrangler afterwards (Ctrl+C in that shell).

- [x] **Step 5: Commit**

```bash
git add packages/app/src/lib/activeTab.ts packages/app/src/lib/activeTab.test.ts packages/app/src/worker/index.ts
git commit -m "feat(arcade): #arcade tab and /arcade redirect"
```

---

### Task 10: The hub

**Files:**

- Create: `packages/app/src/arcade/webmcpDetect.ts`, `packages/app/src/arcade/webmcpDetect.test.ts`
- Create: `packages/app/src/icons/film.svg`, `swords.svg`, `music.svg`; modify `icons/index.ts`
- Create: `packages/app/src/components/Arcade/WebMcpStatusPill.tsx`, `ArcadeModePanel.tsx`, `ArcadeHub.tsx`, `ArcadeHub.module.css`
- Modify: `packages/app/src/App.tsx` (next to the Home `Show`, ~line 291)

**Interfaces:**

- Produces: `detectWebMcp(win?): 'detected' | 'mock' | 'none'`; `<ArcadeHub initialMode onBackToEditor />`; `ARCADE_MODES` card list; `data-testid="arcade-card"` on cards, `data-testid="webmcp-status"` on the pill, `data-testid="prompt-card"` on the prompt block.
- Consumes: `teachPromptCard`, `cinemaPromptCard`, `TOPIC_IDS`, `LESSON_TOPICS` (Task 4); `setActiveTab`, `arcadeMode` (Task 9).

- [x] **Step 1: Write the failing test**

```ts
// packages/app/src/arcade/webmcpDetect.test.ts
import { describe, expect, it } from 'vitest'
import { detectWebMcp } from './webmcpDetect'

const fakeWindow = (overrides: Record<string, unknown>) =>
  ({ document: {}, navigator: {}, ...overrides }) as unknown as Window

describe('detectWebMcp', () => {
  it('reports the browser API, the dev mock, or nothing', () => {
    expect(detectWebMcp(fakeWindow({ document: { modelContext: {} } }))).toBe(
      'detected',
    )
    expect(detectWebMcp(fakeWindow({ navigator: { modelContext: {} } }))).toBe(
      'detected',
    )
    expect(detectWebMcp(fakeWindow({ webmcp: {} }))).toBe('mock')
    expect(detectWebMcp(fakeWindow({}))).toBe('none')
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/arcade/webmcpDetect.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement detection, icons, pill, panel, hub**

```ts
// packages/app/src/arcade/webmcpDetect.ts
export type WebMcpAvailability = 'detected' | 'mock' | 'none'

/** What the status pill shows. The dev mock is installed by registerWebMcp when the browser has no ModelContext. */
export function detectWebMcp(win: Window = window): WebMcpAvailability {
  const doc = win.document as unknown as { modelContext?: unknown }
  const nav = win.navigator as unknown as { modelContext?: unknown }
  if (doc.modelContext || nav.modelContext) return 'detected'
  if ((win as unknown as { webmcp?: unknown }).webmcp) return 'mock'
  return 'none'
}
```

Icons (same 24x24 stroke style as `stop.svg`; import and export each in `icons/index.ts` as `Film`, `Swords`, `Music`):

```svg
<!-- film.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>
<!-- swords.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 21 18v3h-3L6.5 9.5M5 14l-2 2M8 17l-2 2"/></svg>
<!-- music.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
```

```tsx
// packages/app/src/components/Arcade/WebMcpStatusPill.tsx
import { createSignal, onCleanup, onMount } from 'solid-js'
import { detectWebMcp } from '@/arcade/webmcpDetect'
import ui from './ArcadeHub.module.css'
import type { WebMcpAvailability } from '@/arcade/webmcpDetect'

const LABELS: Record<WebMcpAvailability, string> = {
  detected: 'WebMCP detected',
  mock: 'WebMCP dev mock active',
  none: 'WebMCP not detected',
}

export function WebMcpStatusPill() {
  const [state, setState] = createSignal<WebMcpAvailability>(detectWebMcp())
  onMount(() => {
    // The dev mock is installed when the workspace mounts, which can be after
    // the hub renders; re-check once.
    const t = window.setTimeout(() => setState(detectWebMcp()), 1500)
    onCleanup(() => window.clearTimeout(t))
  })
  return (
    <details class={ui.pill} data-state={state()} data-testid="webmcp-status">
      <summary aria-live="polite">{LABELS[state()]}</summary>
      <div class={ui.pillBody}>
        <p>
          Open this page in ChatGPT's desktop browser, or in Chrome 149+ with{' '}
          <code>chrome://flags/#enable-webmcp-testing</code> enabled. The Model
          Context Tool Inspector extension lets you call the tools by hand.
        </p>
        <p>WebGPU is required for rendering.</p>
      </div>
    </details>
  )
}
```

```tsx
// packages/app/src/components/Arcade/ArcadeModePanel.tsx
import { createSignal, For, Match, onMount, Show, Switch } from 'solid-js'
import { cinemaPromptCard, LESSON_TOPICS, teachPromptCard, TOPIC_IDS, } from '@/arcade/topics'
import { Copy, Cross } from '@/icons'
import ui from './ArcadeHub.module.css'
import type { TopicId } from '@/arcade/topics'
import type { ArcadeMode } from '@/lib/activeTab'

const TITLES: Record<ArcadeMode, string> = {
  teach: 'Teach',
  cinema: 'Cinema',
  duel: 'Duel',
  beats: 'Beats',
}
const STEPS = [
  'Copy the prompt and paste it into your AI chat (ChatGPT sidebar or Chrome).',
  'The AI takes the controls; the editor locks and records every step.',
  'When it finishes, replay the session, export a video, or keep building.',
]

function PromptCard(props: { text: string }) {
  const [copied, setCopied] = createSignal(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window
        .getSelection()
        ?.selectAllChildren(document.querySelector(`.${ui.promptText}`)!)
    }
  }
  return (
    <div class={ui.prompt} data-testid="prompt-card">
      <pre class={ui.promptText}>{props.text}</pre>
      <button
        type="button"
        class={ui.copy}
        onClick={() => void copy()}
        aria-label="Copy prompt to clipboard"
      >
        <Copy aria-hidden="true" />
        {copied() ? 'Copied' : 'Copy prompt'}
      </button>
    </div>
  )
}

export function ArcadeModePanel(props: {
  mode: ArcadeMode
  onClose: () => void
}) {
  const [topic, setTopic] = createSignal<TopicId>('variations')
  const [description, setDescription] = createSignal('')
  let closeButton: HTMLButtonElement | undefined
  onMount(() => closeButton?.focus())
  const ready = () => props.mode === 'teach' || props.mode === 'cinema'
  const prompt = () =>
    props.mode === 'teach'
      ? teachPromptCard(topic())
      : cinemaPromptCard(description())
  return (
    <aside
      class={ui.panel}
      role="dialog"
      aria-modal="true"
      aria-label={`${TITLES[props.mode]} mode`}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') {
          ev.stopPropagation()
          props.onClose()
        }
      }}
    >
      <header class={ui.panelHeader}>
        <h2>{TITLES[props.mode]}</h2>
        <button
          type="button"
          ref={closeButton}
          class={ui.iconButton}
          onClick={props.onClose}
          aria-label="Close panel"
        >
          <Cross aria-hidden="true" />
        </button>
      </header>
      <Switch>
        <Match when={props.mode === 'teach'}>
          <p>
            Pick a topic. The AI builds a small example step by step, narrating
            as it goes, and the recording becomes a lesson you can replay.
          </p>
          <div class={ui.chips} role="radiogroup" aria-label="Lesson topic">
            <For each={TOPIC_IDS}>
              {(id) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={topic() === id}
                  classList={{
                    [ui.chip]: true,
                    [ui.chipActive]: topic() === id,
                  }}
                  onClick={() => setTopic(id)}
                >
                  {LESSON_TOPICS[id].title}
                </button>
              )}
            </For>
          </div>
        </Match>
        <Match when={props.mode === 'cinema'}>
          <p>
            Describe the move you want. The AI reads your flame, keyframes it,
            and plays it back.
          </p>
          <label class={ui.field}>
            <span>Describe the animation</span>
            <textarea
              rows={3}
              value={description()}
              onInput={(ev) => setDescription(ev.currentTarget.value)}
              placeholder="slow zoom into the core while the palette drifts from ember to violet, 8 seconds, seamless loop"
            />
          </label>
        </Match>
        <Match when={!ready()}>
          <p>
            {TITLES[props.mode]} is on the roadmap: it arrives after the
            hackathon build. Teach and Cinema are live today.
          </p>
        </Match>
      </Switch>
      <Show when={ready()}>
        <PromptCard text={prompt()} />
        <ol class={ui.steps}>
          <For each={STEPS}>{(s) => <li>{s}</li>}</For>
        </ol>
      </Show>
    </aside>
  )
}
```

```tsx
// packages/app/src/components/Arcade/ArcadeHub.tsx
import { createEffect, createSignal, For, onCleanup, onMount, Show, } from 'solid-js'
import { Book, CameraIcon, Film, Lineage, Music, Swords } from '@/icons'
import { arcadeMode, setActiveTab } from '@/lib/activeTab'
import { ArcadeModePanel } from './ArcadeModePanel'
import ui from './ArcadeHub.module.css'
import { WebMcpStatusPill } from './WebMcpStatusPill'
import type { Component } from 'solid-js'
import type { ArcadeMode } from '@/lib/activeTab'

type CardId = ArcadeMode | 'arena' | 'director'
type CardDef = {
  id: CardId
  title: string
  tagline: string
  tag: string
  ready: boolean
  icon: Component<{ class?: string }>
}

export const ARCADE_MODES: CardDef[] = [
  {
    id: 'teach',
    title: 'Teach',
    tagline:
      'The AI builds a flame step by step and records a lesson you can replay.',
    tag: 'AI drives',
    ready: true,
    icon: Book,
  },
  {
    id: 'cinema',
    title: 'Cinema',
    tagline:
      'Describe a move; the AI keyframes a cinematic animation of your flame.',
    tag: 'AI drives',
    ready: true,
    icon: Film,
  },
  {
    id: 'duel',
    title: 'Duel',
    tagline: 'Race the AI to the most beautiful flame against the clock.',
    tag: 'You + AI',
    ready: false,
    icon: Swords,
  },
  {
    id: 'beats',
    title: 'Beats',
    tagline: 'The AI wires your flame to a song so it dances.',
    tag: 'AI drives',
    ready: false,
    icon: Music,
  },
  {
    id: 'arena',
    title: 'Arena',
    tagline: 'Flames clash on real stats; the winner gets a shareable card.',
    tag: 'Roadmap',
    ready: false,
    icon: CameraIcon,
  },
  {
    id: 'director',
    title: 'Director',
    tagline: 'The AI learns your taste and evolves flames toward it.',
    tag: 'Roadmap',
    ready: false,
    icon: Lineage,
  },
]

export function ArcadeHub(props: {
  initialMode?: ArcadeMode
  onBackToEditor: () => void
}) {
  const [open, setOpen] = createSignal<ArcadeMode | undefined>(
    props.initialMode,
  )
  createEffect(() => setOpen(arcadeMode()))
  onMount(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || open()) return
      props.onBackToEditor()
    }
    document.addEventListener('keydown', onKey)
    onCleanup(() => document.removeEventListener('keydown', onKey))
  })
  return (
    <section class={ui.hub} aria-label="Lumen Arcade">
      <header class={ui.header}>
        <h1 class={ui.wordmark}>Lumen Arcade</h1>
        <p class={ui.promise}>
          Hand the controls to an AI. It builds, teaches, animates. You watch,
          replay, and keep everything.
        </p>
        <WebMcpStatusPill />
      </header>
      <div class={ui.grid}>
        <For each={ARCADE_MODES}>
          {(card) => (
            <button
              type="button"
              class={ui.card}
              classList={{ [ui.cardDisabled]: !card.ready }}
              data-testid="arcade-card"
              data-mode={card.id}
              disabled={!card.ready}
              aria-disabled={!card.ready}
              onClick={() => {
                if (card.ready) setActiveTab('arcade', card.id as ArcadeMode)
              }}
            >
              <div class={ui.art} data-mode={card.id}>
                <card.icon class={ui.artIcon} />
              </div>
              <div class={ui.cardTitle}>{card.title}</div>
              <div class={ui.cardTagline}>{card.tagline}</div>
              <div class={ui.cardTag}>{card.ready ? card.tag : 'Roadmap'}</div>
            </button>
          )}
        </For>
      </div>
      <footer class={ui.footer}>
        <button type="button" onClick={props.onBackToEditor}>
          Back to editor
        </button>
        <a
          href="https://github.com/chaos-matters/chaos-master/blob/main/docs/webmcp.md"
          target="_blank"
          rel="noreferrer"
        >
          How it works
        </a>
      </footer>
      <Show when={open()}>
        {(mode) => (
          <ArcadeModePanel
            mode={mode()}
            onClose={() => setActiveTab('arcade')}
          />
        )}
      </Show>
    </section>
  )
}
```

```css
/* packages/app/src/components/Arcade/ArcadeHub.module.css */
.hub {
  position: fixed;
  inset: 0;
  z-index: 9000;
  overflow-y: auto;
  padding: 48px clamp(16px, 5vw, 72px);
  color: #f2f4f8;
  font:
    15px/1.5 system-ui,
    sans-serif;
  background:
    radial-gradient(
      120% 80% at 50% 0%,
      rgba(80, 40, 140, 0.55),
      rgba(6, 8, 14, 0.92) 60%
    ),
    rgba(6, 8, 14, 0.88);
}
.header {
  display: grid;
  gap: 10px;
  justify-items: center;
  text-align: center;
  margin-bottom: 36px;
}
.wordmark {
  margin: 0;
  font-size: clamp(32px, 5vw, 56px);
  font-weight: 300;
  letter-spacing: 0.04em;
}
.promise {
  margin: 0;
  max-width: 60ch;
  opacity: 0.85;
}
.pill {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 4px 14px;
  font-size: 13px;
}
.pill[data-state='detected'] {
  border-color: #45c17a;
  color: #a6f0c4;
}
.pill[data-state='none'] {
  border-color: #e2a53a;
  color: #ffd98a;
}
.pill summary {
  cursor: pointer;
  list-style: none;
}
.pillBody {
  max-width: 46ch;
  text-align: left;
  padding: 10px 0 4px;
  font-size: 13px;
  opacity: 0.9;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  max-width: 1180px;
  margin: 0 auto;
}
@media (max-width: 1100px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .hub {
    padding: 28px 16px;
  }
}
.card {
  display: grid;
  gap: 8px;
  text-align: left;
  padding: 0 0 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 120ms ease,
    border-color 120ms ease;
}
.card:hover:not(:disabled),
.card:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.35);
  outline: none;
}
.cardDisabled {
  opacity: 0.45;
  cursor: default;
}
.art {
  display: grid;
  place-items: center;
  height: 120px;
  background: linear-gradient(135deg, #2a1f5e, #7a2f7f 60%, #e0742f);
}
.art[data-mode='cinema'] {
  background: linear-gradient(135deg, #0f2f4f, #1e6f8f 60%, #7fd3e8);
}
.art[data-mode='duel'] {
  background: linear-gradient(135deg, #3f0f1f, #a02040 60%, #ff8a5c);
}
.art[data-mode='beats'] {
  background: linear-gradient(135deg, #1f0f3f, #6b2fb0 60%, #ff5fbf);
}
.art[data-mode='arena'] {
  background: linear-gradient(135deg, #1f1f0f, #7a6a20 60%, #ffd35c);
}
.art[data-mode='director'] {
  background: linear-gradient(135deg, #0f2f1f, #2f8f5f 60%, #9cf0b5);
}
.artIcon {
  width: 40px;
  height: 40px;
  color: rgba(255, 255, 255, 0.92);
}
.cardTitle {
  padding: 0 16px;
  font-size: 18px;
  font-weight: 600;
}
.cardTagline {
  padding: 0 16px;
  font-size: 13px;
  opacity: 0.8;
}
.cardTag {
  padding: 0 16px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
}
.footer {
  display: flex;
  justify-content: center;
  gap: 18px;
  margin-top: 36px;
}
.footer button,
.footer a {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  text-decoration: none;
  font:
    600 13px system-ui,
    sans-serif;
  cursor: pointer;
}
.panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 100vw);
  z-index: 9100;
  padding: 20px 22px;
  overflow-y: auto;
  background: #0f1422;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.45);
}
.panelHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panelHeader h2 {
  margin: 0;
  font-size: 22px;
}
.iconButton {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: inherit;
  font:
    13px system-ui,
    sans-serif;
  cursor: pointer;
}
.chipActive {
  background: #2f6fed;
  border-color: #2f6fed;
}
.field {
  display: grid;
  gap: 6px;
  margin: 12px 0;
  font-size: 13px;
}
.field textarea {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font:
    14px/1.4 system-ui,
    sans-serif;
  resize: vertical;
}
.prompt {
  display: grid;
  gap: 8px;
  margin: 14px 0;
}
.promptText {
  margin: 0;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  white-space: pre-wrap;
  font:
    13px/1.5 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}
.copy {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  border: none;
  background: #2f6fed;
  color: #fff;
  font:
    600 13px system-ui,
    sans-serif;
  cursor: pointer;
}
.steps {
  padding-left: 18px;
  font-size: 13px;
  opacity: 0.85;
}
```

Mount in `packages/app/src/App.tsx` right after the Home `<Show>` (imports: `ArcadeHub` from `./components/Arcade/ArcadeHub`, `arcadeMode` from `./lib/activeTab`; `activeTab` and `setActiveTab` are already imported there):

```tsx
<Show when={activeTab() === 'arcade' && !showWelcome()}>
  <ArcadeHub
    initialMode={arcadeMode()}
    onBackToEditor={() => setActiveTab('workspace')}
  />
</Show>
```

- [x] **Step 4: Verify**

> Automated half done. The manual `pnpm start` half could not run in this environment: the dev server is HTTPS with a self-signed certificate (`@vitejs/plugin-basic-ssl`) that the agent's browser pane refuses to load. The same checks (six cards, the status pill, the Teach prompt card) are asserted by `tests/arcade.spec.ts` (Task 11) against the production preview build.

Run: `pnpm --filter chaos-master exec vitest run src/arcade && pnpm typecheck && pnpm lint`
Expected: PASS. Then `pnpm start`, open `http://localhost:5173/#arcade`: six cards (four greyed), the pill reads "WebMCP dev mock active" after ~2 s, Teach opens the panel with topic chips and a prompt; Copy puts the text on the clipboard; Esc closes the panel; Esc again returns to the editor; `#arcade=cinema` opens the Cinema panel directly. Resize to 700 px: two columns, the panel is full width.

- [x] **Step 5: Commit**

```bash
git add packages/app/src/arcade/webmcpDetect.ts packages/app/src/arcade/webmcpDetect.test.ts packages/app/src/icons packages/app/src/components/Arcade packages/app/src/App.tsx
git commit -m "feat(arcade): hub with mode cards, prompt cards and WebMCP status"
```

---

### Task 11: Playwright journeys through `window.webmcp`

**Files:**

- Create: `tests/arcade.spec.ts`

**Interfaces:**

- Consumes: `window.webmcp.execute(name, input)` (returns the MCP envelope `{ content: [{ type: 'text', text }], isError? }`), the `data-testid`s from Task 10, dialog labels from Task 7.

- [x] **Step 1: Write the spec**

```ts
// tests/arcade.spec.ts
import { dismissWelcomeIfPresent, expect, test } from './helpers'
import type { Page } from '@playwright/test'

type Envelope = { content: { type: string; text: string }[]; isError?: boolean }

async function callTool(
  page: Page,
  name: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const envelope = await page.evaluate(
    async ([n, i]) => {
      const win = window as unknown as {
        webmcp: { execute: (name: string, input: unknown) => Promise<Envelope> }
      }
      return await win.webmcp.execute(n as string, i)
    },
    [name, input] as const,
  )
  return JSON.parse(envelope.content[0]!.text) as Record<string, unknown>
}

async function openEditor(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissWelcomeIfPresent(page, 12_000)
  await page.waitForFunction(() => 'webmcp' in window, undefined, {
    timeout: 20_000,
  })
}

test.describe('Lumen Arcade', () => {
  test('hub renders six cards and the WebMCP status pill', async ({ page }) => {
    await page.goto('/#arcade', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)
    await expect(page.getByTestId('arcade-card')).toHaveCount(6)
    await expect(page.getByTestId('webmcp-status')).toContainText(/WebMCP/)
    await page.getByTestId('arcade-card').filter({ hasText: 'Teach' }).click()
    await expect(page.getByTestId('prompt-card')).toContainText(
      'arcade_start_lesson',
    )
  })

  test('Teach: start, drive, narrate, end, replay card', async ({ page }) => {
    await openEditor(page)
    const brief = await callTool(page, 'arcade_start_lesson', {
      topic: 'variations',
    })
    expect(brief).toMatchObject({ ok: true, topic: 'variations' })
    const lock = page.getByRole('dialog', { name: 'AI is driving the editor' })
    await expect(lock).toBeVisible()
    await expect(lock).toContainText('Teaching: Variations')

    expect(
      await callTool(page, 'execute_command', {
        commandId: 'flame.addTransform',
        args: ['linearVar'],
      }),
    ).toMatchObject({ success: true })
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'flame.addTransform',
        args: ['sphericalVar'],
      }),
    ).toMatchObject({ success: true })
    expect(
      await callTool(page, 'arcade_narrate', {
        text: 'Two transforms, two families.',
      }),
    ).toMatchObject({ ok: true })
    await expect(lock).toContainText('Two transforms, two families.')
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'view.setQualityPreset',
        args: ['ultra'],
      }),
    ).toHaveProperty('error')
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'export.png',
        args: [],
      }),
    ).toHaveProperty('error')

    const ended = await callTool(page, 'arcade_end_lesson', {
      title: 'Two families',
      summary: 'Linear plus spherical.',
    })
    expect(ended).toMatchObject({
      ok: true,
      sessionName: 'Lesson: Variations — Two families',
    })
    const card = page.getByRole('dialog', { name: /Two families: Finished/ })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Saved to your library')
    expect(await callTool(page, 'arcade_status', {})).toMatchObject({
      phase: 'ended',
      locked: false,
    })
    await card.getByRole('button', { name: 'Replay' }).click()
    await expect(card).toBeHidden()
  })

  test('Stop ends the lesson and keeps the recording', async ({ page }) => {
    await openEditor(page)
    await callTool(page, 'arcade_start_lesson', { topic: 'color' })
    await page.getByRole('button', { name: /Stop the AI/ }).click()
    await expect(
      page.getByRole('dialog', { name: /Stopped by you/ }),
    ).toBeVisible()
    expect(
      await callTool(page, 'arcade_narrate', { text: 'too late' }),
    ).toHaveProperty('error')
  })

  test('Cinema: paths, keyframes, end', async ({ page }) => {
    await openEditor(page)
    expect(await callTool(page, 'arcade_start_cinema', {})).toMatchObject({
      ok: true,
    })
    const paths = await callTool(page, 'arcade_get_animatable_paths', {})
    expect(JSON.stringify(paths)).toContain('camera.zoom')
    const set = await callTool(page, 'arcade_set_keyframes', {
      fps: 30,
      durationFrames: 60,
      loopMode: 'seamless',
      tracks: [
        {
          path: 'camera.zoom',
          keyframes: [
            { frame: 0, value: 1, easing: 'easeInOut' },
            { frame: 60, value: 1.6 },
          ],
        },
      ],
    })
    expect(set).toMatchObject({ ok: true, trackCount: 1, keyframeCount: 2 })
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'timeline.play',
        args: [],
      }),
    ).toMatchObject({ success: true })
    expect(
      await callTool(page, 'arcade_end_cinema', { title: 'Push-in' }),
    ).toMatchObject({ ok: true, sessionName: 'Animation: Push-in' })
    await expect(
      page.getByRole('dialog', { name: /Push-in: Finished/ }),
    ).toBeVisible()
  })
})
```

- [x] **Step 2: Run it**

Run: `pnpm test:e2e -- tests/arcade.spec.ts`
Expected: PASS (the config builds and serves the app on `https://localhost:4173`; first run takes a few minutes). If `timeline.play` is rejected by preflight because it is marked `recordable: false`, replace that assertion with `execute_command` of `timeline.setCurrentFrame` `[10]` and keep the rest.

- [x] **Step 3: Commit**

```bash
git add tests/arcade.spec.ts
git commit -m "test(arcade): Playwright journeys for hub, Teach and Cinema"
```

---

### Task 12: `docs/webmcp.md` and the `animate_clash` write fix (F2)

**Files:**

- Create: `docs/webmcp.md`
- Modify: `packages/app/src/webmcp/tools/animateClash.ts:70,180`
- Modify: `README.md` (one link line under the features list)

- [ ] **Step 1: Fix `animate_clash` to go through commands**

Replace `ctx.setFlameDescriptor(() => deepClone(round1Flame), 'Animate 3D Clash')` with `executeCommand('flame.load', ctx, deepClone(round1Flame), 'Animate 3D Clash')` and `ctx.timeline.setTracks(tracks)` with:

```ts
const base = ctx.timeline.edit?.snapshot()
if (base) {
  executeCommand('timeline.loadTimeline', ctx, { ...base, tracks })
} else {
  ctx.timeline.setTracks(tracks)
}
```

(import `executeCommand` from `@/commands/registry`). Run `pnpm --filter chaos-master exec vitest run src/webmcp` — Expected: PASS; if a test asserted `setTracks` was called, change it to assert `timeline.edit.load` was called.

- [ ] **Step 2: Write `docs/webmcp.md`**

```markdown
# WebMCP in Lumen Apeiron

Lumen Apeiron registers tools on `document.modelContext` (WebMCP) so an agent in ChatGPT's desktop browser or in Chrome (149+, `chrome://flags/#enable-webmcp-testing`) can drive the fractal flame editor: read the flame, execute editor commands, and run the Arcade modes. Every write goes through the app's command registry, so the semantic session recorder captures agent work as a replayable `.steps.json`.

## Prior work vs hackathon work (WebMCP Challenge, submission period Aug 25 – Sep 3, 2026)

| Area                                                                                  | Status     | Where                                                                                                      | Evidence                                                                                   |
| ------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Command registry, 88 editor commands, hardened replay validation                      | Prior work | `packages/app/src/commands/`                                                                               | commits before 2026-08-25                                                                  |
| Semantic session recorder, timed replay, follow-cam, video export, PNG-embedded steps | Prior work | `packages/app/src/recorder/`, `utils/sessionsDB.ts`                                                        | commits before 2026-08-25                                                                  |
| Timeline, audio wiring, sonification, genetics, 3D, custom WGSL variations            | Prior work | `packages/app/src/flame/`, `utils/timeline.ts`                                                             | commits before 2026-08-25                                                                  |
| WebMCP foundation and 22 tools (`get_flame` ... `animate_clash`)                      | Hackathon  | `packages/app/src/webmcp/`                                                                                 | `git log --since=2026-08-25 -- packages/app/src/webmcp` (first commit ff6dff0, 2026-09-01) |
| Arena and Art Director overlays                                                       | Hackathon  | `components/ArenaOverlay.tsx`, `components/DirectorOverlay.tsx`                                            | same log                                                                                   |
| Lumen Arcade: hub, pilot lock, Teach and Cinema tools, `lesson.note`                  | Hackathon  | `packages/app/src/arcade/`, `components/Arcade/`, `webmcp/tools/arcade*.ts`, `commands/builtins/lesson.ts` | `git log --since=2026-09-02 -- packages/app/src/arcade`                                    |

Verify with `git log --format='%h %ad %s' --date=iso --since=2026-08-25 -- packages/app/src/webmcp packages/app/src/arcade`.

## Tool catalog

| Tool                                                                                                                                    | Kind  | Purpose                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------- |
| `get_flame`, `get_flame_detail`                                                                                                         | read  | Compact / paginated view of the active flame                                      |
| `list_commands`                                                                                                                         | read  | Command ids, labels, descriptions, prefixes                                       |
| `execute_command`                                                                                                                       | write | Run any registered command (validated, guarded while the Arcade drives, recorded) |
| `set_flame`, `randomize_flame`, `mutate_flame`, `undo`, `redo`, `load_share_link`, `create_share_link`, `diff_flames`, `get_undo_state` | mixed | Document-level tools                                                              |
| `score_flame`, `score_clash_round`, `simulate_clash`, `create_clash_flame`, `animate_clash`, `open_arena`                               | mixed | Arena (roadmap: grounded stats)                                                   |
| `breed_flames`, `create_custom_variation`, `open_art_director`                                                                          | mixed | Genetics and Director (roadmap: taste loop)                                       |
| `arcade_status`                                                                                                                         | read  | Pilot phase, steps, lock, narration                                               |
| `arcade_start_lesson`, `arcade_narrate`, `arcade_end_lesson`                                                                            | write | Teach mode                                                                        |
| `arcade_start_cinema`, `arcade_get_animatable_paths`, `arcade_set_keyframes`, `arcade_end_cinema`                                       | mixed | Cinema mode                                                                       |

## Try it

1. Open `https://lumenapeiron.com/arcade` in ChatGPT's desktop browser, or in Chrome with the flag above (the Model Context Tool Inspector extension lists the tools). WebGPU is required.
2. Pick Teach, choose a topic, copy the prompt, paste it into the agent chat. The editor locks while the AI works; Stop (or Esc twice) hands control back and keeps the recording.
3. Replay the lesson from the end card; export a video from the recorder dock.
4. Developers: without a WebMCP browser, `window.webmcp.execute(name, input)` calls any tool (dev mock). Tests: `pnpm --filter chaos-master exec vitest run src/webmcp src/arcade`, `pnpm test:e2e -- tests/arcade.spec.ts`.

## Limits

Tool descriptions ≤ 500 chars; results kept under ~1.5 KB; step budgets per mode; quality never raised by the agent; exports blocked while driving; a reload ends any Arcade session.
```

Add to `README.md` features list: `- WebMCP: an AI agent can drive the editor and the Arcade modes. See [docs/webmcp.md](docs/webmcp.md).`

- [ ] **Step 3: Commit**

```bash
git add docs/webmcp.md README.md packages/app/src/webmcp/tools/animateClash.ts
git commit -m "docs(webmcp): prior vs hackathon work, tool catalog; fix animate_clash writes"
```

---

### Task 13: Verification, merge, deploy, submission

**Files:** none new. This task is the release checklist; each box is a real check with the command that proves it.

- [ ] **Step 1: Full local verification**

```bash
pnpm typecheck && pnpm lint && pnpm --filter chaos-master exec vitest run && pnpm test:e2e -- tests/arcade.spec.ts tests/smoke.spec.ts
git diff main --name-only | xargs grep -lP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' || echo "no emoji"
```

Expected: all green; "no emoji".

- [ ] **Step 2: Manual, Chrome + flag (this machine)**

Enable `chrome://flags/#enable-webmcp-testing`, install the Model Context Tool Inspector extension, open `http://localhost:5173/#arcade` from `pnpm start`. Check: the pill reads "WebMCP detected"; the inspector lists 30 tools; run `arcade_start_lesson` with `variations` from the inspector, then three `execute_command` calls and `arcade_end_lesson`; the end card appears; Replay plays with captions (narration lines) and the follow-cam. Run `arcade_start_cinema`, `arcade_get_animatable_paths`, one `arcade_set_keyframes`, `timeline.play`; the flame animates.

- [ ] **Step 3: Manual, ChatGPT desktop (other machine)**

Open the deployed preview or `lumenapeiron.com/arcade` in ChatGPT's in-app browser. Confirm WebGPU renders (a flame is visible). Paste the Teach prompt for `variations`; watch the agent drive; confirm narration appears live and the lesson saves. If WebGPU is missing there, note it in the submission text and film in Chrome instead.

- [ ] **Step 4: Merge and deploy**

```bash
git fetch origin && git rebase origin/feature/webmcp-ui
gh pr create --base main --head feat/hackathon-webmcp-designs --title "feat: Lumen Arcade (WebMCP Teach and Cinema modes)" --body-file docs/webmcp.md
```

Before merging: smoke the 3D engine change from PR #137 by loading two 3D example flames on the preview URL and comparing against `main` visually; if it regresses, revert `02ecf84` and `8aedee2`'s `transformFunction3D.ts` hunk in a follow-up commit on this branch. Merge (squash off; keep dated commits for the rules). After CI deploys: `curl -sI https://lumenapeiron.com/arcade | grep -i '^location'` shows `/#arcade`; open it, the hub loads.

- [ ] **Step 5: Submission assets**

Record the < 3 min video (storyboard in `10-plan1-detailed-spec.md` §12) in ChatGPT desktop or Chrome, 1080p, with voice-over; upload to YouTube (public). Write the Devpost text from spec §12; link the repo (AGPL license file present), the live URL `https://lumenapeiron.com/arcade`, and `docs/webmcp.md`. Submit before **Sep 3, 22:00 CEST**.
