# Audit remediation, stage 1: confirmed defects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eleven confirmed defects that reach users in the `v0.9.11..main` range, each with a regression test that fails before the fix.

**Architecture:** Every task is a red-green-commit cycle against the existing vitest suite. Two tasks (1 and 2) fix a data-corruption chain and must land before the rest, because the later manual tablet verification depends on them. No task changes a public interface.

**Tech Stack:** SolidJS, TypeGPU/WebGPU, valibot, vitest, Playwright, pnpm workspaces.

**Spec:** [docs/agent/BUGS.md](../../agent/BUGS.md) for the evidence behind each defect, [docs/agent/REFACTOR-PLAN.md](../../agent/REFACTOR-PLAN.md) for how this stage fits the whole backlog, and [docs/agent/TESTING.md](../../agent/TESTING.md) for why a passing test proves less than usual in this repo.

**Branches this builds on:** `feat/agent-docs-harness` → `feat/agent-audit-report` → `feat/remediation-backlog` (all on `origin`). Branch this work from `feat/remediation-backlog`.

## Global Constraints

- **Never push to `upstream`.** Feature branches go to `origin` (`Komediruzecki/chaos-master-fp`); PRs target the fork's `main`.
- **No Claude attribution** in commits or PR bodies. The user is the sole author.
- **No emojis** in code, UI, logs, commit messages or PR text. Use an SVG icon from `packages/app/src/icons/`, exported through `icons/index.ts`.
- **Run `pnpm check` from the repo root** before declaring any task finished. It rewrites files (`lint:fix`, `fmt:fix`), so re-read what changed.
- **CI is the authority on typecheck.** A green local `pnpm typecheck` is not conclusive: valibot's `InferOutput` widens nondeterministically.
- **Never verify WebGPU with `playwright test`.** `playwright.config.ts` forces swiftshader, which fakes device-loss crashes. Use `pnpm verify:webgpu`.
- Every task ends green on `pnpm --filter chaos-master exec vitest run <the touched test file>`.
- **A test that does not fail before the fix has not been written yet.** Six mutation probes survived this suite; do not trust a green test you never saw red.

---

## Task 1: Stop the pinch handler from emitting unusable gestures

This is the root cause of the tablet export failure. `createPinchHandler` computes `distance` as `hypot()` of two touch deltas with no zero guard. `WheelZoomCamera2D` defends itself against that (commit `0d239a45`); `WheelZoomCamera3D` never did, so `camera3D.radius` becomes `NaN`. `Math.min`/`Math.max` propagate `NaN`, so the existing clamp does not rescue it.

Fixing it centrally means no future consumer can forget the guard.

**Files:**

- Modify: `packages/app/src/utils/createPinchHandler.ts`
- Modify: `packages/app/src/lib/WheelZoomCamera3D.tsx:348-362`
- Test: `packages/app/src/utils/createPinchHandler.test.ts` (create)

**Interfaces:**

- Produces: `export function pinchEventFrom(a: PinchPoint, b: PinchPoint): PinchEvent` and `export function isUsablePinch(e: PinchEvent): boolean`, where `PinchPoint = { clientX: number; clientY: number }`. Task 1 is the only task that touches these.

- [ ] **Step 1: Write the failing test**

Create `packages/app/src/utils/createPinchHandler.test.ts`. Testing the pure helpers rather than a synthetic `TouchEvent` keeps this runnable under happy-dom.

```ts
import { describe, expect, it } from 'vitest'
import { isUsablePinch, pinchEventFrom } from './createPinchHandler'

const p = (clientX: number, clientY: number) => ({ clientX, clientY })

describe('pinchEventFrom', () => {
  it('computes midpoint and distance for two distinct touches', () => {
    const e = pinchEventFrom(p(0, 0), p(6, 8))
    expect(e.midpoint).toEqual({ clientX: 3, clientY: 4 })
    expect(e.distance).toBe(10)
  })
})

describe('isUsablePinch', () => {
  it('rejects two coincident touches, which is what a fast two-finger tap reports', () => {
    expect(isUsablePinch(pinchEventFrom(p(120, 240), p(120, 240)))).toBe(false)
  })

  it('rejects a non-finite coordinate', () => {
    expect(isUsablePinch(pinchEventFrom(p(NaN, 0), p(6, 8)))).toBe(false)
    expect(isUsablePinch(pinchEventFrom(p(0, 0), p(Infinity, 8)))).toBe(false)
  })

  it('accepts an ordinary pinch', () => {
    expect(isUsablePinch(pinchEventFrom(p(0, 0), p(6, 8)))).toBe(true)
  })
})

describe('the ratio a consumer computes from two usable events', () => {
  it('is always finite and positive, so a clamp cannot yield NaN', () => {
    const prev = pinchEventFrom(p(0, 0), p(6, 8))
    const next = pinchEventFrom(p(0, 0), p(12, 16))
    const ratio = next.distance / prev.distance
    expect(Number.isFinite(ratio)).toBe(true)
    expect(ratio).toBeGreaterThan(0)
    expect(Math.max(0.1, Math.min(1000, 5 / ratio))).toBe(2.5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/utils/createPinchHandler.test.ts`
