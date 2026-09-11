# Phase B: the shell, back and lifecycle — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in one session, in order. Steps use checkbox (`- [ ]`) syntax for tracking. Do not spawn subagents.

**Goal:** Give the native app a shell (Create and Library reachable on every device class, a More menu that is the same everywhere), one back registry that the Android back gesture and the sheets' downward drags pop in a fixed order and that ends in `minimizeApp()` rather than in `history.back()`, a draft that survives the OS killing the WebView, and a cross-fade when the layout crosses the rail-or-deck threshold.

**Architecture:** Pure logic first (the back registry, the lifecycle ports, the draft envelope), each with table tests. Then the layers register themselves with the registry (modals, the drawer, the rail's detents, Home, the Arcade). Then the two shell components on top (`ShellBar` for phones, `NavRail` for tablets) and their mounting. Lifecycle reaches Capacitor through `packages/mobile-runtime` behind the literal `__NATIVE_BUILD__` guard, the same way haptics and saving do.

**Tech Stack:** SolidJS 1.9, TypeScript, CSS modules, Vitest + `@solidjs/testing-library` (happy-dom), pnpm workspaces, Capacitor 8 (`@capacitor/app` 8.1.1, already a dependency of `packages/mobile`; it becomes a dependency of `packages/mobile-runtime` in Task 2).

**Spec:** `docs/plans/mobile-native/DESIGN.md` section 4 (Phase B) and section 12 (the cut list: "Library as a new destination" is cut, so Library is the existing Home tab made reachable; "Play" ships nothing in this phase), plus the research at `~/agent-out/chaos-master-fp/2026-09-11/lumen-native-plan/`: `A/screens.md` sections 0.5 (back and the layer stack) and 27 (nav), `B/components.md` sections 9 (the tablet navigation rail) and 10 (the shell tab bar), `B/motion.md` section 2.5 (tab change). Read those four before Task 1. The drawn version is `~/foss/disjoint-colliders/packages/showcase-gallery/gallery-viewer/lumen-native.html`, section `#nav`.

## Decisions this plan takes (record any change in the PR body)

- **Destinations are Create and Library, plus More.** Create is `activeTab() === 'workspace'`, Library is `activeTab() === 'home'` (the existing Home tab: Recent, Examples, Community). Play is not shown: the Arcade needs WebMCP, Play with audio only is a later phase, and an empty destination is worse than none. The bar's model keeps room for it (`ShellDestination` is a union, not a boolean).
- **More is one list.** The items the top bar's More menu builds today (`TouchHUD.tsx` `moreItems()`) move to `components/Shell/moreMenu.ts` and both the top bar and the shell bar's More circle render that list. Adding an item once shows it in both.
- **The back registry is a stack of handlers that the layers push and dispose themselves.** Nothing inspects the DOM for `dialog[open]`. Order falls out of construction: whatever opened last is on top.
- **Pause saves a draft; nothing else pauses.** The app has no autosave, so "flush autosave" means writing the current flame to storage when the app goes to the background and offering it back on the next cold start. Rendering needs no explicit stop: the platforms suspend `requestAnimationFrame` for a hidden WebView, and `finalRenderInterval` already parks the loop when the workspace is covered.
- **The cross-fade is CSS on mount, and the rail's detent lives outside the rail.** A 180 ms fade-in on whichever surface mounts (rail or deck), and a module-level detent signal so the rail remounts at the detent it had.
- **Settings on the tablet rail opens the existing HelpModal** (`showHelp`). Phase C redesigns settings; this phase only routes to them.

## Global constraints

- Branch `feat/native-shell`, created from `origin/feat/native-rail` (at `f28e98d3` or a later commit on that branch). The PR targets `feat/native-rail` on `Komediruzecki/chaos-master-fp`, never `main` and never the upstream repository. Never merge, never push a tag, never force-push, never retarget a PR.
- Commit per task with the messages given. **No `Co-Authored-By` or any other trailer.** The user is the sole author.
- `pnpm check` (from the repo root: typecheck, lint:fix, fmt:fix, WGSL validation) must pass before every commit; it rewrites files, so run it, then stage. `pnpm --filter chaos-master exec vitest run` must pass before every commit.
- No emojis anywhere: code, copy, comments, commit messages. Icons are the SVG components in `packages/app/src/icons/index.ts`; add a new SVG under `packages/app/src/icons/` if one is missing (this plan needs a Create glyph and a Library glyph; `GridIcon` may serve for Library; `Menu` or the existing More glyph serves More; a Settings glyph exists if HelpModal's row has one, else add `settings.svg`), never an emoji.
- Copy in product voice, no hype. The destinations are labelled `Create`, `Library`, `More`, `Settings`. No new user-visible string may contain "Chaos Master".
- Every tappable control is 40 x 40 CSS px minimum (48 dp on Android through `data-platform`, which `index.tsx` writes); measure the touch box, not the glyph. Values inside native chrome are in px, never rem.
- New CSS uses only `--la-*` tokens for colour, radius, spacing, duration and easing. No hex literal in the new Shell stylesheets (extend `tokens.test.ts` to cover them). Never `transition: all`. `prefers-reduced-motion` removes the cross-fade and the capsule's expand animation.
- A haptic call is never awaited. Anything that imports `@capacitor/*` is reached only through a dynamic import guarded by the literal `__NATIVE_BUILD__` in the same module (see `packages/app/src/lib/haptics.ts` `loadHaptics`). After Task 2 the web build must contain no `@capacitor` code: `grep -l '@capacitor' packages/app/dist/assets/*.js` prints nothing.
- **Never call `history.back()`** from any code this plan adds. `setActiveTab` uses `replaceState` on purpose.
- Do not edit anything under `packages/mobile/ios/` or `packages/mobile/android/`.
- Do not start browsers or dev servers; the reviewer verifies layout in a browser and on devices. Wrap any command that could hang in `timeout <seconds>`.
- Absolute dates only (today is 2026-09-11). Comments explain why, in the density of the surrounding code.

## File structure

| File                                                                                                         | Responsibility                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `packages/app/src/lib/backStack.ts` (new) + `backStack.test.ts`                                              | The back registry: push a handler, pop the top one, depth signal.                                              |
| `packages/mobile-runtime/src/lifecycle.ts` (new) + `lifecycle.test.ts`                                       | `LifecyclePorts` (back button, pause, resume, minimize) and the web fallback built on `visibilitychange`.      |
| `packages/mobile-runtime/src/capacitor/lifecycle.ts` (new)                                                   | `LifecyclePorts` bound to `@capacitor/app`. Exported as `@chaos-master/mobile-runtime/capacitor-lifecycle`.    |
| `packages/app/src/lib/lifecycle.ts` (new) + `lifecycle.test.ts`                                              | The app facade: the guarded runtime load, the back button wired to the registry, `appActive`, pause callbacks. |
| `packages/app/src/lib/draft.ts` (new) + `draft.test.ts`                                                      | Save the current flame on pause, read it back on launch, through `parseFlameEnvelope`.                         |
| `packages/app/src/components/Shell/moreMenu.ts` (new) + `moreMenu.test.ts`                                   | The one More list, built from the handlers a host has.                                                         |
| `packages/app/src/components/Shell/ShellBar.tsx` (new) + `ShellBar.module.css` (new) + `ShellBar.test.tsx`   | The phone shell: the full bar on Library, the capsule in Create, the expanded bar over the rail.               |
| `packages/app/src/components/Shell/NavRail.tsx` (new) + `NavRail.module.css` (new) + `NavRail.test.tsx`      | The tablet's permanent 80 px navigation rail.                                                                  |
| `packages/app/src/components/TouchSurface/EditorRail.tsx` + `detents.ts`                                     | The module-level detent signal, the leading slot for the capsule, the rail's back handlers.                    |
| `packages/app/src/components/TouchSurface/TouchHUD.tsx`                                                      | Renders the shared More list; the menu and the tooltip push back handlers.                                     |
| `packages/app/src/components/Modal/Modal.tsx`, `AdvancedToolsDrawer`, `Home/HomeTab.tsx`, `Arcade/ArcadeHub` | Each layer pushes a back handler while open.                                                                   |
| `packages/app/src/MainWorkspace.tsx`, `App.tsx`, `App.module.css`, `index.tsx`                               | Mounting the shell, the cross-fade, the draft save and restore, the lifecycle load.                            |
| `packages/app/src/styles/designSystem/lumen.css`                                                             | The shell tokens that do not exist yet (`--la-shell-h`, `--la-capsule`), reusing `--la-navrail-w`.             |
| `docs/plans/mobile-native/DESIGN.md`, `README.md`, this file                                                 | Ticks and status.                                                                                              |

---

### Task 0: Branch and workspace

**Files:** none.

- [ ] **Step 1:** From the worktree you were started in, verify the base and create the branch.

```bash
git fetch origin
git checkout -b feat/native-shell origin/feat/native-rail
git log --oneline -1   # must be f28e98d3 "chore(release): app 0.9.12" or a later commit on feat/native-rail
```

- [ ] **Step 2:** Install dependencies if `node_modules` is missing in this worktree, then confirm the baseline is green.

```bash
[ -d node_modules ] || timeout 900 pnpm install --frozen-lockfile
timeout 1800 pnpm --filter chaos-master exec vitest run 2>&1 | tail -5   # 2603 tests passed at f28e98d3
```

---

### Task 1: The back registry

**Files:**

- Create: `packages/app/src/lib/backStack.ts`
- Test: `packages/app/src/lib/backStack.test.ts`

**Interfaces:**

- Produces: `pushBackHandler(handler: () => void, label: string): () => void`, `popBack(): boolean`, `backDepth: Accessor<number>`, `backLabels(): readonly string[]` (for tests and the debug overlay).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { backDepth, backLabels, popBack, pushBackHandler } from './backStack'

describe('backStack', () => {
  it('pops the most recently pushed handler first, once', () => {
    const calls: string[] = []
    const disposeSheet = pushBackHandler(() => calls.push('sheet'), 'sheet')
    const disposeMenu = pushBackHandler(() => calls.push('menu'), 'menu')
    expect(backDepth()).toBe(2)
    expect(popBack()).toBe(true)
    expect(calls).toEqual(['menu'])
    // A handler is not removed by being popped: the layer that pushed it
    // removes it when it actually closes. Here the menu never closed.
    expect(backDepth()).toBe(2)
    disposeMenu()
    expect(popBack()).toBe(true)
    expect(calls).toEqual(['menu', 'sheet'])
    disposeSheet()
    expect(backDepth()).toBe(0)
  })

  it('returns false when nothing is registered, and never touches history', () => {
    const back = vi.spyOn(history, 'back')
    expect(popBack()).toBe(false)
    expect(back).not.toHaveBeenCalled()
  })

  it('disposing out of order removes the right entry', () => {
    const a = pushBackHandler(() => {}, 'a')
    const b = pushBackHandler(() => {}, 'b')
    const c = pushBackHandler(() => {}, 'c')
    b()
    expect(backLabels()).toEqual(['a', 'c'])
    a()
    c()
    expect(backLabels()).toEqual([])
  })

  it('disposing twice is harmless', () => {
    const a = pushBackHandler(() => {}, 'a')
    a()
    a()
    expect(backDepth()).toBe(0)
  })
})
```

- [ ] **Step 2: Run them to see them fail** — `timeout 300 pnpm --filter chaos-master exec vitest run src/lib/backStack.test.ts` fails with "Failed to resolve import".

- [ ] **Step 3: Implement**

```ts
import { createSignal } from 'solid-js'

interface BackEntry {
  readonly handler: () => void
  readonly label: string
}

/**
 * One registry for "back". The Android back gesture, a sheet's downward drag
 * and the iOS edge swipe all pop it, and every layer that can be dismissed
 * pushes itself while it is open: a modal, the drawer, the top bar's menu,
 * the rail's detents, Home over the editor. The order is the order things
 * opened, so the newest layer answers first. When the stack is empty the
 * app minimises (lib/lifecycle.ts); nothing here ever calls history.back(),
 * because the tab switches use replaceState and "back" must leave the app,
 * not retrace which tab you looked at.
 */
const [entries, setEntries] = createSignal<readonly BackEntry[]>([])

export const backDepth = () => entries().length
export const backLabels = () => entries().map((entry) => entry.label)

export function pushBackHandler(
  handler: () => void,
  label: string,
): () => void {
  const entry: BackEntry = { handler, label }
  setEntries((list) => [...list, entry])
  return () => {
    setEntries((list) => list.filter((candidate) => candidate !== entry))
  }
}

/** Runs the top handler. False when there was nothing to pop. */
export function popBack(): boolean {
  const top = entries().at(-1)
  if (!top) return false
  top.handler()
  return true
}
```

- [ ] **Step 4: Run the tests** — all four pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(app): a back registry the layers push themselves onto"`.

---

### Task 2: Lifecycle ports, the Capacitor binding and the app facade

**Files:**

- Create: `packages/mobile-runtime/src/lifecycle.ts`, `packages/mobile-runtime/src/lifecycle.test.ts`, `packages/mobile-runtime/src/capacitor/lifecycle.ts`
- Modify: `packages/mobile-runtime/package.json` (exports `./lifecycle`, `./capacitor-lifecycle`; dependency `@capacitor/app` `^8.1.1`, then `pnpm install` so `pnpm-lock.yaml` follows)
- Create: `packages/app/src/lib/lifecycle.ts`, `packages/app/src/lib/lifecycle.test.ts`
- Modify: `packages/app/src/index.tsx` (call `void loadLifecycle()` next to `loadHaptics()`)

**Interfaces:**

- Produces (runtime): `interface LifecyclePorts { onBackButton(cb: () => void): () => void; onPause(cb: () => void): () => void; onResume(cb: () => void): () => void; minimizeApp(): Promise<void> }`, `webLifecycle(doc?: Document): LifecyclePorts` (pause and resume from `visibilitychange`; back button never fires; minimize resolves and does nothing), `capacitorLifecycle: LifecyclePorts` (in `capacitor/lifecycle.ts`).
- Produces (app): `loadLifecycle(): Promise<void>` (idempotent; native builds only, guarded by the literal `__NATIVE_BUILD__`), `appActive: Accessor<boolean>` (true until the first pause, false until the next resume), `onAppPause(cb): () => void`, `onAppResume(cb): () => void`, the back button wired inside the facade (on back, `if (!popBack()) void ports.minimizeApp()`), and for tests `useLifecyclePorts(ports)`.

- [ ] **Step 1: Write the failing runtime tests** (`packages/mobile-runtime/src/lifecycle.test.ts`)

```ts
import { describe, expect, it, vi } from 'vitest'
import { webLifecycle } from './lifecycle'

function fakeDocument() {
  const listeners = new Map<string, Set<() => void>>()
  return {
    hidden: false,
    addEventListener(type: string, cb: () => void) {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(cb))
    },
    removeEventListener(type: string, cb: () => void) {
      listeners.get(type)?.delete(cb)
    },
    fire(type: string) {
      listeners.get(type)?.forEach((cb) => cb())
    },
  }
}

describe('webLifecycle', () => {
  it('maps visibilitychange to pause and resume', () => {
    const doc = fakeDocument()
    const ports = webLifecycle(doc as unknown as Document)
    const paused = vi.fn()
    const resumed = vi.fn()
    ports.onPause(paused)
    const stopResume = ports.onResume(resumed)
    doc.hidden = true
    doc.fire('visibilitychange')
    doc.hidden = false
    doc.fire('visibilitychange')
    expect(paused).toHaveBeenCalledTimes(1)
    expect(resumed).toHaveBeenCalledTimes(1)
    stopResume()
    doc.hidden = true
    doc.fire('visibilitychange')
    doc.hidden = false
    doc.fire('visibilitychange')
    expect(resumed).toHaveBeenCalledTimes(1)
  })

  it('has no back button and a minimize that resolves', async () => {
    const ports = webLifecycle(fakeDocument() as unknown as Document)
    const back = vi.fn()
    const stop = ports.onBackButton(back)
    stop()
    await expect(ports.minimizeApp()).resolves.toBeUndefined()
    expect(back).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement the runtime** (`lifecycle.ts`)

```ts
/**
 * What the app needs from the platform's lifecycle, and nothing more: the
 * Android back gesture, pause and resume, and a way to send the app to the
 * background. The web has no back button and no minimize; it still pauses,
 * through visibilitychange, so the draft save (app lib/draft.ts) behaves the
 * same in a browser tab.
 */
export interface LifecyclePorts {
  onBackButton(callback: () => void): () => void
  onPause(callback: () => void): () => void
  onResume(callback: () => void): () => void
  minimizeApp(): Promise<void>
}

export function webLifecycle(doc: Document = document): LifecyclePorts {
  const onVisibility = (wanted: boolean, callback: () => void) => {
    const listener = () => {
      if (doc.hidden === wanted) callback()
    }
    doc.addEventListener('visibilitychange', listener)
    return () => doc.removeEventListener('visibilitychange', listener)
  }
  return {
    onBackButton: () => () => {},
    onPause: (callback) => onVisibility(true, callback),
    onResume: (callback) => onVisibility(false, callback),
    minimizeApp: () => Promise.resolve(),
  }
}
```

`capacitor/lifecycle.ts` binds the same four to `@capacitor/app`: `App.addListener('backButton', cb)` (the listener's presence is what stops Capacitor's default of `history.back()` or exiting), `App.addListener('pause', cb)`, `App.addListener('resume', cb)`, `App.minimizeApp()`. `addListener` returns a promise of a handle; the returned disposer must call `handle.remove()` once the promise resolves and must tolerate being called before it does (keep a `disposed` flag and remove on resolve). Add both entries to `packages/mobile-runtime/package.json` `exports` in the shape `./haptics` and `./capacitor-haptics` use, and `"@capacitor/app": "^8.1.1"` to its dependencies; run `timeout 900 pnpm install` from the repo root.

- [ ] **Step 3: Write the failing app tests** (`packages/app/src/lib/lifecycle.test.ts`) using a fake `LifecyclePorts` injected with `useLifecyclePorts`: (a) a back button press pops the registry first (`pushBackHandler` a spy, press, spy called once, `minimizeApp` not called); (b) with an empty registry the press calls `minimizeApp` once; (c) pause flips `appActive` to false and runs `onAppPause` callbacks once, resume flips it back and runs `onAppResume`; (d) `loadLifecycle()` in a web build (vitest defines `__NATIVE_BUILD__` as false) resolves without importing anything and `appActive()` stays true.

- [ ] **Step 4: Implement the app facade** (`packages/app/src/lib/lifecycle.ts`), modelled on `lib/haptics.ts`: a module-level `ports: LifecyclePorts` defaulting to `webLifecycle()`, `useLifecyclePorts(next)` re-wires the four subscriptions, `loadLifecycle()` does `if (!__NATIVE_BUILD__) return` then `const { capacitorLifecycle } = await import('@chaos-master/mobile-runtime/capacitor-lifecycle')` (guarded by the literal in this module) and calls `useLifecyclePorts(capacitorLifecycle)`; a `[appActive, setAppActive]` signal; `onAppPause`/`onAppResume` keep sets of callbacks; the back subscription runs `if (!popBack()) void ports.minimizeApp()`. Errors from the dynamic import are logged with `console.warn('[lifecycle] ...')` and leave the web ports in place.

- [ ] **Step 5: Wire startup** — in `packages/app/src/index.tsx`, next to `void loadHaptics()`, add `void loadLifecycle()`.

- [ ] **Step 6: Run everything** — both test files pass; `timeout 1800 pnpm --filter chaos-master build` then `grep -l '@capacitor' packages/app/dist/assets/*.js` prints nothing; `timeout 1800 pnpm --filter chaos-master build:native` succeeds and `ls packages/app/dist-native/assets | grep -i lifecycle` shows the chunk.
- [ ] **Step 7: Commit** — `git commit -m "feat(mobile): lifecycle ports, and the Android back gesture pops the registry"`.

---

### Task 3: Every layer registers with the registry

**Files:**

- Modify: `packages/app/src/components/Modal/Modal.tsx`, `packages/app/src/components/TouchSurface/EditorRail.tsx`, `packages/app/src/components/TouchSurface/detents.ts`, `packages/app/src/components/TouchSurface/TouchHUD.tsx`, `packages/app/src/MainWorkspace.tsx` (the drawer), `packages/app/src/App.tsx` (Home and the Arcade)
- Test: `EditorRail.test.tsx`, `TouchSurface.test.tsx`, a new `Modal.back.test.tsx` next to `Modal.tsx`

**Interfaces:**

- Produces: `railDetent`/`setRailDetent` exported from `detents.ts` (a module-level signal, default `'peek'`); the rail reads and writes it instead of its local `detent` signal.

Order of registration is the order of opening, so the pop order in `A/screens.md` 0.5 falls out: a modal opened from the rail sits above the rail's detent handlers; Home opened over the editor sits above nothing the editor pushed (the rail is unmounted while Home shows, see Task 7).

- [ ] **Step 1: The rail's detents.** Move the detent into `detents.ts` as `export const [railDetent, setRailDetent] = createSignal<Detent>('peek')`. In `EditorRail.tsx`, a `createEffect` keeps exactly one back handler registered while `railDetent() !== 'peek'`: its handler calls `settle(railDetent() === 'large' ? 'medium' : 'peek')` (one step down per pop, so back from large is two pops, as the spec's list says). Dispose it in the effect's `onCleanup`. Test in `EditorRail.test.tsx`: open to large (`setRailDetent('large')` before render, or drag), `popBack()` twice, the sheet is at medium then at peek, `backDepth()` is 0 after; a third `popBack()` returns false.
- [ ] **Step 2: Modals.** In `Modal.tsx`, each `ModalInstance` pushes a handler when it is added and disposes it when it is removed; the handler does what the dialog's `onCancel` does today (respond with the cancel value and close). Test: render a Modal host, request a modal, `popBack()` resolves the request with its cancel value and `backDepth()` returns to 0.
- [ ] **Step 3: The top bar's popovers.** In `TouchHUD.tsx` the More menu and the title tooltip each push a handler while open (closing them). Test in `TouchSurface.test.tsx`: open More, `popBack()` closes it.
- [ ] **Step 4: The drawer.** In `MainWorkspace.tsx`, an effect pushes a handler while `touchDrawerOpen()` is true that sets it false.
- [ ] **Step 5: Home and the Arcade.** In `App.tsx`, an effect pushes a handler while `activeTab() === 'home' && !showWelcome()` that calls `setActiveTab('workspace')`, and one while `activeTab() === 'arcade'` doing the same. Keep `installHomeEscapeBoundary` as it is: Escape and back are different keys with the same result.
- [ ] **Step 6: Run the suite, then commit** — `git commit -m "feat(app): modals, popovers, the drawer, the rail and Home answer back"`.

---

### Task 4: The one More list

**Files:**

- Create: `packages/app/src/components/Shell/moreMenu.ts`, `moreMenu.test.ts`
- Modify: `packages/app/src/components/TouchSurface/TouchHUD.tsx` (delete `MoreItem` and `moreItems()`, import the builder)

**Interfaces:**

- Produces: `interface MoreMenuHandlers { onOpenExportModal?; onShare?; onOpenDrawer?; onOpenArcade?; onOpenDocs?; onOpenBenchmark?; onOpenBenchmarkLab?; onOpenHelp?; onDesktopLayout? }` (all `() => void`; use the exact prop names `TouchHUDProps` already has for these nine so `buildMoreMenu(props)` type-checks), `interface MoreMenuItem { readonly label: string; readonly Icon: Component<{ class?: string }>; readonly run: () => void }`, `buildMoreMenu(handlers: MoreMenuHandlers): MoreMenuItem[]` (a declarative table filtered by which handlers exist; labels and order exactly as `TouchHUD` renders them today: Export options, Share link, Advanced tools, Lumen Arcade, Documentation, Quick GPU benchmark, Benchmark Lab, Settings and more, Desktop layout).

- [ ] **Step 1: Failing test** — `buildMoreMenu({})` is empty; with every handler it yields the nine labels in that order; `run` calls the matching handler.
- [ ] **Step 2: Implement** the table (`[{ label, Icon, run: handlers.onOpenExportModal }, ...].filter((item) => item.run)`), and make `TouchHUD` render `buildMoreMenu(props)`.
- [ ] **Step 3: Run `TouchSurface.test.tsx`** (the More menu tests must still pass unchanged), then commit — `git commit -m "refactor(touch): one More list for every surface"`.

---

### Task 5: The phone shell bar and the capsule

**Files:**

- Create: `packages/app/src/components/Shell/ShellBar.tsx`, `ShellBar.module.css`, `ShellBar.test.tsx`
- Modify: `packages/app/src/styles/designSystem/lumen.css` (add `--la-shell-h: 56px` for the iOS pill, `--la-shell-h-material: 64px`, `--la-capsule: 56px`; `--la-navrail-w` already exists), `packages/app/src/components/TouchSurface/EditorRail.tsx` + `EditorRail.module.css` (a `leading` slot at the start of the peek row, 56 px wide plus `--la-s-2` gap, present only when the prop is given), `packages/app/src/components/TouchSurface/tokens.test.ts` (cover `Shell/*.module.css`)

**Interfaces:**

- Consumes: `activeTab`, `setActiveTab` from `lib/activeTab.ts`; `buildMoreMenu`; `haptic.selectionChanged()` on a destination change; `pushBackHandler` for the expanded state and the More menu.
- Produces: `type ShellDestination = 'create' | 'library'`, `ShellBar(props: { mode: 'full' | 'capsule'; current: Accessor<ShellDestination>; onSelect: (d: ShellDestination) => void; more: MoreMenuHandlers })`. In `capsule` mode it renders the 56 px capsule (Create's glyph, `aria-label="Create, navigation"`, `aria-expanded`) that expands into the full bar over the rail on tap for `CAPSULE_OPEN_MS = 3000` or while a pointer is held on it, then collapses; in `full` mode it renders the bar with labels. The platform style comes from `:root[data-platform='android']` (full-width 64 px bar, labels always, pill indicator) versus everything else (the floating glass pill, `--la-glass-strong`, at `--la-float-inset` from the edges and above the bottom safe area, with the separated More circle).

- [ ] **Step 1: Failing tests** (`ShellBar.test.tsx`, `@solidjs/testing-library`, fake timers):
  - full mode renders the `Create` and `Library` buttons and a `More` button; `aria-current="page"` on the current one; clicking Library calls `onSelect('library')` and `haptic.selectionChanged` once (mock `@/lib/haptics` the way `EditorRail.test.tsx` does).
  - capsule mode renders only the capsule; a click expands it (the two destinations become visible) and pushes one back handler; after 3000 ms it collapses and the handler is gone; a pointerdown held on the capsule keeps it expanded past 3000 ms until pointerup, then it collapses 3000 ms later.
  - `popBack()` while expanded collapses it.
  - the More button opens the shared list (assert the "Settings and more" item) and `popBack()` closes it.
- [ ] **Step 2: Implement** the component and its stylesheet. Geometry from `B/components.md` 10 and the kit: pill height `--la-shell-h`, items `min-width: 64px`, glyph 24 px, label `--la-t-label`; the capsule is a `--la-capsule` circle with the same glass; the expand is a 180 ms `--la-dur-fast` `--la-ease` width and opacity change, none under reduced motion. The Android bar reads `--la-shell-h-material`, `--la-surface`, a hairline top border, permanent labels, the 3 px indicator pill under the current item.
- [ ] **Step 3: The rail's leading slot.** `EditorRailProps` gains `leading?: JSX.Element`; the peek row renders it before the chips in a `56px` box with `--la-s-2` gap; the chips' `min-width` stays `--la-tap` (at 360 px: 360 - 24 - 2 - 16 - 56 - 8 - 56 - 8 = 190 px for four chips, 47 px each, fits). Add one test in `EditorRail.test.tsx` that the slot renders its child before the first chip.
- [ ] **Step 4: Extend `tokens.test.ts`** to the two new Shell stylesheets. Run the suite. Commit — `git commit -m "feat(shell): the phone bar, and the capsule that docks in the rail"`.

---

### Task 6: The tablet navigation rail

**Files:**

- Create: `packages/app/src/components/Shell/NavRail.tsx`, `NavRail.module.css`, `NavRail.test.tsx`
- Modify: `packages/app/src/App.module.css` (`.tabletLayout` grid gains a leading `var(--la-navrail-w)` column), `packages/app/src/MainWorkspace.tsx` (mount it in the deck layout only: `isTablet() && deckFits()`)

**Interfaces:**

- Produces: `NavRail(props: { current: Accessor<ShellDestination>; onSelect: (d: ShellDestination) => void; onOpenSettings: () => void })`: a `nav` with `aria-label="Destinations"`, 80 px wide (`--la-navrail-w`), items 64 px tall (glyph 26, label 11 px), Create and Library at the top, a spacer, Settings at the bottom, the brand mark at the very top (reuse the app's existing mark component or SVG; do not add a raster), `padding-left: var(--la-safe-left)`, background `--la-ground`, a trailing hairline.

- [ ] **Step 1: Failing test** — renders the three items with `aria-current` on the current one; Settings calls `onOpenSettings`; Library calls `onSelect('library')` and `haptic.selectionChanged`.
- [ ] **Step 2: Implement**, mount it in `MainWorkspace` for the deck layout, wire `onOpenSettings` to the existing `showHelp` path and `onSelect` to `setActiveTab('home' | 'workspace')`. The deck's `Library` header button stays (it opens the load-flame modal, a different thing).
- [ ] **Step 3: Run the suite, commit** — `git commit -m "feat(shell): the tablet navigation rail"`.

---

### Task 7: Home on touch, and mounting the phone shell

**Files:**

- Modify: `packages/app/src/App.tsx` (the shell bar in full mode over Home on touch layouts), `packages/app/src/MainWorkspace.tsx` (the capsule as the rail's `leading` slot on rail layouts; the top bar and the rail are not rendered while `activeTab() !== 'workspace'`), `packages/app/src/components/Home/HomeTab.tsx` + `HomeTab.module.css` (safe-area padding: `--la-safe-top` at the top, `--la-shell-h + --la-safe-bottom + 2 * --la-float-inset` at the bottom on touch layouts so the bar never covers the last row; the left-edge swipe), a `HomeTab` test file of your choice

**Interfaces:**

- Consumes: `isTouchLayout`, `deckFits` from the layout store; `railLayout` in `MainWorkspace`; `popBack`.

- [ ] **Step 1: Failing tests** — (a) in a new `Shell.mount.test.tsx`: with `activeTab` set to `home` on a touch layout the shell bar renders in full mode with Library current, and selecting Create sets the tab to `workspace`; (b) `HomeTab`: a horizontal pointer drag that starts within 24 px of the left edge and travels 60 px to the right calls `popBack()` once (mock `@/lib/backStack`); a drag that starts at x = 100 does nothing.
- [ ] **Step 2: Implement.** The shell bar's `full` instance is rendered by `App.tsx` beside `HomeTab` (touch layouts only; the desktop keeps `FloatingActions`). The `capsule` instance is passed into `EditorRail` as `leading` from `MainWorkspace` on rail layouts; on the deck layout the `NavRail` from Task 6 is the shell and no capsule renders. While `activeTab() !== 'workspace'` the `TouchHUD` and the rail are not rendered (they are Create's). The edge swipe is a small `createDragHandler` on the Home root: init only when `event.clientX <= 24`, and on the first move past 60 px call `popBack()` once and end. `Escape` keeps working through `installHomeEscapeBoundary`.
- [ ] **Step 3: Run the suite, commit** — `git commit -m "feat(shell): Library is reachable on every device, and back leads home"`.

---

### Task 8: The draft that survives the background

**Files:**

- Create: `packages/app/src/lib/draft.ts`, `draft.test.ts`
- Modify: `packages/app/src/MainWorkspace.tsx` (save on pause), `packages/app/src/App.tsx` (restore on launch)

**Interfaces:**

- Produces: `saveDraft(flame: FlameDescriptor, tracks?: TimelineTrack[]): void` (writes `{ flame, tracks, savedAt: Date.now() }` as JSON through `safeSetItem('chaos-master-draft', ...)`, the same envelope shape `parseFlameEnvelope` accepts), `readDraft(): { flame; tracks?; savedAt } | undefined` (through `parseFlameEnvelope`; corrupt JSON returns undefined), `clearDraft()`, `hasSharePayload(search: string): boolean` (true when `?s=`, `?flame=` or `?cv=` is present).

- [ ] **Step 1: Failing tests** — round trip of a flame with tracks; a corrupt value reads as undefined; `clearDraft` empties it; `hasSharePayload('?s=abc')` true, `''` false.
- [ ] **Step 2: Implement `draft.ts`.** In `MainWorkspace`, `onAppPause(() => saveDraft(flame(), currentTracks()))` registered once, disposed on cleanup, where `flame()` is the effective flame the export path already serialises and the tracks are what the share link path already includes (grep `parseFlameEnvelope` and the share-link encoder to find both accessors; do not invent a third serialisation). In `App.tsx`, on first render in a native build only (`IS_NATIVE`), when `!showWelcome()` and `!hasSharePayload(location.search)` and `readDraft()` returns a flame, seed the workspace through the same `setSelectedFlame` and `setSelectedWelcomeTracks` hand-off Home uses, then `clearDraft()` and toast `Restored your last flame`.
- [ ] **Step 3: Run the suite, commit** — `git commit -m "feat(app): keep a draft while the app is in the background"`.

---

### Task 9: The cross-fade at the threshold

**Files:**

- Modify: `packages/app/src/App.module.css` (a `la-surface-enter` keyframe: opacity 0 to 1 over `--la-dur-fast` `--la-ease`, applied to the rail's dock and the deck on mount, none under `prefers-reduced-motion`), `packages/app/src/components/TouchSurface/EditorRail.module.css`, `TabletDeck.module.css`
- Test: `EditorRail.test.tsx`

- [ ] **Step 1: Failing test** — render the rail, settle at `medium`, unmount, render again: the sheet is at `medium` (the module-level `railDetent` from Task 3 survives the remount) and the covered height is reported again.
- [ ] **Step 2: Implement** the keyframe on both surfaces' root elements. Nothing in TypeScript changes for the fade.
- [ ] **Step 3: Tick DESIGN.md section 4's fourth routing item**, run the suite, commit — `git commit -m "feat(touch): cross-fade the surfaces at the threshold, keep the detent"`.

---

### Task 10: Plan upkeep and the pull request

**Files:**

- Modify: `docs/plans/mobile-native/DESIGN.md` (section 4 shell items: tick what shipped, reword the Play item to "reserved, not shown" with the reason; section 12's Play row stays), `docs/plans/mobile-native/README.md` (the Phase 3 items "Android back button" and lifecycle: tick), this file (every step ticked)

- [ ] **Step 1: Final verification block**, paste the results into the report:

```bash
timeout 1800 pnpm check
timeout 1800 pnpm --filter chaos-master test -- --run
timeout 900 pnpm --filter @chaos-master/mobile-runtime test
timeout 1800 pnpm --filter chaos-master build && (grep -l '@capacitor' packages/app/dist/assets/*.js || echo "web bundle clean")
timeout 1800 pnpm --filter chaos-master build:native
git log --oneline origin/feat/native-rail..HEAD
```

- [ ] **Step 2: Push and open the PR** — `git push -u origin feat/native-shell`, then `gh pr create --base feat/native-rail --title "feat(shell): the shell, back and lifecycle (Phase B)" --body-file <tmp>` with the body written to a temp file under the scratch directory: what changed per task, the decisions, the deviations, the manual checks (phone: capsule expand and collapse, Android back from every depth ends in the app minimising, the draft comes back after a force-stop; tablet: the rail, Settings; both: Library and back; iPhone: the edge swipe).

## Self-review notes

- Spec coverage: routing cross-fade (Task 9), destinations and the capsule (Task 5), the tablet rail with Settings (Task 6), `lib/activeTab.ts` touch entry point (Tasks 5 to 7; no new tab name needed since Library is Home), the back registry with its order (Tasks 1 and 3) and `minimizeApp()` (Task 2), pause and resume (Tasks 2 and 8). Play: deliberately not shown (decisions above).
- Every task ends in a test that was red first, except the two CSS-only steps (the fade keyframe, the Android bar style), which the reviewer checks in a browser.
