# Phase A: the editor rail, top bar and tablet deck — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in one session, in order. Steps use checkbox (`- [ ]`) syntax for tracking. Do not spawn subagents.

**Goal:** Replace the phone's pill-bar-and-sheet with one persistent rail at three detents, give the phone a 44 pt top bar, give tablets an opaque resizable inspector deck, and route the layout by input and platform so a tablet never lands in the desktop workspace in the native app.

**Architecture:** Pure logic first (detent arithmetic, layout classification, the haptic vocabulary), each with table tests, then the three components on top of them (`EditorRail`, the reworked `TouchHUD`, the reworked `TabletInspectorDeck`), then the wiring in `MainWorkspace`. Design tokens land as an additive `--la-*` set; nothing outside the touch surfaces is restyled in this phase. Haptics reach Capacitor through `packages/mobile-runtime` behind the literal `__NATIVE_BUILD__` guard, the same way saving does.

**Tech Stack:** SolidJS 1.9, TypeScript, CSS modules, Vitest + `@solidjs/testing-library` (happy-dom), pnpm workspaces, Capacitor 8 (`@capacitor/haptics` 8.0.2, already registered in `packages/mobile` on both platforms).

**Spec:** `docs/plans/mobile-native/DESIGN.md` sections 2, 3 and 4 (this plan implements Phase A and the routing half of Phase B), plus the drawn version at `~/foss/disjoint-colliders/packages/showcase-gallery/gallery-viewer/lumen-native.html` (sections `#rail`, `#detents`, `#tablet-landscape`, `#tablet-portrait`; open the page in a browser only if you need to; its source fragments are `lumen-native/sections/02-editor-phone.html` and `03-editor-tablet.html`, its CSS `lumen-native/lumen-native.css`). The research the spec was built from is at `~/agent-out/chaos-master-fp/2026-09-11/lumen-native-plan/`: `A/screens.md` (section 0.4 the rail, 0.5 the back stack, 0.6 the haptic map), `B/tokens.css` (the token set), `B/components.md` (sections 6, 7, 8, 9, 11), `B/motion.md` (sections 1 and 2). Read those five before Task 1.

## Global constraints

- Branch `feat/native-rail`, created from `origin/feat/mobile-capacitor-scaffolding-9224ec`. The PR targets that branch on `Komediruzecki/chaos-master-fp`, never `main` and never the upstream repository. Never merge, never push a tag, never force-push.
- Commit per task with the messages given. **No `Co-Authored-By` or any other trailer.** The user is the sole author.
- `pnpm check` (from the repo root: typecheck, lint:fix, fmt:fix, WGSL validation) must pass before every commit; it rewrites files, so run it, then stage. `pnpm --filter chaos-master exec vitest run` must pass before every commit.
- No emojis anywhere: code, copy, comments, commit messages. Icons are the SVG components in `packages/app/src/icons/index.ts` (`GridIcon`, `Undo`, `Redo`, `CameraIcon`, `VariationSpiral`, `ShapeTriangle`, `ColourWedge`, `Sparkle`, `Shuffle`, `Download`, `Share`, `SidebarPanel`, `Info`, `Book`, `Zap`, `Menu`); add a new SVG under `packages/app/src/icons/` if one is missing, never an emoji.
- Copy in product voice, no hype. The unnamed flame is `Untitled flame`. No new user-visible string may contain "Chaos Master" (the About row in HelpModal keeps its existing one).
- Every touch target is 44 x 44 CSS px minimum (it is pt on iOS, dp on Android); measure the touch box, not the glyph. Values inside native chrome are in px, never rem.
- New CSS uses only `--la-*` tokens for colour, radius, spacing, duration and easing. No hex literal in `EditorRail.module.css`, `TabletDeck.module.css` or `TouchSurface.module.css` after Task 8 (a test enforces it). Never `transition: all`.
- A haptic call is never awaited and never fires when the Haptics setting is off. Anything that imports `@capacitor/*` is reached only through a dynamic import guarded by the literal `__NATIVE_BUILD__` in the same module (see `packages/app/src/lib/nativeSave.ts` `loadRuntime`); a cross-module `IS_NATIVE` check does not keep the chunk out of the web build.
- After Task 8 the web build (`pnpm --filter chaos-master build`) must contain no `capacitor-*` chunk in `packages/app/dist/assets/`, and the native build (`pnpm --filter chaos-master build:native`) must succeed.
- Do not edit anything under `packages/mobile/ios/` or `packages/mobile/android/`.
- Absolute dates only (today is 2026-09-11). Comments explain why, in the density of the surrounding code.

## File structure

| File                                                                                                                          | Responsibility                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/app/src/styles/designSystem/lumen.css` (new)                                                                        | The `--la-*` token set for direction D2, additive.                                                                       |
| `packages/app/src/components/TouchSurface/detents.ts` (new) + `detents.test.ts`                                               | Pure detent arithmetic: heights, clamping, nearest, settle-on-release.                                                   |
| `packages/mobile-runtime/src/haptics.ts` (new) + `haptics.test.ts`                                                            | The haptic vocabulary over a `HapticPorts` interface: enabled gate, rate limit, fire-and-forget.                         |
| `packages/mobile-runtime/src/capacitor/haptics.ts` (new)                                                                      | `HapticPorts` bound to `@capacitor/haptics`. Exported as `@chaos-master/mobile-runtime/capacitor-haptics`.               |
| `packages/app/src/lib/haptics.ts` (new) + `haptics.test.ts`                                                                   | The app's `haptic` facade, the `hapticsEnabled` setting, the guarded runtime load.                                       |
| `packages/app/src/stores/workspaceLayoutStore.ts` + `workspaceLayoutStore.test.ts` (new)                                      | `classifyLayout`, `deckFitsWidth`, one `layoutClass` signal from window size, pointer and platform.                      |
| `packages/app/src/components/TouchSurface/EditorRail.tsx` (new) + `EditorRail.module.css` (new) + `EditorRail.test.tsx` (new) | The phone rail: chips, shutter, sheet at three detents, drag, haptics, canvas inset. Replaces `MobileBottomSurface.tsx`. |
| `packages/app/src/components/TouchSurface/TouchHUD.tsx` + `TouchSurface.module.css`                                           | The 44 pt top bar: Library, title, Undo, Redo, More.                                                                     |
| `packages/app/src/components/TouchSurface/TouchControlSurface.tsx` + `types.ts`                                               | The sheet body: controlled `tab`, `hideTabRow`, `hideFooter`, the new `vary` tab.                                        |
| `packages/app/src/components/TouchSurface/TabletInspectorDeck.tsx` + `TabletDeck.module.css` (new)                            | The opaque, resizable, collapsible deck.                                                                                 |
| `packages/app/src/MainWorkspace.tsx`, `App.module.css`, `index.html`                                                          | Mounting, the deck-or-rail choice on tablets, the canvas inset, the keyboard viewport hint.                              |
| `packages/app/src/components/HelpModal/HelpModal.tsx`                                                                         | The Haptics switch under General Settings (native only).                                                                 |
| `packages/app/src/components/TouchSurface/tokens.test.ts` (new)                                                               | The hex-literal guard.                                                                                                   |

---

### Task 0: Branch and workspace

**Files:** none.

- [ ] **Step 1:** From the worktree you were started in, verify the base and create the branch.

```bash
git fetch origin
git checkout -b feat/native-rail origin/feat/mobile-capacitor-scaffolding-9224ec
git log --oneline -1   # must be e47f2ba7 "docs(mobile): native design plan, and the probe results" or a later commit on that branch
```

- [ ] **Step 2:** Install dependencies if `node_modules` is missing in this worktree, then confirm the baseline is green.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm --filter chaos-master exec vitest run --reporter=dot
pnpm --filter @chaos-master/mobile-runtime test
```

Expected: check exits 0 (warnings are fine, no errors), 2531 app tests pass, 16 runtime tests pass.

---

### Task 1: The `--la-*` tokens

**Files:**

- Create: `packages/app/src/styles/designSystem/lumen.css`
- Modify: `packages/app/src/styles/index.css:2-5` (the `@import` list)

**Interfaces:**

- Produces: the custom properties every later task's CSS uses. The ones this plan relies on by name: `--la-void`, `--la-ground`, `--la-surface`, `--la-surface-2`, `--la-surface-3`, `--la-hairline`, `--la-hairline-strong`, `--la-ink`, `--la-ink-2`, `--la-ink-3`, `--la-ink-4`, `--la-ink-invert`, `--la-accent`, `--la-accent-press`, `--la-accent-wash`, `--la-glass`, `--la-glass-blur`, `--la-glass-edge`, `--la-glass-shadow`, `--la-scrim-sheet`, `--la-r-sm`, `--la-r-md`, `--la-r-lg`, `--la-r-sheet`, `--la-r-pill`, `--la-s-1` … `--la-s-9`, `--la-e-2`, `--la-e-sheet`, `--la-e-focus`, `--la-dur-press`, `--la-dur-fast`, `--la-dur-base`, `--la-dur-sheet`, `--la-ease`, `--la-ease-in`, `--la-ease-spring`, `--la-font-body`, `--la-t-tab`, `--la-t-caption`, `--la-t-value`, `--la-t-body-sm`, `--la-tap`, `--la-tap-row`, `--la-hud-h`, `--la-rail-h`, `--la-track`, `--la-thumb`, `--la-float-inset`, `--la-safe-top`, `--la-safe-bottom`, `--la-safe-left`, `--la-safe-right`.