Expected: FAIL — `pinchEventFrom` and `isUsablePinch` are not exported.

- [ ] **Step 3: Implement the guard centrally**

In `packages/app/src/utils/createPinchHandler.ts`, replace the private `createPinchEvent` with exported helpers and gate every emission on them:

```ts
export type PinchPoint = { clientX: number; clientY: number }

export function pinchEventFrom(a: PinchPoint, b: PinchPoint): PinchEvent {
  return {
    midpoint: {
      clientX: 0.5 * (a.clientX + b.clientX),
      clientY: 0.5 * (a.clientY + b.clientY),
    },
    distance: hypot(a.clientX - b.clientX, a.clientY - b.clientY),
  }
}

/**
 * Two touches reported at the same coordinate give distance 0, and a consumer
 * dividing by it gets NaN or Infinity. `Math.min`/`Math.max` propagate NaN, so
 * a downstream clamp does NOT rescue the value -- it has to be rejected here.
 */
export function isUsablePinch(event: PinchEvent): boolean {
  return (
    Number.isFinite(event.distance) &&
    event.distance > 0 &&
    Number.isFinite(event.midpoint.clientX) &&
    Number.isFinite(event.midpoint.clientY)
  )
}
```

Then in the handler body, replace `createPinchEvent(touches)` with `pinchEventFrom(touches[0], touches[1])` and skip unusable events:

```ts
const initPinch = pinchEventFrom(touches[0], touches[1])
if (!isUsablePinch(initPinch)) return

const handlers = createHandlers(initPinch)
if (!handlers) return
```

and inside `onTouchMove`:

```ts
const moved = pinchEventFrom(touches[0], touches[1])
if (!isUsablePinch(moved)) return
onPinchMove?.(moved)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter chaos-master exec vitest run src/utils/createPinchHandler.test.ts`
Expected: PASS.

- [ ] **Step 5: Give the 3D camera the same explicit guard as the 2D one**

Central guarding is enough today, but `WheelZoomCamera3D` should not rely on that alone — `prevDistance` is consumer-held state. In `packages/app/src/lib/WheelZoomCamera3D.tsx`, mirror `WheelZoomCamera2D.tsx:172-200`:

```ts
const startPinch = createPinchHandler((initEvent) => {
  if (!Number.isFinite(initEvent.distance) || initEvent.distance <= 0) {
    return
  }
  let prevDistance = initEvent.distance
  cancelPendingWheelCommit()
  if (!changeHistory.isPreviewing()) {
    changeHistory.startPreview('Camera pinch')
  }
  return {
    onPinchMove(event) {
      if (
        !Number.isFinite(event.distance) ||
        event.distance <= 0 ||
        prevDistance <= 0
      ) {
        return
      }
      const ratio = event.distance / prevDistance
      if (!Number.isFinite(ratio) || ratio <= 0) {
        return
      }
      props.radius[1]((r) =>
        Math.max(MIN_ORBIT_RADIUS, Math.min(MAX_ORBIT_RADIUS, r / ratio)),
      )
      prevDistance = event.distance
    },
    onDone() {
      if (changeHistory.isPreviewing()) {
        changeHistory.commit()
      }
    },
  }
})
```

- [ ] **Step 6: Verify nothing else regressed**

Run: `pnpm --filter chaos-master exec vitest run src/utils src/lib`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/utils/createPinchHandler.ts packages/app/src/utils/createPinchHandler.test.ts packages/app/src/lib/WheelZoomCamera3D.tsx
git commit -m "fix(camera): reject degenerate pinch gestures instead of writing NaN

createPinchHandler computed distance as hypot() of the two touch deltas with
no zero guard. Two coincident touches -- which a fast two-finger tap reports --
gave distance 0, and WheelZoomCamera3D divided by it directly, so camera3D.radius
became NaN. Math.min and Math.max propagate NaN, so the existing orbit clamp did
not rescue the value.

