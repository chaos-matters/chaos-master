# Offscreen export motion blur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Render in background (offscreen)" export path honour the Motion Blur setting, which it currently accepts and discards.

**Architecture:** The main-canvas path already implements sub-frame accumulation correctly in `packages/app/src/utils/animationExport.ts:176-253`. This ports that mechanism to `OffscreenAnimationRender`, which drives its own accumulation loop. No new concept is introduced; the sub-frame stepping rule is copied, not reinvented.

**Tech Stack:** SolidJS, TypeGPU/WebGPU, WebCodecs, vitest.

**Spec:** [docs/agent/BUGS.md](../../agent/BUGS.md) (`ExportPngDialog.tsx:1267`, confirmed medium) and [docs/specs/recorder-replay-export.ears.md](../../specs/recorder-replay-export.ears.md) REQ-RR-037, which carries this as a Known deviation.

**Ships as its own PR**, separate from the stage 1 defect fixes, so neither blocks the other. Branch from `main` (not from the stage 1 branch) — it shares no files with it.

## Global Constraints

- **Never push to `upstream`.** Fork branches go to `origin`; PRs target the fork's `main`.
- **No Claude attribution** in commits or PR bodies. **No emojis** anywhere.
- **Run `pnpm check`** from the repo root before declaring the work finished.
- **Never verify WebGPU with `playwright test`** — the config forces swiftshader. Use `pnpm verify:webgpu`.
- A test that was never seen red has not been written. Six mutation probes survived this suite.

---

## What is actually wrong

Worth stating precisely, because it is narrower than "motion blur is broken":

- `AnimationJobSpec` **declares** `motionBlurSamples?: number` and `shutterAngle?: number` (`packages/app/src/utils/exportJobs.ts:84-85`).
- `ExportPngDialog` **passes** `motionBlurSamples: motionBlurSamples()` when enqueuing the offscreen job.
- `OffscreenAnimationRender.tsx` references `motionBlurSamples` **zero times**.

So the value is collected from the user, typed, and delivered to the job — then dropped on the floor by the renderer. `shutterAngle` is declared on the type but never passed by the dialog at all, on either path.

The main-canvas mechanism, for reference:

```ts
const subOffset = samples > 1 ? (subIdx / samples) * (shutterAngle / 360) : 0
const subFrame = frame + subOffset
// ...render into the SAME accumulation buffer, stepping when the point count
// crosses each sub-limit:
const subLimit = Math.round(((subFrameIndex + 1) / samples) * limit)
if (current >= subLimit) {
  subFrameIndex++
  applySubFrame(subFrameIndex)
}
```

Accumulating N sub-frames into one buffer at `limit/N` points each is what produces the blur: the same total point budget, spread across N shutter positions.

---

## Task 1: Pass the shutter angle through, on both paths

`shutterAngle` is on the type and used by the main path via `config.shutterAngle ?? 180`, but the dialog never supplies it. Fix the plumbing before the renderer work, so Task 2 has a real value to read.

**Files:**

- Modify: `packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx` (both enqueue sites)
- Test: `packages/app/src/components/ExportPngDialog/exportJobSpec.test.ts` (create)

**Interfaces:**

- Produces: no new exports. `AnimationJobSpec.shutterAngle` becomes reliably populated.

- [ ] **Step 1: Find the shutter-angle source**

Run: `grep -n 'shutterAngle\|shutter' packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx`

If the dialog has no shutter control, the value is a constant 180 and you should pass it explicitly rather than relying on a downstream `?? 180`, so the two paths cannot drift.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildAnimationJobSpec } from './ExportPngDialog'