- [ ] **Step 1:** Copy `~/agent-out/chaos-master-fp/2026-09-11/lumen-native-plan/B/tokens.css` to `packages/app/src/styles/designSystem/lumen.css`. Delete from the copy: every `[data-direction="d1"]` and `[data-direction="d3"]` block (the app ships one direction; the showcase page keeps the other two), any `[data-theme="light"]` block (the touch chrome is dark by construction; the web's light theme is untouched by this phase), and the replacement-map comment section at the end. Keep the `:root` block and the reduced-motion / reduced-transparency blocks. Add a header comment:

```css
/* Lumen Apeiron design tokens, direction D2 "Ember Glass" (docs/plans/mobile-native/DESIGN.md, section 2).
   Additive: nothing here overrides --neutral-* or --blue-*; the touch surfaces read these,
   the rest of the app is restyled in a later phase. Values are px: inside native chrome
   a 44px target must stay 44px at every OS text size. */
```

If any of the names listed under Interfaces above is missing from the copy, add it with the value from `B/components.md` (for `--la-hud-h: 44px`, `--la-rail-h: 64px`, `--la-tap: 44px`, `--la-tap-row: 56px`, `--la-track: 4px`, `--la-thumb: 28px`, `--la-float-inset: 12px`, `--la-t-tab: 500 10px/12px var(--la-font-body)`, `--la-t-caption: 400 13px/18px var(--la-font-body)`, `--la-t-value: 500 15px/18px var(--la-font-body)`) and the safe areas as

```css
--la-safe-top: env(safe-area-inset-top, 0px);
--la-safe-bottom: env(safe-area-inset-bottom, 0px);
--la-safe-left: env(safe-area-inset-left, 0px);
--la-safe-right: env(safe-area-inset-right, 0px);
```

- [ ] **Step 2:** Import it. In `packages/app/src/styles/index.css` the import list becomes:

```css
@import './preflight.css';
@import './designSystem/layout.css';
@import './designSystem/colors.css';
@import './designSystem/lumen.css';
@import './designSystem/dark-mode.css';
```

(the Google Fonts import on line 1 stays where it is).

- [ ] **Step 3:** Verify nothing changed visually: `pnpm --filter chaos-master build` succeeds; `grep -c -- '--la-accent' packages/app/dist/assets/*.css` is at least 1.

- [ ] **Step 4:** Commit.

```bash
pnpm check && git add packages/app/src/styles && git commit -m "feat(app): Lumen Apeiron design tokens, direction D2

Additive --la-* set from docs/plans/mobile-native/DESIGN.md section 2: grounds, ink,
one action colour, glass, scrims, radius and spacing ladders, elevations, durations,
one easing family, the type scale, targets and safe areas. Nothing reads them yet."
```

---

### Task 2: Detent arithmetic

**Files:**

- Create: `packages/app/src/components/TouchSurface/detents.ts`
- Test: `packages/app/src/components/TouchSurface/detents.test.ts`

**Interfaces:**

- Produces:

```ts
export type Detent = 'peek' | 'medium' | 'large'
export const DETENTS: readonly Detent[] // ['peek', 'medium', 'large']
export const PEEK_HEIGHT = 96 // px, includes the bottom safe area
export const MEDIUM_FRACTION = 0.44
export const LARGE_FRACTION = 0.88
export const FLICK_VELOCITY = 0.5 // px per ms
export interface DetentHeights {
  readonly peek: number
  readonly medium: number
  readonly large: number
}
export function detentHeights(viewportHeight: number): DetentHeights
export function heightOf(detent: Detent, heights: DetentHeights): number
export function clampSheetHeight(height: number, heights: DetentHeights): number
export function nearestDetent(height: number, heights: DetentHeights): Detent
export function settleDetent(
  height: number,
  velocity: number,
  heights: DetentHeights,
): Detent
```

`velocity` is in px/ms, positive when the sheet is growing (the finger moving up).

- [ ] **Step 1:** Write the failing tests.

```ts
import { describe, expect, it } from 'vitest'
import { clampSheetHeight, detentHeights, heightOf, nearestDetent, settleDetent, } from './detents'

const H = detentHeights(852)

describe('detentHeights', () => {
  it('is 96, 44% and 88% of the viewport', () => {
    expect(H).toEqual({ peek: 96, medium: 375, large: 750 })
    expect(heightOf('medium', H)).toBe(375)
  })
})

describe('clampSheetHeight', () => {
  it('never goes below peek or above large', () => {
    expect(clampSheetHeight(10, H)).toBe(96)
    expect(clampSheetHeight(2000, H)).toBe(750)
    expect(clampSheetHeight(400, H)).toBe(400)
  })
})

describe('nearestDetent', () => {
  it('picks the closest height', () => {
    expect(nearestDetent(200, H)).toBe('peek')
    expect(nearestDetent(300, H)).toBe('medium')
    expect(nearestDetent(600, H)).toBe('large')
  })
})

describe('settleDetent', () => {
  it('settles at the nearest detent when released slowly', () => {
    expect(settleDetent(200, 0.1, H)).toBe('peek')
    expect(settleDetent(300, -0.1, H)).toBe('medium')
    expect(settleDetent(600, 0, H)).toBe('large')
  })

  it('goes to the next detent in the direction of a flick', () => {
    expect(settleDetent(200, 0.6, H)).toBe('medium')
    expect(settleDetent(200, -0.6, H)).toBe('peek')
    expect(settleDetent(400, 0.6, H)).toBe('large')
    expect(settleDetent(400, -0.6, H)).toBe('medium')
    expect(settleDetent(700, -0.6, H)).toBe('medium')
  })

  it('reaches peek from medium on a flick down, and never goes below it', () => {
    expect(settleDetent(375, -0.6, H)).toBe('peek')
    expect(settleDetent(360, -1.2, H)).toBe('peek')
    expect(settleDetent(96, -2, H)).toBe('peek')
  })

  it('stays at large on a flick up from large', () => {
    expect(settleDetent(750, 0.9, H)).toBe('large')
  })
})
```

- [ ] **Step 2:** Run `pnpm --filter chaos-master exec vitest run src/components/TouchSurface/detents.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3:** Implement.

```ts
/**
 * The rail's three resting heights and how a drag settles between them.
 * Pure, so the rail's gesture handling is testable without a DOM.
 * Heights are CSS px measured from the bottom of the viewport; the peek
 * height includes the bottom safe area.
 */
export type Detent = 'peek' | 'medium' | 'large'

export const DETENTS: readonly Detent[] = ['peek', 'medium', 'large']
export const PEEK_HEIGHT = 96
export const MEDIUM_FRACTION = 0.44
export const LARGE_FRACTION = 0.88
/** px per ms; above this a release goes one detent in the direction of travel. */
export const FLICK_VELOCITY = 0.5

export interface DetentHeights {
  readonly peek: number
  readonly medium: number
  readonly large: number
}

export function detentHeights(viewportHeight: number): DetentHeights {
  return {
    peek: PEEK_HEIGHT,
    medium: Math.round(viewportHeight * MEDIUM_FRACTION),
    large: Math.round(viewportHeight * LARGE_FRACTION),
  }
}

export function heightOf(detent: Detent, heights: DetentHeights): number {
  return heights[detent]
}

/** No rubber band past large, and never below peek: the rail is never gone. */
export function clampSheetHeight(
  height: number,
  heights: DetentHeights,
): number {
  return Math.min(heights.large, Math.max(heights.peek, height))
}

export function nearestDetent(height: number, heights: DetentHeights): Detent {
  let best: Detent = 'peek'
  let bestDistance = Infinity
  for (const detent of DETENTS) {
    const distance = Math.abs(heights[detent] - height)
    if (distance < bestDistance) {
      best = detent
      bestDistance = distance
    }
  }
  return best
}

/**
 * Where a released sheet comes to rest. A flick goes to the next detent in
 * the direction of travel (the smallest detent above the current height, or
 * the largest below it); anything slower settles at the nearest.
 */
export function settleDetent(
  height: number,
  velocity: number,
  heights: DetentHeights,
): Detent {
  if (velocity >= FLICK_VELOCITY) {
    return DETENTS.find((detent) => heights[detent] > height) ?? 'large'
  }
  if (velocity <= -FLICK_VELOCITY) {
    const below = DETENTS.filter((detent) => heights[detent] < height)
    return below.at(-1) ?? 'peek'
  }
  return nearestDetent(height, heights)
}
```

- [ ] **Step 4:** Run the test again. Expected: PASS (all 6).

- [ ] **Step 5:** Commit.

```bash
pnpm check && git add packages/app/src/components/TouchSurface/detents.ts packages/app/src/components/TouchSurface/detents.test.ts && git commit -m "feat(touch): detent arithmetic for the editor rail

Three resting heights (96px, 44%, 88%), clamping with no rubber band, nearest
detent, and settle-on-release: a flick above 0.5px/ms goes one detent in the
direction of travel; a flick down from medium reaches peek and never hidden."
```

---

### Task 3: Haptics

**Files:**

- Create: `packages/mobile-runtime/src/haptics.ts`, `packages/mobile-runtime/src/haptics.test.ts`, `packages/mobile-runtime/src/capacitor/haptics.ts`
- Modify: `packages/mobile-runtime/package.json` (`exports` and `dependencies`)
- Create: `packages/app/src/lib/haptics.ts`, `packages/app/src/lib/haptics.test.ts`

**Interfaces:**

- Produces (runtime, `@chaos-master/mobile-runtime/haptics`, no Capacitor import, safe to import statically on the web):

```ts
export type ImpactStrength = 'light' | 'medium'
export type NotificationKind = 'success' | 'warning' | 'error'
export interface HapticPorts {
  impact: (strength: ImpactStrength) => Promise<void>
  notification: (kind: NotificationKind) => Promise<void>
  selectionStart: () => Promise<void>
  selectionChanged: () => Promise<void>
  selectionEnd: () => Promise<void>
}
export interface Haptics {
  impactLight(): void
  impactMedium(): void
  success(): void
  warning(): void
  error(): void
  selectionStart(): void
  selectionChanged(): void
  selectionEnd(): void
}
export const SELECTION_MIN_INTERVAL_MS = 60
export function hapticsWith(
  ports: HapticPorts,
  isEnabled: () => boolean,
  now?: () => number,
): Haptics
export const NO_HAPTICS: Haptics // every method a no-op
```

- Produces (runtime, `@chaos-master/mobile-runtime/capacitor-haptics`): `export const hapticPorts: HapticPorts`.
- Produces (app, `@/lib/haptics`): `export const haptic: Haptics`, `export const [hapticsEnabled, setHapticsEnabled]` (a `persistentSignal<boolean>('chaos-haptics', true)`), `export function loadHaptics(): Promise<void>` (idempotent).

- [ ] **Step 1:** Write the failing runtime tests in `packages/mobile-runtime/src/haptics.test.ts`.

```ts
import { describe, expect, it } from 'vitest'
import { hapticsWith, NO_HAPTICS, SELECTION_MIN_INTERVAL_MS } from './haptics'
import type { HapticPorts } from './haptics'

function fakePorts(options: { reject?: boolean } = {}) {
  const calls: string[] = []
  const answer = () =>
    options.reject
      ? Promise.reject(new Error('no vibrator'))
      : Promise.resolve()
  const ports: HapticPorts = {
    impact: (strength) => {
      calls.push(`impact:${strength}`)
      return answer()
    },
    notification: (kind) => {
      calls.push(`notification:${kind}`)
      return answer()
    },
    selectionStart: () => {
      calls.push('selectionStart')
      return answer()
    },
    selectionChanged: () => {
      calls.push('selectionChanged')
      return answer()
    },
    selectionEnd: () => {
      calls.push('selectionEnd')
      return answer()
    },
  }
  return { ports, calls }
}

describe('hapticsWith', () => {
  it('maps the vocabulary onto the ports', () => {
    const { ports, calls } = fakePorts()
    const h = hapticsWith(ports, () => true)
    h.impactLight()
    h.impactMedium()
    h.success()
    h.warning()
    h.error()
    h.selectionStart()
    h.selectionEnd()
    expect(calls).toEqual([
      'impact:light',
      'impact:medium',
      'notification:success',
      'notification:warning',
      'notification:error',
      'selectionStart',
      'selectionEnd',
    ])
  })

  it('fires nothing when disabled', () => {
    const { ports, calls } = fakePorts()
    const h = hapticsWith(ports, () => false)
    h.impactLight()
    h.selectionChanged()
    h.success()
    expect(calls).toEqual([])
  })

  it('rate-limits selectionChanged to one per 60 ms', () => {
    let t = 1000
    const { ports, calls } = fakePorts()
    const h = hapticsWith(
      ports,
      () => true,
      () => t,
    )
    h.selectionChanged()
    t += 20
    h.selectionChanged()
    t += SELECTION_MIN_INTERVAL_MS
    h.selectionChanged()
    expect(calls.filter((c) => c === 'selectionChanged')).toHaveLength(2)
  })

  it('never throws and never awaits when a port rejects', async () => {
    const { ports } = fakePorts({ reject: true })
    const h = hapticsWith(ports, () => true)
    expect(() => h.impactLight()).not.toThrow()
    await Promise.resolve()
  })

  it('has a silent stand-in', () => {
    expect(() => NO_HAPTICS.impactLight()).not.toThrow()
  })
})
```

- [ ] **Step 2:** Run `pnpm --filter @chaos-master/mobile-runtime test`. Expected: FAIL, cannot resolve `./haptics`.

- [ ] **Step 3:** Implement `packages/mobile-runtime/src/haptics.ts`.

```ts
/**
 * The haptic vocabulary: five sensations, one meaning each (DESIGN.md,
 * motion section 1). Light impact: a discrete, reversible thing happened.
 * Medium impact: a committing thing. Selection: a value or a destination
 * crossed a stop. Notification: the outcome of work the app did for the user.
 * Heavy impact is deliberately unused in v1.
 *
 * Calls are never awaited: a bridge round trip must not sit in front of a
 * visual change. The platform sits behind `HapticPorts`, so this runs in
 * tests against a fake; `./capacitor/haptics` binds it to the plugin.
 */
export type ImpactStrength = 'light' | 'medium'
export type NotificationKind = 'success' | 'warning' | 'error'

export interface HapticPorts {
  impact: (strength: ImpactStrength) => Promise<void>
  notification: (kind: NotificationKind) => Promise<void>
  selectionStart: () => Promise<void>
  selectionChanged: () => Promise<void>
  selectionEnd: () => Promise<void>
}

export interface Haptics {
  impactLight(): void
  impactMedium(): void
  success(): void
  warning(): void
  error(): void
  selectionStart(): void
  selectionChanged(): void
  selectionEnd(): void
}

/** A slider scrubbed at 120 Hz must not buzz continuously. */
export const SELECTION_MIN_INTERVAL_MS = 60

const swallow = (): undefined => undefined

export function hapticsWith(
  ports: HapticPorts,
  isEnabled: () => boolean,
  now: () => number = () => Date.now(),
): Haptics {
  let lastSelection = -Infinity
  const fire = (call: () => Promise<void>) => {
    if (!isEnabled()) return
    // A suppressed or failed haptic is not an error the user should hear about.
    call().catch(swallow)
  }
  return {
    impactLight: () => fire(() => ports.impact('light')),
    impactMedium: () => fire(() => ports.impact('medium')),
    success: () => fire(() => ports.notification('success')),
    warning: () => fire(() => ports.notification('warning')),
    error: () => fire(() => ports.notification('error')),
    selectionStart: () => fire(() => ports.selectionStart()),
    selectionChanged: () => {
      const t = now()
      if (t - lastSelection < SELECTION_MIN_INTERVAL_MS) return
      lastSelection = t
      fire(() => ports.selectionChanged())
    },
    selectionEnd: () => fire(() => ports.selectionEnd()),
  }
}

const noop = (): void => undefined

/** The web, and the native app before the plugin has loaded. */
export const NO_HAPTICS: Haptics = {
  impactLight: noop,
  impactMedium: noop,
  success: noop,
  warning: noop,
  error: noop,
  selectionStart: noop,
  selectionChanged: noop,
  selectionEnd: noop,
}
```

- [ ] **Step 4:** Run the runtime tests. Expected: PASS (21 total).

- [ ] **Step 5:** Add the Capacitor adapter `packages/mobile-runtime/src/capacitor/haptics.ts`.

```ts
/**
 * The Capacitor binding of the haptic ports. Only the native build reaches
 * this module, through the guarded dynamic import in the app's lib/haptics.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import type { HapticPorts } from '../haptics'

const IMPACT = { light: ImpactStyle.Light, medium: ImpactStyle.Medium } as const
const NOTIFICATION = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
} as const

export const hapticPorts: HapticPorts = {
  impact: (strength) => Haptics.impact({ style: IMPACT[strength] }),
  notification: (kind) => Haptics.notification({ type: NOTIFICATION[kind] }),
  selectionStart: () => Haptics.selectionStart(),
  selectionChanged: () => Haptics.selectionChanged(),
  selectionEnd: () => Haptics.selectionEnd(),
}
```

Then in `packages/mobile-runtime/package.json` add to `dependencies`: `"@capacitor/haptics": "^8.0.2"`, and to `exports` (keeping the two existing entries):

```json
    "./haptics": {
      "types": "./src/haptics.ts",
      "import": "./src/haptics.ts",
      "default": "./src/haptics.ts"
    },
    "./capacitor-haptics": {
      "types": "./src/capacitor/haptics.ts",
      "import": "./src/capacitor/haptics.ts",
      "default": "./src/capacitor/haptics.ts"
    }
```

Run `pnpm install` from the repo root (this updates `pnpm-lock.yaml`; commit it) and `pnpm --filter @chaos-master/mobile-runtime typecheck`. Expected: exit 0.

- [ ] **Step 6:** Write the failing app test `packages/app/src/lib/haptics.test.ts`.

```ts
import { describe, expect, it } from 'vitest'
import { haptic, hapticsEnabled, setHapticsEnabled } from './haptics'

describe('haptic facade', () => {
  it('is silent on the web and never throws', () => {
    expect(() => {
      haptic.impactLight()
      haptic.selectionChanged()
      haptic.success()
    }).not.toThrow()
  })

  it('remembers the Haptics setting', () => {
    expect(hapticsEnabled()).toBe(true)
    setHapticsEnabled(false)
    expect(hapticsEnabled()).toBe(false)
    setHapticsEnabled(true)
  })
})
```

- [ ] **Step 7:** Implement `packages/app/src/lib/haptics.ts`.

```ts
import { hapticsWith, NO_HAPTICS } from '@chaos-master/mobile-runtime/haptics'
import { persistentSignal } from '@/utils/persistentSignal'
import type { Haptics } from '@chaos-master/mobile-runtime/haptics'

/**
 * The app's one entry point for haptics. On the web every call is a no-op.
 * In the native build the Capacitor ports arrive through a dynamic import
 * that web builds drop (the same pattern as lib/nativeSave.ts), so the
 * plugin chunk never ships to the web.
 */

/** The Haptics switch in Settings. Native only; the web never reads it. */
export const [hapticsEnabled, setHapticsEnabled] = persistentSignal<boolean>(
  'chaos-haptics',
  true,
)

// Vite's `define` turns this into a literal in each module. The import is
// guarded by it rather than by the imported IS_NATIVE: the bundler does not
// fold constants across modules (lib/platform.ts).
declare const __NATIVE_BUILD__: boolean

let current: Haptics = NO_HAPTICS
let loading: Promise<void> | null = null

/** Binds the native ports once. Safe to call any number of times. */
export function loadHaptics(): Promise<void> {
  if (!__NATIVE_BUILD__) return Promise.resolve()
  loading ??= import('@chaos-master/mobile-runtime/capacitor-haptics').then(
    (runtime) => {
      current = hapticsWith(runtime.hapticPorts, hapticsEnabled)
    },
    (error: unknown) => {
      console.error('Haptics unavailable:', error)
    },
  )
  return loading
}

/** Delegates per call, so a binding that arrives later is picked up. */
export const haptic: Haptics = {
  impactLight: () => current.impactLight(),
  impactMedium: () => current.impactMedium(),
  success: () => current.success(),
  warning: () => current.warning(),
  error: () => current.error(),
  selectionStart: () => current.selectionStart(),
  selectionChanged: () => current.selectionChanged(),
  selectionEnd: () => current.selectionEnd(),
}
```

Add `"@chaos-master/mobile-runtime": "workspace:*"` to `packages/app/package.json` dependencies only if it is not already there (it is, for `@/lib/nativeSave`; check with `grep mobile-runtime packages/app/package.json`).

- [ ] **Step 8:** Call `void loadHaptics()` once at startup, in `packages/app/src/index.tsx`, right after the Android viewport block (import it at the top with the other imports).

- [ ] **Step 9:** Run `pnpm --filter chaos-master exec vitest run src/lib/haptics.test.ts`. Expected: PASS. Then `pnpm --filter chaos-master build` and check `ls packages/app/dist/assets | grep -ci 'capacitor\|haptics'` prints `0`; then `pnpm --filter chaos-master build:native` and check the same grep on `dist-native/assets` prints at least 1.

- [ ] **Step 10:** Commit.

```bash
pnpm check && git add pnpm-lock.yaml packages/mobile-runtime packages/app/src/lib/haptics.ts packages/app/src/lib/haptics.test.ts packages/app/src/index.tsx && git commit -m "feat(mobile): the haptic vocabulary

Five sensations behind a HapticPorts interface in mobile-runtime (light and
medium impact, selection, notification), never awaited, gated by the Haptics
setting and rate-limited for selection changes. The app's lib/haptics binds
the Capacitor ports in native builds only, through the same guarded dynamic
import as saving; the web stays silent and ships no plugin chunk."
```

---

### Task 4: Layout routing by input and platform

**Files:**

- Modify: `packages/app/src/stores/workspaceLayoutStore.ts` (lines 5-7 constants, 93-125 the raw signals and memos)
- Create: `packages/app/src/stores/workspaceLayoutStore.test.ts`
- Modify: `packages/app/src/MainWorkspace.tsx:393-422` (the phone/tablet media queries duplicated there)

**Interfaces:**

- Produces:

```ts
export type LayoutClass = 'phone' | 'tablet' | 'desktop'
export interface LayoutInput {
  readonly width: number
  readonly height: number
  readonly coarse: boolean // (pointer: coarse)
  readonly native: boolean // IS_NATIVE
  readonly preference: TouchLayoutPreference
}
export const COMPACT_MAX_SHORT_EDGE = 680 // a phone in any orientation
export const DECK_MIN_WIDTH = 900 // the tablet deck needs this much width
export function classifyLayout(input: LayoutInput): LayoutClass
export function deckFitsWidth(width: number): boolean
export const layoutClass: Accessor<LayoutClass>
export const viewportWidth: Accessor<number>
export const deckFits: Accessor<boolean> // isTablet() && viewportWidth() >= DECK_MIN_WIDTH
```

`isPhone`, `isTablet`, `isTouchLayout`, `touchLayoutPreference`, `setTouchLayoutPreference` keep their names and types. `setIsPhone` / `setIsTablet` are removed (their only callers are the block in MainWorkspace this task deletes; grep `setIsPhone\|setIsTablet\|setRawIsPhone\|setRawIsTablet` to be sure).

Rules:

1. `preference === 'desktop'` → `desktop`.
2. Otherwise, if `native || coarse || preference === 'touch'`: `phone` when `min(width, height) < 680`, else `tablet`. Never `desktop`: a tablet's browser or the native app never gets the desktop sidebar.
3. Otherwise (a fine pointer on the web) today's rules: `phone` when `width < 680`, `tablet` when `width <= 1024`, else `desktop`.

- [ ] **Step 1:** Write the failing table test.

```ts
import { describe, expect, it } from 'vitest'
import { classifyLayout, deckFitsWidth } from './workspaceLayoutStore'

const touch = (width: number, height: number) =>
  classifyLayout({
    width,
    height,
    coarse: true,
    native: true,
    preference: 'auto',
  })

describe('classifyLayout on a device', () => {
  it.each([
    [393, 852, 'phone', false],
    [852, 393, 'phone', false],
    [412, 915, 'phone', false],
    [455, 1210, 'phone', false],
    [834, 1210, 'tablet', false],
    [1210, 834, 'tablet', true],
    [800, 1280, 'tablet', false],
    [1280, 800, 'tablet', true],
    [1024, 1366, 'tablet', true],
    [1366, 1024, 'tablet', true],
  ])('%i x %i is %s, deck %s', (width, height, expected, deck) => {
    expect(touch(width, height)).toBe(expected)
    expect(deckFitsWidth(width)).toBe(deck)
  })

  it('never returns desktop while native', () => {
    for (const width of [680, 900, 1024, 1366, 2000]) {
      expect(
        classifyLayout({
          width,
          height: 1000,
          coarse: false,
          native: true,
          preference: 'auto',
        }),
      ).not.toBe('desktop')
    }
  })
})

describe('classifyLayout on the web', () => {
  const web = (width: number, height: number) =>
    classifyLayout({
      width,
      height,
      coarse: false,
      native: false,
      preference: 'auto',
    })

  it('keeps the width rules for a fine pointer', () => {
    expect(web(600, 900)).toBe('phone')
    expect(web(900, 700)).toBe('tablet')
    expect(web(1024, 700)).toBe('tablet')
    expect(web(1025, 700)).toBe('desktop')
    expect(web(1440, 900)).toBe('desktop')
  })

  it('treats a coarse pointer like a device', () => {
    expect(
      classifyLayout({
        width: 1280,
        height: 800,
        coarse: true,
        native: false,
        preference: 'auto',
      }),
    ).toBe('tablet')
  })

  it('honours the preference', () => {
    expect(
      classifyLayout({
        width: 393,
        height: 852,
        coarse: true,
        native: true,
        preference: 'desktop',
      }),
    ).toBe('desktop')
    expect(
      classifyLayout({
        width: 1440,
        height: 900,
        coarse: false,
        native: false,
        preference: 'touch',
      }),
    ).toBe('tablet')
    expect(
      classifyLayout({
        width: 500,
        height: 900,
        coarse: false,
        native: false,
        preference: 'touch',
      }),
    ).toBe('phone')
  })
})
```

- [ ] **Step 2:** Run it. Expected: FAIL, `classifyLayout` is not exported.

- [ ] **Step 3:** Implement in `workspaceLayoutStore.ts`. Keep `WIDE_LAYOUT_MIN_WIDTH`, `PHONE_MAX_WIDTH`, `TABLET_MAX_WIDTH` and `isWideLayout`, `isPhoneLayout`, `isTabletLayout`, `isTouchDevice` exported (other files import them); add:

```ts
import { IS_NATIVE } from '@/lib/platform'

export type LayoutClass = 'phone' | 'tablet' | 'desktop'

export interface LayoutInput {
  readonly width: number
  readonly height: number
  /** `(pointer: coarse)`: the primary pointer is a finger. */
  readonly coarse: boolean
  /** The Capacitor app. */
  readonly native: boolean
  readonly preference: TouchLayoutPreference
}

/** A window whose short edge is under this is a phone, in any orientation. */
export const COMPACT_MAX_SHORT_EDGE = 680
/** Below this width a tablet uses the phone rail on its bigger canvas. */
export const DECK_MIN_WIDTH = 900

/**
 * Which workspace to build. A device (the native app, or a coarse pointer on
 * the web) is a phone or a tablet, decided by the short edge so a rotated
 * phone stays a phone and an iPad in landscape stays a tablet; it never gets
 * the desktop sidebar. A fine pointer on the web keeps the width rules the
 * web has always had.
 */
export function classifyLayout(input: LayoutInput): LayoutClass {
  if (input.preference === 'desktop') return 'desktop'
  const device = input.native || input.coarse || input.preference === 'touch'
  if (device) {
    return Math.min(input.width, input.height) < COMPACT_MAX_SHORT_EDGE
      ? 'phone'
      : 'tablet'
  }
  if (input.width < PHONE_MAX_WIDTH) return 'phone'
  if (input.width <= TABLET_MAX_WIDTH) return 'tablet'
  return 'desktop'
}

export function deckFitsWidth(width: number): boolean {
  return width >= DECK_MIN_WIDTH
}
```

Then replace the `rawIsPhone` / `rawIsTablet` signals, their `matchMedia` listeners and the `isPhone` / `isTablet` memos (lines 95-125) with one source:

```ts
const readWindow = () => ({
  width: typeof window === 'undefined' ? 1024 : window.innerWidth,
  height: typeof window === 'undefined' ? 768 : window.innerHeight,
})

const [viewport, setViewport] = createSignal(readWindow())
const [coarsePointer, setCoarsePointer] = createSignal(
  typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches,
)

if (typeof window !== 'undefined') {
  // One listener; the class is derived, so a rotation or a Split View
  // resize re-routes without a reload.
  window.addEventListener('resize', () => setViewport(readWindow()))
  if (typeof window.matchMedia === 'function') {
    window
      .matchMedia('(pointer: coarse)')
      .addEventListener?.('change', (e) => setCoarsePointer(e.matches))
  }
}

export const viewportWidth = createMemo(() => viewport().width)

export const layoutClass = createMemo<LayoutClass>(() =>
  classifyLayout({
    ...viewport(),
    coarse: coarsePointer(),
    native: IS_NATIVE,
    preference: touchLayoutPreference(),
  }),
)

export const isPhone = createMemo(() => layoutClass() === 'phone')
export const isTablet = createMemo(() => layoutClass() === 'tablet')
export const isTouchLayout = createMemo(() => isPhone() || isTablet())
/** The tablet shows the side deck; below the threshold it uses the phone rail. */
export const deckFits = createMemo(
  () => isTablet() && deckFitsWidth(viewportWidth()),
)

export { touchLayoutPreference, setTouchLayoutPreference }
```

Update the `export { ... setRawIsPhone as setIsPhone, setRawIsTablet as setIsTablet }` block accordingly (remove the two setters) and remove `setIsPhone` / `setIsTablet` from the `WorkspaceLayoutStore` interface and from `createWorkspaceLayoutStore` if they are wired there (grep the file).

- [ ] **Step 4:** In `MainWorkspace.tsx:393-422`, delete `mqPhone`, `mqTablet`, `setIsPhone(...)`, `setIsTablet(...)`, `phoneHandler`, `tabletHandler` and their `addEventListener`/`removeEventListener` lines; keep `mq` (isMobile / compact) exactly as it is, and replace `if (mq.matches || mqPhone.matches) setCompact(true)` with `if (mq.matches || isPhone()) setCompact(true)`. Remove `setIsPhone` and `setIsTablet` from the destructuring near line 253-257 and any import of `PHONE_MAX_WIDTH` / `TABLET_MAX_WIDTH` that becomes unused.

- [ ] **Step 5:** Run `pnpm check` and the full app test suite. Expected: both green. If a test relied on `setIsPhone` (grep the tests), replace it with `window.innerWidth = …; window.dispatchEvent(new Event('resize'))`.

- [ ] **Step 6:** Commit.

```bash
git add packages/app/src/stores/workspaceLayoutStore.ts packages/app/src/stores/workspaceLayoutStore.test.ts packages/app/src/MainWorkspace.tsx && git commit -m "feat(app): route the touch layout by input and platform

A device (the native app, or a coarse pointer on the web) is a phone or a
tablet by its short edge, never the desktop workspace: an iPad in landscape
and a Galaxy Tab S9+ used to fall through to the sidebar, and a rotated
iPhone became a tablet. A fine pointer on the web keeps the width rules.
One resize listener replaces three media queries and their copy in
MainWorkspace; deckFits says whether a tablet is wide enough for the deck."
```

---

### Task 5: The top bar (`TouchHUD`)

**Files:**

- Modify: `packages/app/src/components/TouchSurface/TouchHUD.tsx`
- Modify: `packages/app/src/components/TouchSurface/TouchSurface.module.css` (`.topHud`, `.hudHomeBtn`, `.hudButton`, `.hudTitle*`, `.moreMenu*`)
- Modify: `packages/app/src/components/TouchSurface/TouchSurface.test.tsx` (the `TouchHUD` cases)

**Interfaces:**

- `TouchHUDProps` gains `onOpenSettings?: () => void`, `onOpenDocs?: () => void`, `onOpenBenchmark?: () => void`, `onShare?: () => void`, `onDesktopLayout?: () => void` and loses `onFlashExport`, `onSnapshot`, `onRandomize`, `onMutate` (the shutter and the Vary chip own those now). `onOpenExportModal`, `onOpenDrawer`, `onPickGallery`, `onUndo`, `onRedo`, `canUndo`, `canRedo`, `ctx`, `flame` stay.

Geometry (B/components.md section 6): a floating glass pill, 44 px tall, centred, `max-width: calc(100% - 40px)`, `top: max(var(--la-s-2), calc(var(--la-safe-top) + var(--la-s-2)))`; five 44 x 44 buttons (glyph 22); title `600 15px/20px`, `max-width: 160px`, ellipsised. Order: Library (`GridIcon`, `aria-label="Library"`), title, Undo, Redo, More. Undo and Redo render `disabled` instead of disappearing. The title fallback is `Untitled flame`. Tapping the title keeps today's tooltip. The More button opens the existing popover with these items, in this order, each closing the menu: `Export options` (`Download`, `props.onOpenExportModal`), `Share link` (`Share`, `props.onShare`), `Advanced tools` (`SidebarPanel`, `props.onOpenDrawer`), `Lumen Arcade` (`Zap`, `setActiveTab('arcade')` from `@/lib/activeTab`), `Documentation` (`Book`, `props.onOpenDocs`), `Settings and more` (`Info`, `props.onOpenSettings`), `Desktop layout` (`Menu`, `props.onDesktopLayout`). Items whose handler prop is undefined are not rendered. Haptics: `haptic.impactLight()` on Undo and Redo press (`onPointerDown`), nothing on More.

- [ ] **Step 1:** Update the `TouchHUD` tests first: the Library button is found by `screen.getByRole('button', { name: 'Library' })` and calls `onPickGallery`; `Undo` / `Redo` are disabled when `canUndo`/`canRedo` return false and call `onUndo`/`onRedo` otherwise; the More menu lists `Export options`, `Settings and more` when their props are given and omits `Share link` when `onShare` is absent; the title reads `Untitled flame` when the flame has no name (build the ctx with `createMockCommandContext()` and set `metadata.name` to an empty string via the context's setter, or assert against the mock's own name and add a second render with a nameless flame). Run them: expected FAIL.

- [ ] **Step 2:** Rewrite the JSX to the structure above. Remove `handleFlashExport`, the snapshot button, `MoreDotsIcon` stays. Replace the `.topHud` / `.hudHomeBtn` / `.hudButton` / `.hudTitle*` / `.moreMenu*` rules in `TouchSurface.module.css` with token-based rules; the essential ones:

```css
.topHud {
  position: fixed;
  top: max(var(--la-s-2), calc(var(--la-safe-top) + var(--la-s-2)));
  left: 50%;
  transform: translateX(-50%);
  z-index: 41;
  height: var(--la-hud-h);
  max-width: calc(100% - 40px);
  display: flex;
  align-items: center;
  gap: var(--la-s-1);
  padding: 0 var(--la-s-1);
  border-radius: var(--la-r-pill);
  background: var(--la-glass);
  backdrop-filter: var(--la-glass-blur);
  -webkit-backdrop-filter: var(--la-glass-blur);
  border: var(--la-glass-edge);
  box-shadow: var(--la-glass-shadow);
  box-sizing: border-box;
}
.hudButton {
  width: var(--la-tap);
  height: var(--la-hud-h);
  display: grid;
  place-items: center;
  border: 0;
  background: none;
  color: var(--la-ink);
  border-radius: var(--la-r-pill);
  transition:
    background var(--la-dur-press) var(--la-ease),
    transform var(--la-dur-press) var(--la-ease);
}
.hudButton:active:not(:disabled) {
  transform: scale(0.94);
}
.hudButton:disabled {
  color: var(--la-ink-4);
}
.hudButtonIcon {
  width: 22px;
  height: 22px;
}
.hudTitleText {
  font: 600 15px/20px var(--la-font-body);
  color: var(--la-ink);
  max-width: 160px;
  padding: 0 var(--la-s-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .hudButton {
    transition: none;
  }
}
```

- [ ] **Step 3:** Run the TouchSurface tests and `pnpm check`. Expected: PASS (the `MobileBottomSurface` cases still pass; they go in Task 6).

- [ ] **Step 4:** Commit.

```bash
git add packages/app/src/components/TouchSurface && git commit -m "feat(touch): the phone top bar

A 44px glass pill under the status bar: Library, the flame's name, Undo,
Redo and More. Undo and Redo draw their disabled state instead of vanishing;
the snapshot moves to the rail's shutter and Mutate and Randomize to its Vary
chip. The More menu carries what the touch layout otherwise cannot reach:
export options, share, advanced tools, the Arcade, documentation, settings
and the desktop layout."
```

---

### Task 6: The rail

**Files:**

- Create: `packages/app/src/components/TouchSurface/EditorRail.tsx`, `EditorRail.module.css`, `EditorRail.test.tsx`
- Modify: `packages/app/src/components/TouchSurface/types.ts` (`TouchTab` gains `'vary'`; `TouchControlSurfaceProps` gains `tab?: Accessor<TouchTab>`, `hideTabRow?: boolean`, `hideFooter?: boolean`; add `EditorRailProps`)
- Modify: `packages/app/src/components/TouchSurface/TouchControlSurface.tsx` (controlled tab, the Vary panel, hidden tab row and footer)
- Modify: `packages/app/src/components/TouchSurface/index.ts` (export `EditorRail`, stop exporting `MobileBottomSurface`)
- Delete: `packages/app/src/components/TouchSurface/MobileBottomSurface.tsx`
- Modify: `packages/app/src/components/TouchSurface/TouchSurface.test.tsx` (replace the `MobileBottomSurface` cases with `EditorRail` ones, or move them to `EditorRail.test.tsx`)
- Modify: `packages/app/index.html:7` (viewport)

**Interfaces:**

- `EditorRailProps`:

```ts
export interface EditorRailProps {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
  onRandomize: () => void
  onMutate: () => void
  onQuickExport: () => void
  onOpenExportOptions: () => void
  onOpenDrawer?: () => void
  /** The height of the viewport the sheet covers at its current detent, in px; 0 at peek. */
  onCoveredHeightChange?: (px: number) => void
}
```

- `TouchControlSurfaceProps` additions: `tab?: Accessor<TouchTab>` (when given, the surface follows it and its own tab row is not the source of truth), `hideTabRow?: boolean`, `hideFooter?: boolean`. `TouchTab = 'variations' | 'shape' | 'colour' | 'vary'`.

Behaviour (A/screens.md 0.4, B/motion.md 2.1-2.3, 2.9):

- One `<section role="region" aria-label="Editor controls">` fixed to the bottom, `z-index: 40`, whose sheet panel's height is `heightOf(detent)` from Task 2 (or the live drag height). It contains, top to bottom: a grabber row (36 x 5 handle, 24 px tall hit area), the peek row, then the body.
- The peek row: four chips `Variations` (`VariationSpiral`), `Shape` (`ShapeTriangle`), `Colour` (`ColourWedge`), `Vary` (`Shuffle`) in a `role="tablist"` (`role="tab"`, `aria-selected`), each 44 px tall, glyph 26, label `var(--la-t-tab)`, active chip `color: var(--la-accent); background: var(--la-accent-wash)`; then the shutter: a 56 x 56 circle (`CameraIcon`, `aria-label="Save image"`, Ember glyph on glass) outboard on the right, `flex: 0 0 auto`.
- Detent rules: at `peek`, tapping any chip selects it and goes to `medium`. At `medium` or `large`, tapping the selected chip returns to `peek`; tapping another chip switches the panel and keeps the detent.
- Drag: `pointerdown` on the grabber row or on the peek row's background (not on a chip or the shutter: check `e.target === e.currentTarget` or use a dedicated drag surface element behind the chips) starts a drag; `pointermove` sets the live height `clampSheetHeight(startHeight + (startY - clientY))`; velocity is `(lastY - clientY) / (timeStamp - lastTimeStamp)` px/ms from the last two samples; `pointerup`/`pointercancel` settles with `settleDetent(height, velocity)`. Use `setPointerCapture?.(pointerId)` (optional chaining: happy-dom has no pointer capture). While dragging the panel has no transition; on settle it transitions `height var(--la-dur-sheet) var(--la-ease)`; under `prefers-reduced-motion: reduce` no transition.
- Haptics (`haptic` from `@/lib/haptics`): `impactLight()` at `pointerdown` on a chip and on the shutter; `selectionChanged()` when a drag crosses a detent boundary (`nearestDetent` changes); `impactLight()` when a settle changes the detent; `impactMedium()` on Randomize and `impactLight()` on Mutate (inside the Vary panel's buttons, before calling the prop).
- The shutter: `onClick` → `props.onQuickExport()`; a long press (500 ms `pointerdown` without `pointerup`/`pointercancel`/`pointerleave`) → `props.onOpenExportOptions()` and the following click is suppressed.
- `onCoveredHeightChange(px)` is called with `0` at peek and with `heightOf(detent) - PEEK_HEIGHT` at medium/large, after every settle (not during a drag).
- The body: `<TouchControlSurface mode="bottom-sheet" tab={activeTab} hideTabRow hideFooter ctx flame onRandomize onMutate onOpenDrawer />` inside a scrolling container (`overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y`). At `large` a 120 px strip of canvas stays visible above (that is what 88% leaves).
- The Vary panel (in `TouchControlSurface` when `activeTab() === 'vary'`): two 56 px capsule buttons, `Mutate` (`Sparkle`) and `Randomize` (`Shuffle`, filled accent), plus one line of caption `Mutate nudges the current flame. Randomize starts a new one.`; the surface's old footer is not rendered when `hideFooter`.
- The viewport height comes from a `createSignal(window.innerHeight)` updated on `resize` (use `window.visualViewport?.height ?? window.innerHeight`).
- Dock padding: `padding: 0 max(var(--la-float-inset), var(--la-safe-left)) max(var(--la-s-2), calc(var(--la-safe-bottom) + var(--la-s-2))) max(var(--la-float-inset), var(--la-safe-right))`. The sheet panel: `border-radius: var(--la-r-sheet) var(--la-r-sheet) 0 0`, `background: var(--la-glass-strong)` with blur, `border: var(--la-glass-edge)`, `box-shadow: var(--la-e-sheet)`, `contain: layout paint`.

- [ ] **Step 1:** Write the failing tests in `EditorRail.test.tsx`.

```tsx
import '@/commands/builtins'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { EditorRail } from './EditorRail'
import { PEEK_HEIGHT } from './detents'

const impactLight = vi.fn()
const impactMedium = vi.fn()
const selectionChanged = vi.fn()
vi.mock('@/lib/haptics', () => ({
  haptic: {
    impactLight: () => impactLight(),
    impactMedium: () => impactMedium(),
    selectionChanged: () => selectionChanged(),
    success: () => undefined,
    warning: () => undefined,
    error: () => undefined,
    selectionStart: () => undefined,
    selectionEnd: () => undefined,
  },
}))

function mount(extra: Partial<Parameters<typeof EditorRail>[0]> = {}) {
  const ctx = createMockCommandContext()
  const props = {
    ctx,
    flame: ctx.flameDescriptor,
    onRandomize: vi.fn(),
    onMutate: vi.fn(),
    onQuickExport: vi.fn(),
    onOpenExportOptions: vi.fn(),
    onCoveredHeightChange: vi.fn(),
    ...extra,
  }
  render(() => <EditorRail {...props} />)
  return props
}

const sheet = () => screen.getByTestId('editor-rail-sheet')

describe('EditorRail', () => {
  beforeEach(() => {
    window.innerHeight = 852
    impactLight.mockClear()
    impactMedium.mockClear()
    selectionChanged.mockClear()
  })
  afterEach(cleanup)

  it('starts at peek with four chips and the shutter', () => {
    mount()
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT}px`)
    expect(
      screen.getAllByRole('tab').map((t) => t.textContent?.trim()),
    ).toEqual(['Variations', 'Shape', 'Colour', 'Vary'])
    expect(screen.getByRole('button', { name: 'Save image' })).toBeTruthy()
  })

  it('opens to medium on a chip tap and back to peek on the same chip', () => {
    const props = mount()
    const shape = screen.getByRole('tab', { name: 'Shape' })
    fireEvent.pointerDown(shape)
    fireEvent.click(shape)
    expect(sheet().style.height).toBe('375px')
    expect(shape.getAttribute('aria-selected')).toBe('true')
    expect(impactLight).toHaveBeenCalledTimes(2) // touch-down, then the latch
    expect(props.onCoveredHeightChange).toHaveBeenLastCalledWith(
      375 - PEEK_HEIGHT,
    )
    fireEvent.click(shape)
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT}px`)
    expect(props.onCoveredHeightChange).toHaveBeenLastCalledWith(0)
  })

  it('switches panels without changing the detent', () => {
    mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Colour' }))
    expect(sheet().style.height).toBe('375px')
    expect(
      screen.getByRole('tab', { name: 'Colour' }).getAttribute('aria-selected'),
    ).toBe('true')
  })

  it('follows a drag and settles by velocity, never below peek', () => {
    mount()
    const grabber = screen.getByTestId('editor-rail-grabber')
    fireEvent.pointerDown(grabber, { clientY: 800, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 700, pointerId: 1 })
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT + 100}px`)
    fireEvent.pointerUp(grabber, { clientY: 700, pointerId: 1 })
    expect(['96px', '375px']).toContain(sheet().style.height)
    fireEvent.pointerDown(grabber, { clientY: 500, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 900, pointerId: 1 })
    fireEvent.pointerUp(grabber, { clientY: 900, pointerId: 1 })
    expect(sheet().style.height).toBe(`${PEEK_HEIGHT}px`)
  })

  it('fires the shutter on tap and export options on a long press', () => {
    vi.useFakeTimers()
    const props = mount()
    const shutter = screen.getByRole('button', { name: 'Save image' })
    fireEvent.pointerDown(shutter)
    fireEvent.pointerUp(shutter)
    fireEvent.click(shutter)
    expect(props.onQuickExport).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(shutter)
    vi.advanceTimersByTime(600)
    fireEvent.pointerUp(shutter)
    fireEvent.click(shutter)
    expect(props.onOpenExportOptions).toHaveBeenCalledTimes(1)
    expect(props.onQuickExport).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('reaches Mutate and Randomize through the Vary chip', () => {
    const props = mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Vary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Randomize' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mutate' }))
    expect(props.onRandomize).toHaveBeenCalledTimes(1)
    expect(props.onMutate).toHaveBeenCalledTimes(1)
    expect(impactMedium).toHaveBeenCalledTimes(1)
  })
})
```

Note: the drag test's velocity depends on `timeStamp` deltas that happy-dom may report as 0; the implementation must treat a non-positive `dt` as "no velocity sample" (keep the previous velocity, initially 0). The first release therefore settles at the nearest detent, which is why the test accepts either.

- [ ] **Step 2:** Run `pnpm --filter chaos-master exec vitest run src/components/TouchSurface/EditorRail.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3:** Implement `EditorRail.tsx`. The gesture core:

```tsx
import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { CameraIcon, ColourWedge, ShapeTriangle, Shuffle, VariationSpiral, } from '@/icons'
import { haptic } from '@/lib/haptics'
import { clampSheetHeight, detentHeights, heightOf, nearestDetent, PEEK_HEIGHT, settleDetent, } from './detents'
import ui from './EditorRail.module.css'
import { TouchControlSurface } from './TouchControlSurface'
import type { Detent } from './detents'
import type { EditorRailProps, TouchTab } from './types'

const LONG_PRESS_MS = 500

const CHIPS: readonly {
  readonly tab: TouchTab
  readonly label: string
  readonly Icon: typeof VariationSpiral
}[] = [
  { tab: 'variations', label: 'Variations', Icon: VariationSpiral },
  { tab: 'shape', label: 'Shape', Icon: ShapeTriangle },
  { tab: 'colour', label: 'Colour', Icon: ColourWedge },
  { tab: 'vary', label: 'Vary', Icon: Shuffle },
]

function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight
}

export function EditorRail(props: EditorRailProps) {
  const [detent, setDetent] = createSignal<Detent>('peek')
  const [tab, setTab] = createSignal<TouchTab>('variations')
  const [vh, setVh] = createSignal(viewportHeight())
  const [dragHeight, setDragHeight] = createSignal<number | null>(null)
  const heights = createMemo(() => detentHeights(vh()))
  const sheetHeight = () => dragHeight() ?? heightOf(detent(), heights())

  onMount(() => {
    const onResize = () => setVh(viewportHeight())
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    onCleanup(() => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    })
  })

  function settle(target: Detent) {
    if (target !== detent()) {
      setDetent(target)
      haptic.impactLight()
    }
    props.onCoveredHeightChange?.(
      target === 'peek' ? 0 : heightOf(target, heights()) - PEEK_HEIGHT,
    )
  }

  function onChip(next: TouchTab) {
    if (detent() === 'peek') {
      setTab(next)
      settle('medium')
    } else if (next === tab()) {
      settle('peek')
    } else {
      setTab(next)
    }
  }

  // The drag: the sheet tracks the finger 1:1, no easing; velocity in px/ms
  // from the last two samples, positive when the sheet grows.
  let drag: {
    startY: number
    startHeight: number
    lastY: number
    lastT: number
    velocity: number
    lastDetent: Detent
  } | null = null

  function onGrabDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    drag = {
      startY: e.clientY,
      startHeight: sheetHeight(),
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      lastDetent: nearestDetent(sheetHeight(), heights()),
    }
  }
  function onGrabMove(e: PointerEvent) {
    if (!drag) return
    const dt = e.timeStamp - drag.lastT
    if (dt > 0) drag.velocity = (drag.lastY - e.clientY) / dt
    drag.lastY = e.clientY
    drag.lastT = e.timeStamp
    const h = clampSheetHeight(
      drag.startHeight + (drag.startY - e.clientY),
      heights(),
    )
    const crossed = nearestDetent(h, heights())
    if (crossed !== drag.lastDetent) {
      haptic.selectionChanged()
      drag.lastDetent = crossed
    }
    setDragHeight(h)
  }
  function onGrabUp() {
    if (!drag) return
    const target = settleDetent(sheetHeight(), drag.velocity, heights())
    drag = null
    setDragHeight(null)
    settle(target)
  }

  // The shutter: tap saves, a long press opens the options.
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressed = false
  function onShutterDown() {
    haptic.impactLight()
    longPressed = false
    pressTimer = setTimeout(() => {
      longPressed = true
      props.onOpenExportOptions()
    }, LONG_PRESS_MS)
  }
  function cancelPress() {
    if (pressTimer !== null) clearTimeout(pressTimer)
    pressTimer = null
  }
  function onShutterClick() {
    if (longPressed) {
      longPressed = false
      return
    }
    props.onQuickExport()
  }

  const grabHandlers = {
    onPointerDown: onGrabDown,
    onPointerMove: onGrabMove,
    onPointerUp: onGrabUp,
    onPointerCancel: onGrabUp,
  }

  return (
    <section class={ui.dock} role="region" aria-label="Editor controls">
      <div
        class={ui.sheet}
        classList={{ [ui.dragging!]: dragHeight() !== null }}
        style={{ height: `${sheetHeight()}px` }}
        data-testid="editor-rail-sheet"
        data-detent={detent()}
      >
        <div
          class={ui.grabberRow}
          data-testid="editor-rail-grabber"
          {...grabHandlers}
        >
          <div class={ui.grabber} />
        </div>
        <div class={ui.peekRow}>
          <div class={ui.dragSurface} {...grabHandlers} />
          <div class={ui.chips} role="tablist" aria-label="Tools">
            {CHIPS.map((chip) => (
              <button
                type="button"
                role="tab"
                class={ui.chip}
                aria-selected={tab() === chip.tab && detent() !== 'peek'}
                onPointerDown={() => haptic.impactLight()}
                onClick={() => onChip(chip.tab)}
              >
                <chip.Icon class={ui.chipIcon} />
                {chip.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            class={ui.shutter}
            aria-label="Save image"
            onPointerDown={onShutterDown}
            onPointerUp={cancelPress}
            onPointerCancel={cancelPress}
            onPointerLeave={cancelPress}
            onClick={onShutterClick}
          >
            <CameraIcon class={ui.shutterIcon} />
          </button>
        </div>
        <Show when={detent() !== 'peek'}>
          <div class={ui.body}>
            <TouchControlSurface
              ctx={props.ctx}
              flame={props.flame}
              mode="bottom-sheet"
              tab={tab}
              hideTabRow
              hideFooter
              onRandomize={props.onRandomize}
              onMutate={props.onMutate}
              onOpenDrawer={props.onOpenDrawer}
            />
          </div>
        </Show>
      </div>
    </section>
  )
}
```

`aria-selected` in the test expects the string `'true'` only when the chip is selected and the sheet is open; keep that exact rule. The chip row must reserve the shutter's width: `.chips { flex: 1 1 auto; min-width: 0; display: flex; gap: 2px; overflow-x: auto; }` and `.chip { flex: 1 0 68px; height: var(--la-tap); ... }`.

`EditorRail.module.css`, the essential rules:

```css
.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  padding: 0 max(var(--la-float-inset), var(--la-safe-right))
    max(var(--la-s-2), calc(var(--la-safe-bottom) + var(--la-s-2)))
    max(var(--la-float-inset), var(--la-safe-left));
  pointer-events: none;
}
.sheet {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  border-radius: var(--la-r-sheet) var(--la-r-sheet) 0 0;
  background: var(--la-glass-strong);
  backdrop-filter: var(--la-glass-blur);
  -webkit-backdrop-filter: var(--la-glass-blur);
  border: var(--la-glass-edge);
  box-shadow: var(--la-e-sheet);
  box-sizing: border-box;
  overflow: hidden;
  contain: layout paint;
  transition: height var(--la-dur-sheet) var(--la-ease);
}
.sheet.dragging {
  transition: none;
}
.grabberRow {
  height: 24px;
  display: grid;
  place-items: center;
  touch-action: none;
  cursor: grab;
}
.grabber {
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--la-hairline-strong);
}
.peekRow {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--la-s-2);
  padding: 0 var(--la-s-2) var(--la-s-2);
}
.dragSurface {
  position: absolute;
  inset: 0;
  touch-action: none;
}
.chips {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}
.chip {
  flex: 1 0 68px;
  height: var(--la-tap);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 0;
  background: none;
  border-radius: var(--la-r-pill);
  color: var(--la-ink-2);
  font: var(--la-t-tab);
  transition:
    background var(--la-dur-fast) var(--la-ease),
    color var(--la-dur-fast) var(--la-ease);
}
.chip[aria-selected='true'] {
  color: var(--la-accent);
  background: var(--la-accent-wash);
}
.chipIcon {
  width: 26px;
  height: 26px;
}
.shutter {
  position: relative;
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--la-glass);
  border: var(--la-glass-edge);
  box-shadow: var(--la-glass-shadow);
  color: var(--la-accent);
  transition: transform var(--la-dur-press) var(--la-ease);
}
.shutter:active {
  transform: scale(0.94);
}
.shutterIcon {
  width: 26px;
  height: 26px;
}
.body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
@media (prefers-reduced-motion: reduce) {
  .sheet,
  .chip,
  .shutter {
    transition: none;
  }
}
```

- [ ] **Step 4:** In `types.ts` add `'vary'` to `TouchTab`, the three optional props to `TouchControlSurfaceProps`, and `EditorRailProps` (above). Remove `MobileBottomSurfaceProps`. In `TouchControlSurface.tsx`: follow the controlled tab (`createEffect(() => { const t = props.tab?.(); if (t) setActiveTab(t) })`), wrap the tab row in `<Show when={!props.hideTabRow}>`, wrap the footer in `<Show when={!props.hideFooter}>`, and add the `vary` panel next to the other three:

```tsx
<Show when={activeTab() === 'vary'}>
  <div class={ui.varyPanel}>
    <button
      type="button"
      class={ui.varyButton}
      onPointerDown={() => haptic.impactLight()}
      onClick={() => {
        if (props.onMutate) props.onMutate()
        else dispatch('flame.mutate')
      }}
    >
      <Sparkle class={ui.hudButtonIcon} /> Mutate
    </button>
    <button
      type="button"
      class={`${ui.varyButton} ${ui.varyButtonPrimary}`}
      onPointerDown={() => haptic.impactMedium()}
      onClick={() => {
        if (props.onRandomize) props.onRandomize()
        else dispatch('flame.randomize')
      }}
    >
      <Shuffle class={ui.hudButtonIcon} /> Randomize
    </button>
    <p class={ui.varyCaption}>
      Mutate nudges the current flame. Randomize starts a new one.
    </p>
  </div>