WheelZoomCamera2D had guarded itself against exactly this since 0d239a45; the 3D
camera never did. Guarding centrally in createPinchHandler means no future
consumer can forget it, and the 3D camera now also mirrors the 2D checks because
prevDistance is consumer-held state."
```

---

## Task 2: Reject non-finite camera values in the schema

`packages/core/src/schema/flameSchema.ts:264` declares `radius: v.optional(v.number(), ...)`. Measured against valibot 1.2.0, `v.number()` **rejects `NaN` but accepts `Infinity` and `-Infinity`**. So a `NaN` camera fails validation (the saved flame will not reload), while an infinite one validates cleanly and is written into autosave, share links and session recordings. Task 1 stops the corruption at the source; this makes the schema reject both non-finite forms, so nothing else can make one durable either.

**Files:**

- Modify: `packages/core/src/schema/flameSchema.ts`
- Test: `packages/core/src/schema/flameSchema.finite.test.ts` (create)

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `export const finiteNumber: v.GenericSchema<number>` from `flameSchema.ts`, for reuse by later schema work.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { finiteNumber } from './flameSchema'

describe('finiteNumber', () => {
  it('documents the gap: plain v.number() rejects NaN but accepts Infinity', () => {
    expect(v.safeParse(v.number(), NaN).success).toBe(false)
    expect(v.safeParse(v.number(), Infinity).success).toBe(true)
    expect(v.safeParse(v.number(), -Infinity).success).toBe(true)
  })

  it('rejects Infinity, -Infinity and NaN', () => {
    expect(v.safeParse(finiteNumber, Infinity).success).toBe(false)
    expect(v.safeParse(finiteNumber, -Infinity).success).toBe(false)
    expect(v.safeParse(finiteNumber, NaN).success).toBe(false)
  })

  it('accepts ordinary finite numbers including zero and negatives', () => {
    for (const n of [0, -0, 1, -7.5, 1e-9, 1e9]) {
      expect(v.safeParse(finiteNumber, n).success).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @chaos-master/core exec vitest run src/schema/flameSchema.finite.test.ts`
Expected: FAIL — `finiteNumber` is not exported.

- [ ] **Step 3: Add the schema and use it for the camera fields**

In `packages/core/src/schema/flameSchema.ts`:

```ts
/**
 * `v.number()` rejects NaN but accepts Infinity and -Infinity. A camera value
 * made infinite by a degenerate touch gesture would otherwise validate cleanly
 * and be persisted into autosave, share links and session recordings.
 */
export const finiteNumber = v.pipe(v.number(), v.finite())
```

Then replace `v.number()` with `finiteNumber` for the `camera3D` fields (`theta`, `phi`, `radius`, `fov`, `roll`) and the 2D `camera` `zoom` and `position` components.

Do **not** sweep the whole schema in this task. Widening it is Stage 2 work and needs the golden-flame corpus in place first, so a rejected legacy flame is a caught regression rather than a mystery.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @chaos-master/core exec vitest run`
Expected: PASS.

- [ ] **Step 5: Verify no real flame is now rejected**

Run: `pnpm --filter chaos-master exec vitest run src/flame`
Expected: PASS. If a fixture fails here, it contains a non-finite camera value and is itself evidence of this bug — report it rather than loosening the schema.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schema/flameSchema.ts packages/core/src/schema/flameSchema.finite.test.ts
git commit -m "fix(schema): reject infinite camera values instead of persisting them

valibot's v.number() rejects NaN but accepts Infinity and -Infinity. An infinite
camera value therefore passed validateFlame and was written into autosave, share
links and session recordings. Camera fields now use a finite-checked number,
which rejects both."
```

---

## Task 3: Restore the camera-only keyframe short-circuit

`packages/app/src/hooks/useWorkspaceTimelineBinding.ts:87` consults the timeline for **every** parameter path. Before the extraction the short-circuit existed in exactly seven camera cases, and `camera.rotation` deliberately had none. Because `addKeyframeImpl` writes the resolved value back into the flame, a slider on a keyframed transform visibly snaps back on every pointermove.

**Files:**

- Modify: `packages/app/src/hooks/useWorkspaceTimelineBinding.ts:87-96`
- Test: `packages/app/src/hooks/useWorkspaceTimelineBinding.test.ts` (extend)

**Interfaces:**

- Consumes: nothing from Tasks 1-2.
- Produces: no new exports. `getFlameCameraSetting` keeps its signature.

- [ ] **Step 1: Read the existing test file first**

`packages/app/src/hooks/useWorkspaceTimelineBinding.test.ts` currently hard-codes `isDrivingView` and `hasKeyframeAtFrame` to `false` in every case, which is why this shipped. The new case must set them true.