describe('buildAnimationJobSpec', () => {
  it('carries the motion blur settings the user chose', () => {
    const spec = buildAnimationJobSpec({
      motionBlurSamples: 16,
      shutterAngle: 180,
    })
    expect(spec.motionBlurSamples).toBe(16)
    expect(spec.shutterAngle).toBe(180)
  })

  it('defaults to no blur rather than undefined', () => {
    const spec = buildAnimationJobSpec({})
    expect(spec.motionBlurSamples ?? 1).toBe(1)
  })
})
```

This requires extracting the spec construction out of the click handler into an exported `buildAnimationJobSpec`. That extraction is the point: the current inline object literal is untestable, which is why the dropped field was never noticed.

- [ ] **Step 3: Run it; expect FAIL** — `pnpm --filter chaos-master exec vitest run src/components/ExportPngDialog`
- [ ] **Step 4: Extract `buildAnimationJobSpec` and pass `shutterAngle` at both enqueue sites.**
- [ ] **Step 5: Run it; expect PASS.**
- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/ExportPngDialog/
git commit -m "refactor(export): extract the animation job spec so it can be tested

The offscreen enqueue built its job as an inline object literal inside a click
handler, which is why a dropped motionBlurSamples went unnoticed. shutterAngle
was declared on AnimationJobSpec and never passed by either path."
```

---

## Task 2: Accumulate sub-frames in the offscreen renderer

**Files:**

- Modify: `packages/app/src/components/ExportJobs/OffscreenAnimationRender.tsx`
- Test: `packages/app/src/components/ExportJobs/offscreenSubFrames.test.ts` (create)

**Interfaces:**

- Produces: `export function subFrameOffsets(samples: number, shutterAngle: number): number[]` and `export function subFrameLimit(subIndex: number, samples: number, limit: number): number`, both pure, both also usable by the main-canvas path in Task 3.

- [ ] **Step 1: Write the failing test for the pure stepping rule**

Testing the arithmetic separately from the WebGPU loop is what makes this verifiable at all — the renderer itself needs a GPU.

```ts
import { describe, expect, it } from 'vitest'
import { subFrameLimit, subFrameOffsets } from './OffscreenAnimationRender'

describe('subFrameOffsets', () => {
  it('returns a single zero offset when blur is off', () => {
    expect(subFrameOffsets(1, 180)).toEqual([0])
  })

  it('spreads samples across the shutter interval, starting at the frame', () => {
    // 180 degree shutter = half a frame; 4 samples at 0, 1/8, 2/8, 3/8.
    expect(subFrameOffsets(4, 180)).toEqual([0, 0.125, 0.25, 0.375])
  })

  it('scales with the shutter angle', () => {
    expect(subFrameOffsets(2, 360)).toEqual([0, 0.5])
  })
})

describe('subFrameLimit', () => {
  it('divides the point budget evenly across samples', () => {
    expect(subFrameLimit(0, 4, 1000)).toBe(250)
    expect(subFrameLimit(1, 4, 1000)).toBe(500)
    expect(subFrameLimit(3, 4, 1000)).toBe(1000)
  })

  it('gives the whole budget to the only sample when blur is off', () => {
    expect(subFrameLimit(0, 1, 1000)).toBe(1000)
  })
})
```

- [ ] **Step 2: Run it; expect FAIL** — `pnpm --filter chaos-master exec vitest run src/components/ExportJobs/offscreenSubFrames.test.ts`

- [ ] **Step 3: Implement the two pure helpers**

```ts
/**
 * Sub-frame offsets within one frame, in frames. A 180 degree shutter covers
 * half a frame, so N samples sit at 0, d/N, 2d/N ... where d = angle/360.
 * Mirrors packages/app/src/utils/animationExport.ts:181-186 -- keep the two in
 * step, or an offscreen render and a main-canvas render of the same timeline
 * will not match.
 */
export function subFrameOffsets(
  samples: number,
  shutterAngle: number,
): number[] {
  const n = Math.max(1, samples)
  if (n === 1) return [0]
  const duration = shutterAngle / 360
  return Array.from({ length: n }, (_, i) => (i / n) * duration)
}

/** Cumulative point budget after sub-frame `subIndex`, so N sub-frames share one frame's points. */
export function subFrameLimit(
  subIndex: number,
  samples: number,
  limit: number,
): number {
  const n = Math.max(1, samples)
  return Math.round(((subIndex + 1) / n) * limit)
}
```

