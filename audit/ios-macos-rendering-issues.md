# iOS/macOS Rendering Audit Report

**Branch**: `fix/ios-macos-rendering`  
**Date**: 2026-07-19  
**Scope**: Flame render pipeline from load through presentation on iOS Safari / macOS WebGPU

> **Note on this document.** The findings below are the original investigation.
> Two recommendations were revised during implementation — the `framesPending`
> count valve cannot fire (the render gate caps the set at 3, so a `> 10`
> threshold is unreachable), and a rejecting hold is only one of two failure
> modes. See **[Resolution — What Shipped](#resolution--what-shipped)** at the
> bottom for the fixes that actually landed.

---

## Reported Symptoms

1. **Console errors** (unspecified) on iOS/macOS
2. **"Load flame" doesn't render immediately** — flame only appears after touch/drag on the camera
3. **Flickering** during interaction

---

## Finding 1: `renderInterval = Infinity` While Any Modal Is Open

**File**: `packages/app/src/MainWorkspace.tsx:967-972`
**Severity**: High (root cause of "doesn't load until touch/drag")

```ts
const finalRenderInterval = () =>
  isAnyModalOpen() ? Infinity : onExportImage() ? 0 : DEFAULT_RENDER_INTERVAL_MS
```

When `LoadFlameModal` opens, all rendering stops. The rAF loop keeps polling `requestAnimationFrame` but `getDeltaTime()` returns `Infinity`, so `passedEnoughTime = time - lastTime >= Infinity` is always `false`. No frames are rendered while the user browses flames.

### What happens after a flame is loaded:

In `LoadFlameModal.tsx:1133-1187`, `showLoadFlameModal()` follows this sequence:

```
1. setLoadModalIsOpen(true)        // renderInterval = Infinity
2. await requestModal(...)         // user browses, NO rendering
3. setLoadModalIsOpen(false)       // renderInterval = 1ms
4. batch {
     history.replace(flame)        // parameterFingerprint changes
     setLoadedAnimation(...)
   }
5. Solid effects flush:
   - Flam3 outer effect re-runs (new pipeline + new rAF loop)
   - Inner effects: resetAccumulation() → requestRedraw() → lastTime = 0
6. Next rAF callback: lastTime === 0 → renders
```

Step 3 and 4 happen synchronously in the same task. By the time the outer effect re-runs (step 5), `props.renderInterval` is already `DEFAULT_RENDER_INTERVAL_MS` (1ms). So the NEW rAF loop starts rendering at 1ms intervals immediately — **on paper this should work**.

### The iOS-specific failure mechanism

On iOS Safari, there is a critical nuance: `createAnimationFrame` uses a `hold` promise to throttle the GPU queue:

```ts
// Flam3.tsx:1096-1110
const rafLoop = createAnimationFrame(
  (frameId) => {
    renderTick(frameId)
  },
  () =>
    continueRendering(accumulatedPointCount_) ? props.renderInterval : Infinity,
  () => device.queue.onSubmittedWorkDone(), // ← HOLD
  () => exportDriverActive() || !gpuReady(),
)
```

In `createAnimationFrame.ts:25-41`:

```ts
function run(time: number) {
  if (disposed) return
  const framesNotPending = framesPending.size <= 2
  const passedEnoughTime = time - lastTime >= getDeltaTime()
  if (framesNotPending && (lastTime === 0 || passedEnoughTime)) {
    lastTime = time
    fn(frameId) // renderTick
    if (hold) {
      framesPending.add(time)
      hold()
        .then(() => framesPending.delete(time))
        .catch(console.error) // ← LOGS TO CONSOLE ON REJECTION
    }
  }
  if (!disposed) {
    frameId = requestAnimationFrame(run)
  }
}
```

**If `device.queue.onSubmittedWorkDone()` rejects on iOS Safari** (which can happen during device transitions, queue stalls, or after the GPU was idle), then:

1. `console.error` fires → **console errors reported by user**
2. `framesPending.delete(time)` never runs → `framesPending` grows
3. After 3 frames: `framesPending.size > 2` → `framesNotPending = false` → **rAF loop blocks permanently**
4. No more frames render

**Why camera touch/drag "fixes" it**: Camera interaction triggers `resetAccumulation()` → `requestRedraw()` → `rafLoop.redraw()` → `lastTime = 0`. But **this does NOT clear `framesPending`**. If `framesPending` is already stuck at 3 entries, `framesNotPending` stays `false`, and `lastTime = 0` doesn't help — the `framesNotPending` check comes first.

**However**, if the device recovery from an `onSubmittedWorkDone` rejection involves recreating the pipeline (e.g., `gpuReady()` flickering from `ready` back to `ready` via a device re-init), the outer effect would re-run, creating a fresh rAF loop with an empty `framesPending`. The camera drag might trigger device recovery indirectly.

### Recommendation

1. **Add a safety timeout to the hold promise** so a stuck promise doesn't permanently block rendering:

```ts
// createAnimationFrame.ts - framed pending with timeout
const holdWithTimeout = () => {
  const holdP = hold()
  const timeoutP = new Promise<void>((resolve) => setTimeout(resolve, 5000))
  return Promise.race([holdP, timeoutP])
}
```

2. ~~**Cap `framesPending` eviction** — if size exceeds a hard limit (e.g., 10), clear all entries~~ **(rejected — does not work).** The render gate is `framesPending.size <= 2`, and `framesPending.add()` only runs inside that gate, so the set can never exceed **3**. A `> 10` threshold is dead code, and the stall this was meant to catch happens at exactly 3 (see Finding 1's own analysis). Lowering the threshold to `> 2` is also wrong: it would evict frames that are legitimately in flight, defeating the GPU back-pressure the hold provides (the Chrome "rAF collapse" guard). The correct mechanism is the **per-hold timeout in recommendation 1** — it releases only the individual stuck slot, and it handles a hold that _hangs_ (never settles), which a rejection-only fix does not.

3. **Consider rendering ONE frame while modal is closing** — a strategic `requestAnimationFrame` + `redraw()` after `setLoadModalIsOpen(false)` would guarantee a visible frame immediately.

---

## Finding 2: `onSubmittedWorkDone()` Promise Rejection on iOS Safari

**File**: `packages/app/src/utils/createAnimationFrame.ts:34-36`
**Severity**: High (console errors + potential permanent render stall)

```ts
hold()
  .then(() => framesPending.delete(time))
  .catch(console.error)
```

The WebGPU spec states that `device.queue.onSubmittedWorkDone()` returns a Promise that rejects if the device is lost. On iOS Safari (WebKit WebGPU implementation), this Promise may also reject under conditions that Chrome handles gracefully:

- **Idle GPU queue**: If no work was submitted since the last `onSubmittedWorkDone()` call, Safari may reject.
- **Tab visibility transitions**: When the tab goes to background and returns (modal overlay on mobile is treated as partial visibility loss).
- **Memory pressure**: iOS is aggressive about GPU memory reclamation.

When this Promise rejects, two things happen:

1. **Console spam**: `console.error` logs the rejection for every frame → matches user's "console errors"
2. **framesPending leak**: `.then()` never cleans up → see Finding 1 for downstream impact

### Recommendation

```ts
// Wrap hold to never reject
hold().then(
  () => framesPending.delete(time),
  (err) => {
    console.warn(
      '[createAnimationFrame] hold rejected, cleaning up anyway',
      err,
    )
    framesPending.delete(time)
  },
)
```

Use `.then(onFulfilled, onRejected)` instead of `.then().catch()` so `framesPending` is always cleaned up, even on rejection.

**Caveat:** if the rejection is _persistent_ (Safari rejects every frame), keeping the loop alive turns a one-time "3 errors then stall" into per-frame console spam — the very "console errors" symptom being fixed. The rejection/timeout log must therefore be **throttled** (first occurrence + every Nth), not logged unconditionally.

---

## Finding 3: Flicker From `clearRequested` on Every Camera Interaction

**File**: `packages/app/src/flame/Flam3.tsx:784-806`
**Severity**: Medium (flicker is design-level, not a bug per se)

```ts
function resetAccumulation() {
  batchIndex = 0
  accumulatedPointCount_ = 0
  lastExportRenderedPointCount = -1
  if (props.isExportRenderer ?? false) {
    setAccumulatedPointCountGlobal(0)
  }
  clearRequested = true // ← forces GPU buffer clear next renderTick
  resetPointStatePending = true
  dispatchesSincePersistReseed = 0
  requestRedraw()
}
```

The camera effect (line 763-766):

```ts
createEffect(() => {
  camera?.update()
  camera3D?.update()
  if (!animationExportRunning()) resetAccumulation()
})
```

Every camera pan/pinch/zoom calls `resetAccumulation()`, which sets `clearRequested = true`. The next `renderTick` performs `encoder.clearBuffer()` on the accumulation texture, erasing all accumulated IFS points. The subsequent dispatch starts from zero → visible flicker as the image vanishes and re-accumulates.

On iOS, this flicker is more pronounced because:

- iOS GPU has lower throughput → accumulation takes more frames to reach visible density
- The clear-before-first-dispatch gap is longer on iOS

### Recommendation

This is inherent to the point-cloud accumulation approach — when the camera moves, old points are invalid. Mitigations:

1. **Double-buffer accumulation**: Keep the previous accumulation texture and blend it with the new one during the first N frames after reset
2. **Temporal anti-flicker**: Instead of immediate `clearBuffer`, fade the old accumulation over 2-3 frames
3. **Reduce camera update frequency**: Debounce camera effect-triggered resets during rapid drag/pinch (only reset after interaction settles)

---

## Finding 4: Canvas Size Race With 150ms ResizeObserver Debounce

**File**: `packages/app/src/utils/useElementSize.ts:82` (all resize events debounced by `CANVAS_RESIZE_DEBOUNCE_MS = 150ms`)
**Severity**: Low-Medium (transient issue on first load, less likely during flame load)

```ts
// renderTick bails early if canvas size is {0,0}
const colorGradingPipeline_ = colorGradingPipeline()
if (colorGradingPipeline_ === undefined) {
  return { iterations: 0, presented: false, hadWork: false }
}
```

`colorGradingPipeline()` returns `undefined` when `outputTextures()` is `undefined`, which happens when `activeSize()` returns `{width: 0, height: 0}`. The `activeSize()` comes from the ResizeObserver on the canvas element.

During modal transitions on iOS Safari:

- The canvas container may briefly report 0 dimensions if the modal overlay causes layout shift
- The 150ms debounce means even a transient 1-frame layout change causes 150ms of zero-size rendering
- All `renderTick` calls silently return with no work → flame appears "stuck"

### Recommendation

1. **Reduce debounce to 50ms** on iOS (or remove the debounce for the first size observation)
2. **Log a warning** when `renderTick` bails due to `colorGradingPipeline() === undefined` for more than N consecutive frames — this makes the failure visible

---

## Finding 5: iOS Safari-Specific WebGPU Issues

### 5a: `getContext('webgpu')` Timing

**File**: `packages/app/src/lib/AutoCanvas.tsx:187` (deferred canvas signal via `createEffect`)

The existing code defers canvas signal assignment to an effect to work around iOS Safari's `getContext('webgpu')` returning `null` before DOM mount. This is correct and already in place.

### 5b: No `timestamp-query` Feature on Safari

**File**: `packages/app/src/lib/WebgpuAdapter.ts:227` (conditional feature request)

The code already conditionally requests `timestamp-query` only when `TRACK_PERFORMANCE && adapter.features.has('timestamp-query')`. On Safari, this falls back to CPU timing. This is correct.

However, the CPU timing fallback (`estimateIterationCount` in `renderTick`) may under-report on iOS, causing `iterationCount` to grow too aggressively → GPU queue saturation → Chrome "rAF collapse" equivalent on Safari.

---

## Finding 6: Race Between `rafLoop` Creation and `requestRedraw`

**File**: `packages/app/src/flame/Flam3.tsx:688-691, 1096-1110`
**Severity**: Low (should work due to SolidJS effect ordering, but fragile)

```ts
function requestRedraw() {
  rafLoop.redraw() // ← rafLoop is const, declared later at line 1096
  notifyExportWork?.()
}
```

`requestRedraw` is defined (line 688) before `rafLoop` is assigned (line 1096). This works via closure capture — `rafLoop` is dereferenced at call time, when it has been assigned. However:

1. The inner effect at line 740-742 calls `resetAccumulation()` → `requestRedraw()` → `rafLoop.redraw()`
2. This inner effect is queued and flushes AFTER the outer effect body completes (including `rafLoop = createAnimationFrame(...)` at line 1096)
3. So `rafLoop` should always be assigned when the inner effect fires

**BUT**: If the `createAnimationFrame` call itself fails (e.g., throws an exception), `rafLoop` would remain `undefined`, and `requestRedraw` would throw `TypeError: Cannot read properties of undefined (reading 'redraw')`.

This is unlikely but possible if, for example, `device.queue.onSubmittedWorkDone()` throws synchronously on iOS Safari (instead of returning a rejecting Promise).

### Recommendation

Add a defensive guard:

```ts
function requestRedraw() {
  rafLoop?.redraw()
  notifyExportWork?.()
}
```

---

## Resolution — What Shipped

The interactive render loop can stall on iOS Safari two ways, and the fix has to
cover **both**:

- **The hold rejects** — handled by cleaning up `framesPending` in an
  `onRejected` handler.
- **The hold hangs** (never resolves _or_ rejects, plausible on an idle WebKit
  GPU queue) — a rejection-only fix does nothing here, and the count valve can't
  fire. This is the mechanism that best explains "blank until I touch the
  camera": a camera nudge submits fresh GPU work, which lets the stuck
  `onSubmittedWorkDone` promises finally settle and drains the set.

Shipped in `createAnimationFrame.ts` and `Flam3.tsx`:

| #   | Fix                                                                                                                                                                                                                                                                                                 | Status                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | **Cleanup on reject** — `.then(onFulfilled, onRejected)`; the entry is deleted whether the hold resolves or rejects                                                                                                                                                                                 | Shipped                        |
| 2   | **Per-hold timeout** (`HOLD_TIMEOUT_MS = 2000`) — releases the individual stuck slot if the hold neither resolves nor rejects; recovers a hung queue                                                                                                                                                | Shipped (replaces count valve) |
| 3   | **Throttled stall log** — first occurrence + every 60th, so a persistent fault can't spam the console                                                                                                                                                                                               | Shipped                        |
| 4   | **`rafLoop?.redraw()` guard** in `requestRedraw`                                                                                                                                                                                                                                                    | Shipped                        |
| 5   | **`renderTick` bail diagnostics** (gpuReady=false, colorGradingPipeline undefined), gated behind `DEBUG_MODE`                                                                                                                                                                                       | Shipped (DEBUG_MODE-gated)     |
| 6   | **Force redraw on the Infinity → finite `renderInterval` transition** (modal close), not on every finite change                                                                                                                                                                                     | Shipped (transition-gated)     |
| 7   | **Skip identical-size `ResizeObserver` updates** (`useElementSize.ts`) — a modal open/close reflows iOS layout without changing the canvas box; committing a fresh same-size object still reallocated every WebGPU buffer and reset accumulation (Finding 3's real root, not the point-cloud reset) | Shipped                        |
| 8   | **Present pump** (`Flam3.tsx`) — re-blit the current image every frame while accumulating so iOS WebKit's swapchain never shows a stale buffer between the 100–229ms-apart IFS presents on load                                                                                                     | Shipped                        |
| —   | **Flicker double-buffer / fade on accumulation reset**                                                                                                                                                                                                                                              | Not needed (7 + 8 resolved it) |

Unit coverage: `createAnimationFrame.test.ts` pins the reject-cleanup, the
hung-hold timeout recovery, and the log throttle.

**Confidence.** Verified on-device (iPhone 13 Pro, iOS 26.x). On-screen render
logging confirmed the load stall, the spurious same-size pipeline rebuilds, and
the sparse (100–229ms-apart) presents behind the stale-swapchain flip; after the
fixes the stall is gone, the load renders immediately and flicker-free, and modal
open/close no longer flickers. The original stall root was the hung/rejecting
hold — a `hold rejected` log points at the reject path, a silent recovery ~2 s
after a stall points at the
timeout (hung) path.