- [ ] **Step 2: Write the failing test**

Append to the existing describe block, matching the file's existing mock-timeline style:

```ts
it('does not let a transform keyframe shadow a live edit to that transform', () => {
  const tid = 't1'
  const path = `transform.${tid}.probability`
  const timeline = {
    ...baseTimeline,
    isDrivingView: () => true,
    currentFrame: () => 30,
    hasKeyframeAtFrame: (p: string, f: number) => p === path && f === 30,
    tracks: () => [
      {
        parameterPath: path,
        keyframes: [{ frame: 30, value: 0.4, easing: 'linear' }],
      },
    ],
  }
  const binding = makeBinding(timeline)

  binding.setFlameValue(path, 0.9)

  // The playhead sits on a keyframe for this path, but the user just moved the
  // slider. The live edit wins; only camera paths short-circuit to the keyframe.
  expect(binding.getFlameValue(path)).toBe(0.9)
})

it('still short-circuits camera paths to the keyframe while the timeline drives the view', () => {
  const timeline = {
    ...baseTimeline,
    isDrivingView: () => true,
    currentFrame: () => 30,
    hasKeyframeAtFrame: (p: string, f: number) =>
      p === 'camera.zoom' && f === 30,
    tracks: () => [
      {
        parameterPath: 'camera.zoom',
        keyframes: [{ frame: 30, value: 2.5, easing: 'linear' }],
      },
    ],
  }
  const binding = makeBinding(timeline)

  expect(binding.getFlameValue('camera.zoom')).toBe(2.5)
})

it('never short-circuits camera.rotation, which had no short-circuit before the extraction', () => {
  const timeline = {
    ...baseTimeline,
    isDrivingView: () => true,
    currentFrame: () => 30,
    hasKeyframeAtFrame: (p: string, f: number) =>
      p === 'camera.rotation' && f === 30,
    tracks: () => [
      {
        parameterPath: 'camera.rotation',
        keyframes: [{ frame: 30, value: 1.23, easing: 'linear' }],
      },
    ],
  }
  const binding = makeBinding(timeline)
  binding.setFlameValue('camera.rotation', 0.5)

  expect(binding.getFlameValue('camera.rotation')).toBe(0.5)
})
```

Adapt `baseTimeline` and `makeBinding` to whatever the file already names these; do not introduce a second mock style.

- [ ] **Step 3: Run the tests to verify the first and third fail**

Run: `pnpm --filter chaos-master exec vitest run src/hooks/useWorkspaceTimelineBinding.test.ts`
Expected: the transform case and the `camera.rotation` case FAIL (both return the keyframe value); the `camera.zoom` case PASSES.

- [ ] **Step 4: Restrict the short-circuit to the seven camera paths**

```ts
/**
 * The keyframe short-circuit belongs to camera paths only. Before this hook was
 * extracted from MainWorkspace it was written out longhand in exactly seven
 * cases, and `camera.rotation` deliberately had none. Applying it to every path
 * makes a slider on a keyframed transform snap back, because addKeyframeImpl
 * writes the resolved value straight back into the flame.
 */
const KEYFRAME_SHORT_CIRCUIT_PATHS = new Set([
  'camera.x',
  'camera.y',
  'camera.zoom',
  'camera3D.theta',
  'camera3D.phi',
  'camera3D.radius',
  'camera3D.fov',
])

function getFlameCameraSetting(
  rs: FlameDescriptor['renderSettings'],
  path: string,
  timeline: TimelineAccess,
): FlameValue | undefined {
  const getter = CAMERA_GETTERS[path]
  if (!getter) return undefined
  if (KEYFRAME_SHORT_CIRCUIT_PATHS.has(path)) {
    const kf = getTimelineCameraKeyframeValue(timeline, path)
    if (kf !== null) return kf
  }
  return getter(rs)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter chaos-master exec vitest run src/hooks/useWorkspaceTimelineBinding.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the timeline suite for fallout**

Run: `pnpm --filter chaos-master exec vitest run src/utils/timeline.test.ts src/hooks`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/hooks/useWorkspaceTimelineBinding.ts packages/app/src/hooks/useWorkspaceTimelineBinding.test.ts
git commit -m "fix(timeline): stop a keyframe on any path shadowing a live slider edit

When getFlameValue was extracted from MainWorkspace the keyframe short-circuit,
previously written out longhand in seven camera cases, was widened to every
parameter path. hasKeyframeAtFrame is path-generic, so a keyframed transform,
affine or variation weight resolved from the keyframe instead of the flame while
the playhead sat on it. addKeyframeImpl then wrote that stale value back, so the
slider visibly snapped back on every pointermove.

camera.rotation is excluded, matching the pre-extraction behaviour."
```