- [ ] **Step 4: Run it; expect PASS.**

- [ ] **Step 5: Wire them into the frame loop**

In `OffscreenAnimationRender.tsx`, read `job.motionBlurSamples ?? 1` and `job.shutterAngle ?? 180`. `frameFlame(frame)` already takes a number and calls `applyTracksToFlame(job.tracks, clone, frame, loopOpts)`, so a fractional frame interpolates correctly — verify that before relying on it, with a one-off assertion that `frameFlame(10.5)` differs from both `frameFlame(10)` and `frameFlame(11)` on an animated parameter.

Step the sub-frame index in the same place the renderer currently decides a frame is finished: when the accumulated point count crosses `subFrameLimit(subIndex, samples, limit)`, advance to the next sub-frame and re-apply the flame **without clearing the accumulation buffer**. Only after the last sub-frame does the frame get encoded.

- [ ] **Step 6: Run the export suite** — `pnpm --filter chaos-master exec vitest run src/components/ExportJobs src/recorder`

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/components/ExportJobs/
git commit -m "feat(export): honour motion blur on the offscreen render path

OffscreenAnimationRender never read job.motionBlurSamples, so a background
export produced output byte-identical to blur-off while the UI said otherwise.
The sub-frame stepping rule is now shared pure code rather than a second
implementation that can drift from the main-canvas path."
```

---

## Task 3: Make the two paths share the rule

Having fixed the offscreen path, the main-canvas path still carries its own copy of the same arithmetic inline. Two implementations of one rule is how they drift — and this whole audit exists because a copy drifted.

**Files:**

- Modify: `packages/app/src/utils/animationExport.ts:176-253`

- [ ] **Step 1: Replace the inline offset and sub-limit arithmetic** with `subFrameOffsets` / `subFrameLimit`.
- [ ] **Step 2: Run the animation-export suite** and confirm no behavioural change: `pnpm --filter chaos-master exec vitest run src/utils`
- [ ] **Step 3: Verify the equivalence explicitly.** `motionBlur.test.ts` currently re-derives the arithmetic inline and imports nothing from `animationExport.ts` — so it cannot catch a drift. Point it at the shared helpers.
- [ ] **Step 4: Commit** — `refactor(export): one sub-frame rule for both export paths`.

---

## Verification, with the user

Sub-frame accumulation is a visual property. No unit test proves the output looks right, so this needs a real comparison.

- [ ] Export the **same** short animation four ways: main-canvas blur off, main-canvas blur 16x, offscreen blur off, offscreen blur 16x.
- [ ] Assert mechanically that offscreen-16x is **not** byte-identical to offscreen-off. That is the exact defect, and it is cheap to check with a file hash.
- [ ] Compare main-canvas-16x against offscreen-16x on a fast-moving parameter. They should be visually equivalent; if they are not, the sub-frame offsets or the point budget split differ between the paths.
- [ ] Confirm export time for 16x is meaningfully longer than for blur-off. If it is not, the sub-frames are not actually being rendered.

Ask the user to eyeball the two 16x outputs side by side before merging — this is the step that catches "it accumulated, but into the wrong buffer".

---

## Self-review notes

- **Scope:** this plan does not touch the PNG export path, which has no motion blur concept, and does not add a shutter-angle UI control. If the user wants one, that is a separate change.
- **Risk:** the offscreen renderer owns its own WebGPU Root and encoder. Accumulating without clearing between sub-frames is the one place a mistake produces a plausible-looking but wrong image — hence the byte-identity check above, which fails loudly rather than subtly.
- **Type consistency:** `subFrameOffsets` and `subFrameLimit` keep the same signatures in Tasks 2 and 3.