</Show>
```

with `.varyPanel { display: grid; gap: var(--la-s-3); padding: var(--la-s-4); }`, `.varyButton { height: 56px; border-radius: var(--la-r-pill); border: var(--la-glass-edge); background: var(--la-surface-2); color: var(--la-ink); font: var(--la-t-body-sm); display: flex; align-items: center; justify-content: center; gap: var(--la-s-2); }`, `.varyButtonPrimary { background: var(--la-accent); color: var(--la-ink-invert); border-color: transparent; }`, `.varyCaption { margin: 0; font: var(--la-t-caption); color: var(--la-ink-3); text-align: center; }` in `TouchSurface.module.css`. Move Mutate and Randomize out of the `tablet-deck` mode's footer only if a later task says so (it does not: the deck keeps its footer as its action bar).

- [ ] **Step 5:** Delete `MobileBottomSurface.tsx`; update `index.ts` (`export * from './EditorRail'`); in `TouchSurface.test.tsx` remove the `MobileBottomSurface` cases (their behaviours are covered by `EditorRail.test.tsx`). In `packages/app/index.html:7` the viewport content becomes `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` (the Android block in `src/index.tsx` strips only `viewport-fit=cover`, so this survives it).

- [ ] **Step 6:** Run the rail tests, the TouchSurface tests and `pnpm check`. Expected: PASS. (`MainWorkspace.tsx` still imports `MobileBottomSurface` and fails typecheck at this point; that is fixed in Task 7. If `pnpm check` must be green to commit, do the minimal `MainWorkspace` swap from Task 7 Step 1 now and fold it into this commit.)

- [ ] **Step 7:** Commit.

```bash
git add -A packages/app/src/components/TouchSurface packages/app/index.html packages/app/src/MainWorkspace.tsx && git commit -m "feat(touch): the editor rail