---

## Task 4: Give the tablet layout precedence over the legacy breakpoint

`packages/app/src/App.module.css:21` — a pre-existing `max-width: 768px` block overrides `.tabletLayout`, so every device from 680px to 768px inclusive gets the wrong chrome: iPad Mini 6 portrait (744px), older iPads at 768, many Android tablets.

**Files:**

- Modify: `packages/app/src/App.module.css`
- Test: `packages/app/src/components/TouchSurface/TouchSurface.test.tsx` (extend), plus manual verification in the protocol below

**Interfaces:**

- Consumes: nothing.
- Produces: no exports.

- [ ] **Step 1: Establish which band each layout owns**

Read `PHONE_MAX_WIDTH` and `TABLET_MAX_WIDTH` in `packages/app/src/stores/workspaceLayoutStore.ts` and write the intended table into the CSS as a comment before changing anything. The classification logic and the CSS must agree; today they do not.

- [ ] **Step 2: Write the failing test**

A DOM test cannot evaluate a media query, so assert the contract that is testable: exactly one layout class is applied per classification.

```ts
it('applies exactly one layout class for each device classification', () => {
  for (const [phone, tablet, expected] of [
    [true, false, 'phoneLayout'],
    [false, true, 'tabletLayout'],
    [false, false, null],
  ] as const) {
    const { container, unmount } = renderTouchSurface({ phone, tablet })
    const root = container.firstElementChild as HTMLElement
    const applied = ['phoneLayout', 'tabletLayout'].filter((c) =>
      root.className.includes(c),
    )
    expect(applied).toEqual(expected ? [expected] : [])
    unmount()
  }
})
```

Adapt `renderTouchSurface` to the harness the existing `TouchSurface.test.tsx` uses.

- [ ] **Step 3: Run it**

Run: `pnpm --filter chaos-master exec vitest run src/components/TouchSurface`
Expected: it may already pass — the class application is not the bug, the CSS cascade is. Keep it: it pins the contract the CSS fix depends on.

- [ ] **Step 4: Fix the cascade**

Either move `.phoneLayout` / `.tabletLayout` after the legacy block, or exclude them from it. Prefer exclusion, because it states the intent:

```css
/*
 * The explicit layout classes are chosen by workspaceLayoutStore's device
 * classification and must win over this legacy width-only block. Without the
 * :not() the 680-768px band -- iPad Mini 6 portrait at 744px, older iPads at
 * 768, many Android tablets -- got phone chrome while isTablet() was true.
 */
@media (max-width: 768px) {
  .someSelector:not(.phoneLayout):not(.tabletLayout) {
    /* ... existing declarations ... */
  }
}
```

- [ ] **Step 5: Verify in a real browser at the boundaries**

Start the dev server, then:

```bash
pnpm verify:webgpu
```

Extend `scripts/verify-webgpu-headed.mjs`'s viewport list with 679, 680, 744, 768 and 769 first, and confirm the reported canvas count and layout class change exactly once, at the intended boundary.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/App.module.css packages/app/src/components/TouchSurface/TouchSurface.test.tsx scripts/verify-webgpu-headed.mjs
git commit -m "fix(layout): let the tablet layout win over the legacy 768px block

A pre-existing max-width:768px block overrode .tabletLayout, so every viewport
from 680 to 768px inclusive rendered phone chrome while isTablet() was true --
iPad Mini 6 portrait at 744px, older iPads at 768, and many Android tablets."
```

---

## Task 5: Give the workspace layout memos an owner

`packages/app/src/stores/workspaceLayoutStore.ts:114,120,126` — `isPhone`, `isTablet` and `isTouchLayout` are `createMemo` at module scope. They run at import time outside any `createRoot`, so Solid warns they will never be disposed, three times on every page load, on every route, at every viewport.

**Files:**

- Modify: `packages/app/src/stores/workspaceLayoutStore.ts:114-126`
- Test: `packages/app/src/stores/workspaceLayoutStore.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```ts
it('creates its module-level memos inside a root, so Solid does not warn', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.resetModules()
  await import('./workspaceLayoutStore')
  const offending = warn.mock.calls
    .map((c) => c.map(String).join(' '))
    .filter((m) => /never be disposed|createRoot/i.test(m))
  expect(offending).toEqual([])
  warn.mockRestore()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/stores/workspaceLayoutStore.test.ts`
Expected: FAIL with three captured warnings.