One persistent surface at three detents replaces the pill bar and its
sheet: peek (chips and the shutter), medium (the chosen tool's controls,
44% of the screen), large (its full library, 88%). The sheet follows the
finger 1:1, settles by velocity, and never goes below peek. Chips select a
tool; the selected chip closes it; the shutter saves on a tap and opens the
export options on a long press. Mutate and Randomize live in a Vary panel.
Haptics: light impact on a chip and the shutter, selection at each detent
crossing, light impact at the latch, medium impact on Randomize."
```

---

### Task 7: Mount the rail and the canvas inset

**Files:**

- Modify: `packages/app/src/MainWorkspace.tsx` (the `isPhone()` block at lines 3403-3451, the imports at line 25, the `SoftwareVersion` render, the `AdvancedToolsDrawer` block)
- Modify: `packages/app/src/App.module.css` (the canvas container)

**Interfaces:**

- Consumes: `EditorRail` (Task 6), `TouchHUD` props (Task 5), `deckFits` / `isTouchLayout` (Task 4).

- [ ] **Step 1:** Replace the `<Show when={isPhone()}>` block with one that renders for the phone AND for a tablet too narrow for the deck:

```tsx
<Show when={isPhone() || (isTablet() && !deckFits())}>
  <TouchHUD
    ctx={cmdContext}
    flame={effectiveFlame}
    canUndo={undoRouter.canUndo}
    canRedo={undoRouter.canRedo}
    onUndo={() => {
      executeCommand('history.undo', cmdContext)
    }}
    onRedo={() => {
      executeCommand('history.redo', cmdContext)
    }}
    onOpenExportModal={() => {
      executeCommand('export.png', cmdContext)
    }}
    onShare={() => {
      void showShareLinkModal()
    }}
    onOpenDrawer={() => setTouchDrawerOpen(true)}
    onPickGallery={pickGalleryFlame}
    onOpenSettings={openHelp}
    onOpenDocs={openDocs}
    onOpenBenchmark={openBenchmark}
    onDesktopLayout={() => {
      setTouchLayoutPreference('desktop')
      showToast('Switched to the desktop layout', 3500)
    }}
  />
  <EditorRail
    ctx={cmdContext}
    flame={effectiveFlame}
    onRandomize={() => {
      executeCommand('flame.randomize', cmdContext)
    }}
    onMutate={() => {
      executeCommand('flame.mutate', cmdContext)
    }}
    onQuickExport={quickExport}
    onOpenExportOptions={() => {
      executeCommand('export.png', cmdContext)
    }}
    onOpenDrawer={() => setTouchDrawerOpen(true)}
    onCoveredHeightChange={setRailInset}
  />
</Show>
```

where `openHelp`, `openDocs`, `openBenchmark` are the functions that reach `SoftwareVersion` as `showHelp`, `showDocs`, `showBenchmark`. `SoftwareVersion` is rendered by `packages/app/src/components/WorkspaceModalsHost/WorkspaceModalsHost.tsx`; trace where those three props come from (they originate in `MainWorkspace` or in the modals host itself) and pass the same functions to `TouchHUD`, lifting them to `MainWorkspace` if they live in the host. `import { deckFits, isPhone, isTablet, isTouchLayout, setTouchLayoutPreference } from '@/stores/workspaceLayoutStore'` (adjust to what MainWorkspace already imports from the store).

- [ ] **Step 2:** Add `const [railInset, setRailInset] = createSignal(0)` next to `touchDrawerOpen` (line 293), and pass it to the canvas container as a custom property. Find the element with `class={ui['canvas-container']}` (or the `CanvasViewport` wrapper that carries `grid-area: viewport`) and add `style={{ '--rail-inset': `${railInset()}px` }}`. In `App.module.css` add to `.canvas-container`:

```css
/* The rail's sheet covers the bottom of the canvas; half of that height
     pans the picture up so the subject stays in view (DESIGN.md, Phase A).
     A transform, not a camera change: nothing enters the flame or its undo
     history, and it reverts when the sheet closes. */