- [ ] **Step 3: Wrap the three memos in an explicit root**

These are deliberately process-lifetime computations — device classification does not belong to any component. Say so in code rather than letting it happen by accident:

```ts
/**
 * Device classification outlives every component, so these memos are
 * deliberately global. `createRoot` makes that explicit and gives them an owner;
 * at module scope they were created outside any root and Solid warned, on every
 * page load, that they would never be disposed. The root is never disposed on
 * purpose -- the dispose function is discarded.
 */
const { isPhone, isTablet, isTouchLayout } = createRoot(() => {
  const isPhone = createMemo(() => {
    if (touchLayoutPreference() === 'desktop') return false
    return rawIsPhone()
  })
  const isTablet = createMemo(() => {
    if (touchLayoutPreference() === 'desktop') return false
    if (touchLayoutPreference() === 'touch') return !rawIsPhone()
    return rawIsTablet()
  })
  const isTouchLayout = createMemo(() => isPhone() || isTablet())
  return { isPhone, isTablet, isTouchLayout }
})

export { isPhone, isTablet, isTouchLayout }
```

Note the `isPhone` simplification: both non-`desktop` branches returned `rawIsPhone()`. Keep that behaviour identical — this is not the task to change classification.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter chaos-master exec vitest run src/stores`
Expected: PASS.

- [ ] **Step 5: Confirm in a real browser**

Run `pnpm verify:webgpu` and check `solid_warnings` is `0` for every route and viewport in the JSON report. It was 3 everywhere before this fix.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/stores/workspaceLayoutStore.ts packages/app/src/stores/workspaceLayoutStore.test.ts
git commit -m "fix(stores): give the device-classification memos an owner

isPhone, isTablet and isTouchLayout were createMemo calls at module scope, so
they ran at import time outside any root and Solid warned three times on every
page load that they would never be disposed. They are deliberately
process-lifetime, so createRoot now says that explicitly."
```

---

## Task 6: Make the smoke suite fail on this warning class

Task 5's fix is invisible to CI: `tests/smoke.spec.ts:195-204` filters console **errors** only, which is why three warnings shipped on every route. Without this task, the leak silently returns.

**Files:**

- Modify: `tests/smoke.spec.ts:195-204`

- [ ] **Step 1: Add the assertion**

```ts
// Solid emits this as a warning, not an error, so the console-error filter
// above cannot see it. Three of these shipped on every route because nothing
// watched for them. See docs/agent/MISTAKES.md.
const ownershipWarnings = consoleMessages.filter(
  (m) =>
    m.type() === 'warning' && /never be disposed|createRoot/i.test(m.text()),
)
expect(
  ownershipWarnings.map((m) => m.text()),
  'Solid computation created outside a root',
).toEqual([])
```

You will need to capture `warning` messages alongside errors where the spec sets up its console listener.

- [ ] **Step 2: Verify it fails on the pre-fix code**

```bash
git stash push -- packages/app/src/stores/workspaceLayoutStore.ts
pnpm test:e2e:ci
git stash pop
```

Expected: FAIL listing three warnings. **If it passes here, the assertion is not wired to a listener that captures warnings** — fix that before continuing. Use a uniquely named stash and `git stash list` to find it; other sessions share the stash stack.

- [ ] **Step 3: Verify it passes with the fix**

Run: `pnpm test:e2e:ci`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke.spec.ts
git commit -m "test(smoke): fail on Solid computations created outside a root