transform: translateY(calc(var(--rail-inset, 0px) / -2));
transition: transform var(--la-dur-sheet) var(--la-ease);
```

and under `@media (prefers-reduced-motion: reduce)` in the same file, `.canvas-container { transition: none; }`.

- [ ] **Step 3:** Hide the floating `SoftwareVersion` trigger on touch layouts: wrap its render in `<Show when={!isTouchLayout()}>` (its menu items are in the top bar's More menu now). Keep the tablet-deck path (`isTablet() && deckFits()`) rendering `TabletInspectorDeck` as today (restyled in Task 8).

- [ ] **Step 4:** `pnpm check`, full app tests, `pnpm --filter chaos-master build:native`. Expected: green. Then a manual check in the dev server at a 393 x 852 viewport (`pnpm --filter chaos-master dev`, the browser's device mode): the top bar sits under the status bar area, the rail at the bottom, a chip opens the sheet to 44%, the canvas shifts up by half the covered height, the shutter saves.

- [ ] **Step 5:** Commit.

```bash
git add packages/app/src/MainWorkspace.tsx packages/app/src/App.module.css && git commit -m "feat(app): mount the rail on phones and narrow tablets

The phone layout and a tablet under 900px wide get the top bar and the rail;
the canvas pans up by half the sheet's covered height through a transform,
so the flame's camera and its undo history are untouched. The floating
version menu leaves the touch layouts: its items moved to the top bar's More."
```

---

### Task 8: The tablet deck

**Files:**

- Modify: `packages/app/src/components/TouchSurface/TabletInspectorDeck.tsx`
- Create: `packages/app/src/components/TouchSurface/TabletDeck.module.css`
- Modify: `packages/app/src/App.module.css:21-25` (`.tabletLayout` columns)
- Modify: `packages/app/src/components/TouchSurface/TouchSurface.module.css` (delete `.tabletInspectorPane`, `.tabletDeck*`, `.tabletFlame*` once the new module owns them; delete `.bottomSheet`, `.collapsedPillBar`, `.expandedSheet`, `.sheetHandle*`; replace every remaining hex colour with a token)
- Create: `packages/app/src/components/TouchSurface/tokens.test.ts`
- Delete: `packages/app/src/components/TouchSurface/TabletSplitLayout.tsx` (no call site; grep to confirm) and its `index.ts` export and test cases.

**Interfaces:**

- `TabletInspectorDeckProps` unchanged, plus `onOpenExportOptions?: () => void`. The deck persists its width in `persistentSignal<number>('chaos-tablet-deck-width', 380)`; collapsed state in a plain signal (not persisted).

Geometry (B/components.md section 9): width 380 px in landscape, 360 px in portrait by default, user-resizable between 320 and 480 by dragging the divider on the deck's leading edge (a 12 px wide hit strip, `touch-action: none`); double-tap on the divider collapses the deck to a 44 px edge tab (`aria-label="Show inspector"`) that reopens it. Opaque `var(--la-surface)` (a page, no glass), `border-left: 1px solid var(--la-hairline)`. Inside: a 72 px header (Library button `GridIcon` 44, the flame's name `600 20px/26px`, Undo/Redo/Save 44 px each; `Untitled flame` fallback), a 40 px segmented row (the `TouchControlSurface` tab row in `tablet-deck` mode: `Variations`, `Shape`, `Colour` — no Vary tab on the deck), a scrolling body with 24 px gutters, and the surface's footer as a 64 px action bar pinned at the bottom (Mutate, Randomize, More tools). Every button 44 x 44 minimum. `App.module.css` `.tabletLayout` becomes `grid-template-columns: 1fr var(--deck-width, 380px)`; the deck sets `--deck-width` on the layout root through a `style` prop passed up, or simpler: the deck element itself is the grid's second column with `width: var(--deck-width)` and the column is `auto` (keep `1fr auto`, set the width on the aside).

- [ ] **Step 1:** Write the failing tests (append to `TouchSurface.test.tsx` `TabletInspectorDeck` cases): renders the Library button by role and name, `Undo`/`Redo`/`Save image`; the segmented row has exactly `Variations`, `Shape`, `Colour`; double-tapping the divider (`screen.getByTestId('deck-divider')`, two `fireEvent.click` within 300 ms with fake timers, or a `dblclick` event) collapses to the `Show inspector` button and clicking it restores; dragging the divider (`pointerDown` at clientX 900, `pointerMove` to 860, `pointerUp`) grows the width by 40 (`aside.style.width` is `'420px'` from a 380 start; set `window.innerWidth = 1210` and `window.innerHeight = 834` first). Run: FAIL.

- [ ] **Step 2:** Implement. Divider drag mirrors the rail's drag (pointer capture, 1:1, clamp 320-480, `haptic.selectionChanged()` on each 40 px stop crossed is not required; `haptic.impactLight()` on collapse/expand). Persist the width with `persistentSignal`. Landscape/portrait default: `window.innerWidth > window.innerHeight ? 380 : 360` used only when nothing is persisted.

The essential CSS in `TabletDeck.module.css`:

```css
.deck {
  grid-area: inspector;
  position: relative;
  height: 100%;
  width: var(--deck-width, 380px);
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--la-surface);
  border-left: 1px solid var(--la-hairline);
  padding-bottom: max(var(--la-s-2), var(--la-safe-bottom));
  box-sizing: border-box;
  contain: layout paint;
  z-index: 20;
}
.divider {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -6px;
  width: 12px;
  cursor: col-resize;
  touch-action: none;
}
.divider::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 5px;
  width: 3px;
  height: 44px;
  transform: translateY(-50%);
  border-radius: 2px;
  background: var(--la-hairline-strong);
}
.header {
  height: 72px;
  display: flex;
  align-items: center;
  gap: var(--la-s-2);
  padding: 0 var(--la-s-4);
  border-bottom: 1px solid var(--la-hairline);
}
.title {
  flex: 1 1 auto;
  min-width: 0;
  font: 600 20px/26px var(--la-font-body);
  color: var(--la-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.iconButton {
  width: var(--la-tap);
  height: var(--la-tap);
  display: grid;
  place-items: center;
  border: 0;
  background: none;
  color: var(--la-ink);
  border-radius: var(--la-r-pill);
}
.iconButton:disabled {
  color: var(--la-ink-4);
}
.body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--la-s-6);
}
.edgeTab {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: var(--la-tap);
  height: 88px;
  border: var(--la-glass-edge);
  border-right: 0;
  border-radius: var(--la-r-md) 0 0 var(--la-r-md);
  background: var(--la-glass);
  color: var(--la-ink);
  z-index: 20;
}
```

The surface's tab row in `tablet-deck` mode becomes the 40 px segmented row: restyle `.tabRow` / `.tabChip` in `TouchSurface.module.css` with tokens (`.tabChip { height: 40px; min-width: var(--la-tap); border-radius: var(--la-r-sm); font: var(--la-t-body-sm); color: var(--la-ink-2); }`, `.tabChipActive { background: var(--la-accent-wash); color: var(--la-accent); }`), and the footer `.surfaceFooter` becomes the 64 px action bar (`.actionPillBtn` 44 px tall minimum).

- [ ] **Step 3:** Migrate colours in `TouchSurface.module.css`: replace every `#…` hex and colour-carrying `rgba(…)` with the matching token (`#38bdf8`/`#7dd3fc` → `var(--la-accent)`/`var(--la-accent-press)`; `#0d121f`, `rgba(14, 18, 30, 0.92)`, `rgba(15, 19, 32, 0.88)` → `var(--la-surface)` / `var(--la-glass-strong)`; `rgba(255, 255, 255, 0.14)` and `0.12` → `var(--la-hairline-strong)`; `rgba(255, 255, 255, 0.25)` → `var(--la-hairline-strong)`; text greys → `var(--la-ink-2)` / `var(--la-ink-3)`; `blur(16px)`/`blur(18px)` → `var(--la-glass-blur)`; `0.26s cubic-bezier(0.16, 1, 0.3, 1)` → `var(--la-dur-sheet) var(--la-ease)`; `all 0.15s ease` → the named property with `var(--la-dur-press) var(--la-ease)`). Shadows may keep their `rgba(0, 0, 0, …)` values. Delete the rules that no longer have a consumer.

- [ ] **Step 4:** The guard test `tokens.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The touch surfaces read the --la-* tokens; a hex literal here is a colour
// that will not follow the direction switch (docs/plans/mobile-native/DESIGN.md).
describe('touch surface stylesheets', () => {
  it('carry no hex colour literals', () => {
    const dir = __dirname
    const offenders: string[] = []
    for (const file of readdirSync(dir).filter((f) =>
      f.endsWith('.module.css'),
    )) {
      const css = readFileSync(join(dir, file), 'utf8')
      for (const match of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g))
        offenders.push(`${file}: ${match[0]}`)
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 5:** `pnpm check`, all app tests, `build` and `build:native`; a manual check in the dev server at 1210 x 834 (the deck) and at 834 x 1210 (the rail on the tablet canvas). Expected: green; the deck resizes and collapses.

- [ ] **Step 6:** Commit.

```bash
git add -A packages/app/src/components/TouchSurface packages/app/src/App.module.css && git commit -m "feat(touch): the tablet inspector deck

An opaque 360-380px deck beside the canvas at 900px and above, resizable
between 320 and 480 by its divider, collapsible to an edge tab. A 72px
header with Library, the name, Undo, Redo and Save; the tool tabs as a 40px
segmented row; the action bar pinned below. The touch stylesheets now read
only --la-* tokens, and a test keeps hex literals out of them."
```

---

### Task 9: The Haptics switch

**Files:**

- Modify: `packages/app/src/components/HelpModal/HelpModal.tsx:319` (after the General Settings heading)
- Test: `packages/app/src/components/HelpModal/HelpModal.test.tsx` (create if absent; if a test file exists, add to it)

- [ ] **Step 1:** Write the failing test: with `vi.mock('@/lib/platform', () => ({ IS_NATIVE: true, apiUrl: (p: string) => p, publicOrigin: () => 'https://lumenapeiron.com' }))`, rendering the modal (see how other HelpModal tests build its props; if none exist, render it with the minimal props its type requires and `createMockCommandContext()`) shows a checkbox labelled `Haptics`, checked by default; unchecking it makes `hapticsEnabled()` false. Without the mock the row is absent.

- [ ] **Step 2:** Implement: under the `General Settings` heading add

```tsx
<Show when={IS_NATIVE}>
  <label class={ui.pickerModeRow}>
    <span class={ui.pickerModeLabel}>Haptics</span>
    <Checkbox
      checked={hapticsEnabled()}
      onChange={(checked) => setHapticsEnabled(checked)}
    />
  </label>