The smoke suite filtered console errors only, so three 'will never be disposed'
warnings shipped on every route unnoticed."
```

---

## Task 7: Make Beats mode actually load a track

`packages/app/src/webmcp/tools/arcadeBeats.ts:333` — there is no seam that fetches and decodes a bundled track, and `arcade_set_audio_mapping` disables audio reactivity as its final act. The tools return `{ok: true}`, the session saves, and nothing is reactive.

**Files:**

- Modify: `packages/app/src/webmcp/tools/arcadeBeats.ts`
- Modify: the audio facade it depends on (find via `grep -n "audio\." packages/app/src/webmcp/tools/arcadeBeats.ts`)
- Test: `packages/app/src/webmcp/tools/arcadeBeats.test.ts` (create)

**Interfaces:**

- Produces: `loadTrack(track: BundledTrack): Promise<void>` on the audio facade — sets `audioBuffer` and `audioTrackName`.

- [ ] **Step 1: Establish the current behaviour in a test**

Drive the documented tool sequence — `arcade_start_beats`, `arcade_get_audio_catalog`, `arcade_set_audio_mapping` — against a stub facade, and assert what the user actually wants at the end:

```ts
it('leaves a decoded track loaded and reactivity enabled after the documented sequence', async () => {
  const facade = makeStubAudioFacade()
  await arcadeStartBeats({ facade, trackId: 'cyber-pulse' })
  await arcadeSetAudioMapping({ facade, mappings: [validMapping] })

  expect(facade.audioBuffer()).not.toBeNull()
  expect(facade.audioTrackName()).toBe('Cyber Pulse')
  expect(facade.reactivityEnabled()).toBe(true)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter chaos-master exec vitest run src/webmcp/tools/arcadeBeats.test.ts`
Expected: FAIL — no buffer is loaded, and reactivity is false.

- [ ] **Step 3: Add the loading seam and call it**

Add `loadTrack` to the facade (fetch via the existing `fetchBundledTrackBuffer`, decode, set `audioBuffer` and `audioTrackName`), call it from `arcade_start_beats`, and remove the reactivity-disabling call at the end of `arcade_set_audio_mapping`.

If a decode fails, keep the previous track and surface an error in the tool result — do not leave the session claiming success. Add a test for that path too.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter chaos-master exec vitest run src/webmcp/tools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/webmcp/tools/arcadeBeats.ts packages/app/src/webmcp/tools/arcadeBeats.test.ts
git commit -m "fix(arcade): load the bundled track in Beats mode, and stop disabling reactivity

Beats mode had no seam that fetched or decoded a bundled track, and
arcade_set_audio_mapping disabled audio reactivity as its final act. The tools
returned ok, the session saved, and nothing was ever audio-reactive."
```

---

## Task 8: Record Randomize and Smart Animation

`packages/app/src/MainWorkspace.tsx:2412` passes `timeline` where the pre-extraction code passed `recorderTimeline`. Both presets use `Math.random()`, so without a snapshot the action cannot replay.

**Files:**

- Modify: `packages/app/src/MainWorkspace.tsx:2411-2412`
- Test: `packages/app/src/hooks/useWorkspaceAnimationGen.test.ts` (create)

- [ ] **Step 1: Write the failing test** — assert a snapshot with origin `timeline.random` is emitted when the hook is given a recorder-aware timeline.
- [ ] **Step 2: Run it; expect FAIL** (`pnpm --filter chaos-master exec vitest run src/hooks/useWorkspaceAnimationGen.test.ts`).
- [ ] **Step 3: Pass `recorderTimeline` instead of `timeline`** at the `useWorkspaceAnimationGen({ ... })` call site.
- [ ] **Step 4: Run it; expect PASS.** Also run `src/recorder` for fallout.
- [ ] **Step 5: Commit** — `fix(recorder): snapshot Randomize and Smart Animation so they replay`.

---

## Task 9: Key Director taste records by session

`packages/app/src/arcade/tasteStore.ts:164` keys records by `(generation, candidateIndex)`, so a new session starting at generation 1 overwrites the previous one's ratings.

**Files:**

- Modify: `packages/app/src/arcade/tasteStore.ts`
- Test: `packages/app/src/arcade/tasteStore.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — rate 6 candidates in session A, 6 in session B, assert `totalRatings === 12`.
- [ ] **Step 2: Run it; expect FAIL** (reports 6).
- [ ] **Step 3: Add a session id to the record key.** Existing persisted records have no session id — treat a missing one as a distinct legacy session rather than dropping the data, and add a test for that.
- [ ] **Step 4: Run it; expect PASS.**
- [ ] **Step 5: Commit** — `fix(arcade): key taste records by session so Director runs stop overwriting each other`.

---

## Task 10: Keep the PR-preview origin out of search

`packages/app/src/worker/middleware/reviewHost.ts:17` — PR #79 covered `dev.lumenapeiron.com` and `about.dev.lumenapeiron.com` but not the `*.workers.dev` preview, whose URL is posted on every public PR.

**Files:**

- Modify: `packages/app/src/worker/middleware/reviewHost.ts`
- Test: `packages/app/src/worker/index.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — assert `Allow: /` is never served and the production sitemap is never returned for a `*.workers.dev` host. Write it as a table over every non-production origin so the next one cannot be missed.
- [ ] **Step 2: Run it; expect FAIL** (`pnpm --filter chaos-master exec vitest run src/worker/index.test.ts`).
- [ ] **Step 3: Add the preview host to the review-host match.** Prefer an allowlist of production hosts over a denylist of review hosts, so an unknown origin fails closed.
- [ ] **Step 4: Run it; expect PASS.**
- [ ] **Step 5: Commit** — `fix(seo): treat the PR-preview origin as a review host`.

---

## Task 11: Motion blur on the offscreen export path — MOVED

Decided and moved out, so it cannot block this stage.

The choice was between implementing sub-frame accumulation on the offscreen path
and disabling the control there. **Sub-frame accumulation it is**, and it ships
as its own PR:
[2026-09-11-offscreen-export-motion-blur.md](2026-09-11-offscreen-export-motion-blur.md).

Nothing in this stage depends on it. Skip straight to Task 12.

---

## Task 12: Repair the two defeated lazy boundaries

`MainWorkspace.tsx:38` lazy-loads `DiffViewModal`, but `WorkspaceSidebar.tsx:5` imports `DiffViewContent` from the same module statically, so vite keeps it in the main chunk and says so at build time. `AudioWiringModal` (1,644 lines) has the identical problem via `AudioReactivePanel.tsx:5`.

**Files:**

- Create: `packages/app/src/components/DiffViewModal/DiffViewContent.tsx`
- Modify: `packages/app/src/components/DiffViewModal/DiffViewModal.tsx`, `packages/app/src/components/WorkspaceSidebar/WorkspaceSidebar.tsx:5-6`
- Same shape for `AudioWiringModal` / `AudioReactivePanel.tsx:5`

- [ ] **Step 1: Capture the current build warning** — `pnpm --filter chaos-master run build 2>&1 | grep "will not move module"`. Expect two hits. This is the red state.
- [ ] **Step 2: Extract the shared piece** into its own module and re-point both importers, so the heavy modal stays splittable.
- [ ] **Step 3: Rebuild** — expect zero `will not move module` warnings, and a `MainWorkspace` chunk smaller than 844 KB.
- [ ] **Step 4: Commit** — `perf(bundle): stop a sibling's static import defeating two lazy modals`.

---

## Manual verification protocol — with the user in the loop

Tasks 1, 2, 4 and 5 change touch behaviour that no automated test in this repo can fully cover. Run this **with the user**, on their Android tablet, after Task 5 lands.

**Before:** check out `main` (pre-fix) and confirm the bug reproduces. A protocol that only ever runs against the fix proves nothing.

| #   | Step                                                                                                                                                                 | Pre-fix expectation                                                   | Post-fix expectation              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| 1   | Open a **3D** flame on the tablet                                                                                                                                    | renders                                                               | renders                           |
| 2   | Two-finger _tap_ the canvas (fast, both fingers landing together)                                                                                                    | `camera3D.radius` becomes `NaN`, or the camera slams to minimum orbit | camera unchanged; gesture ignored |
| 3   | Read the radius: paste `JSON.parse(localStorage.getItem('<autosave key>')).renderSettings.camera3D.radius` into the console, or read the 3D camera readout in the UI | `null` (JSON serialises `NaN` as `null`) or `0.1`                     | a finite, sensible number         |
| 4   | Export a PNG from the export modal                                                                                                                                   | blank or failed image                                                 | correct image                     |
| 5   | Export an animation                                                                                                                                                  | blank or failed                                                       | correct                           |
| 6   | Repeat 2-5 with a **2D** flame                                                                                                                                       | works — 2D was already guarded by `0d239a45`                          | works                             |
| 7   | Reload the page                                                                                                                                                      | the poisoned camera persisted through autosave                        | clean                             |

**What to capture:** for each step, the tablet's browser console (remote-debug via `chrome://inspect`) and the radius value from step 3. If step 2 does not reproduce pre-fix, try a two-finger pinch that starts with the fingers touching and separates — the failure needs the two touch points coincident for at least one reported frame.

**If the pre-fix bug does not reproduce on the tablet at all**, stop and report. It would mean the export failure has a second cause and the fix in Task 1, while correct, is not the one the user was chasing.

**Cross-check the desktop path** at the same time: `pnpm verify:webgpu` should report zero console errors and zero Solid warnings at 1920x1080, 1024x768, 768x1024 and 390x844.

---

## Self-review notes

- **Not covered here, by design:** the retroactive Phase 0 characterization net, the coverage and Playwright harness work, the six surviving mutants, the unfinished refactor contract, and the 984 missing header comments. Those are stages 2 to 5 in [REFACTOR-PLAN.md](../../agent/REFACTOR-PLAN.md) and each needs its own plan — folding them in here would produce a plan nobody finishes.
- **Task ordering matters** only for 1 → 2 (corruption source before durability) and 5 → 6 (fix before the guard that proves it). The rest are independent and can be parallelised across agents.
- **Every task's test must be seen red.** Six mutation probes survived this suite; a green test proves nothing here until you have watched it fail.