</Show>
```

with `import { Checkbox } from '../Checkbox/Checkbox'`, `import { hapticsEnabled, setHapticsEnabled } from '@/lib/haptics'`, `import { IS_NATIVE } from '@/lib/platform'`. Give the checkbox an accessible name (`aria-label="Haptics"` if the `Checkbox` component does not wire the label).

- [ ] **Step 3:** Run the test and `pnpm check`. Expected: PASS.

- [ ] **Step 4:** Commit.

```bash
git add packages/app/src/components/HelpModal && git commit -m "feat(app): a Haptics switch in settings, native only"
```

---

### Task 10: Plan upkeep and the pull request

**Files:**

- Modify: `docs/plans/mobile-native/DESIGN.md` (tick the Phase A boxes this branch delivers; leave the rest)
- Modify: `docs/plans/mobile-native/2026-09-11-phase-a-rail.md` (this file: tick every step you completed)

- [ ] **Step 1:** In `DESIGN.md` section 3 tick: the detent controller, haptics, 44 pt targets, the camera pan, `interactive-widget=resizes-content`. Leave unticked: the slider row rewrite, long-press to remove a variation. In section 4 tick the four routing items; leave the shell items. Commit: `docs(mobile): Phase A status`.

- [ ] **Step 2:** Final verification, all from the repo root:

```bash
pnpm check
pnpm --filter chaos-master exec vitest run --reporter=dot
pnpm --filter @chaos-master/mobile-runtime test
pnpm --filter chaos-master build && ls packages/app/dist/assets | grep -ci 'capacitor\|haptics'   # must print 0
pnpm --filter chaos-master build:native
git log --oneline origin/feat/mobile-capacitor-scaffolding-9224ec..HEAD
```

- [ ] **Step 3:** Push and open the PR against the scaffolding branch.

```bash
git push -u origin feat/native-rail
gh pr create --repo Komediruzecki/chaos-master-fp --base feat/mobile-capacitor-scaffolding-9224ec --head feat/native-rail --title "feat(native): the editor rail, top bar and tablet deck (Phase A)" --body-file /tmp/pr-body.md
```

The body (write it to `/tmp/pr-body.md` first): what changed per task, the decisions taken (listed under "Decisions" in this plan's introduction of the PR: tokens are additive, the alias remap waits; the tab capsule and the shell wait for Phase B; the phone-landscape vertical rail, the slider fine mode and the Vary candidates are follow-ups; the web's phone and tablet layouts get the rail too), how to test on a phone (portrait: chips, drag, flick, shutter tap and long press, the canvas pan, Undo/Redo haptics), on a tablet (the deck at 900 px and above, resize, collapse; the rail below), and on the web (a fine pointer keeps the old width rules). No emojis, no attribution lines.

- [ ] **Step 4:** Report back with: the PR URL, the commit list, every decision you took that this plan did not settle, anything you could not make pass, and anything in the spec you deliberately did not do.
