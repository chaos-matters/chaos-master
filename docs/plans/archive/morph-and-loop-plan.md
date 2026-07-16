# Morph & Seamless Loop — design + implementation notes

Two related animation features built on top of the existing **Blend** pipeline
and the **dope sheet / timeline** keyframe system.

## Background — what already existed

- **Blend** (`ViewControls` → `blendFlame` + `blendWeight`): the IFS compute
  shader runs two flames at once. Per iteration it picks flame A with probability
  `blendWeight` and flame B otherwise (`ifsPipeline.ts`, `executeRandomFlame`):

  ```
  if (random() < blendWeight) { ...A transforms... } else { ...B transforms... }
  ```

  So `blendWeight = 1` → pure A, `blendWeight = 0` → pure B. Sweeping the weight
  produces a probabilistic **cross-dissolve** between the two flames.

- `blendWeight` is already a first-class **animatable timeline parameter**
  (`TIMELINE_PARAMETERS`, group `Blend`). `resolvedBlendWeight()` in
  `MainWorkspace` reads the keyframed value at the current frame when animation
  is enabled, and both `<Flam3>` and the blend slider consume it.

- The timeline (`createTimelineState` in `utils/timeline.ts`) stores tracks of
  keyframes (`{ frame, value, easing }`), interpolated by `resolveKeyframeValue`,
  with config `{ fps, startFrame, endFrame, loop, ... }`. Playback loops back to
  `startFrame` when `loop` is on.

This means a "morph from flame A to flame B" is just: pick B as the blend flame,
then keyframe `blendWeight` from `1` (start) down to `0` (end). No new GPU code,
no geometric coefficient interpolation (which can't handle differing transform
counts / variation types between the two flames — the dissolve handles any pair).

## Feature 1 — Morph (animated blend)

**UX:** a `Morph...` button next to `Blend...` in `ViewControls` (2D only, like
Blend). Click → the existing `BlendFlameGallery` opens (re-used) with the heading
"Pick End Flame". Picking a flame sets up the morph and shows the timeline.

**`setupMorph(endFlame)` (MainWorkspace):**

1. `setBlendFlame(deepClone(endFlame))` — current flame is A, picked flame is B.
2. Rebuild the `blendWeight` track: clear it, then
   - keyframe `1` @ `startFrame` (`easeInOut`)
   - keyframe `0` @ `endFrame` (`easeInOut`)
3. `setBlendWeight(1)` so the static view starts on flame A.
4. Enable animation + reveal the timeline, jump to `startFrame`, toast.

Pressing Play sweeps `blendWeight` 1→0 → A dissolves into B. The morph is a
normal keyframe track, so it's fully editable in the dope sheet, exportable, and
shareable like any other animation.

## Feature 2 — Loop synthesis ("smart loop")

**Goal:** make any user animation loop like a GIF — the last frame flows back
into the first with no visible jump.

**UX:** a `Loop Style` **selector** in the timeline settings bar (next to
`Loop`): `None` / `Seamless` / `Cycle`. Both modes **add no keyframes** — the
loop is synthesized at resolve time, so the dope sheet stays exactly as drawn.

**Config:** `TimelineConfig.loopMode: 'off' | 'seamless' | 'cycle'` (persisted in
the animation schema, so it survives save/share/reload).

Two modes (`LoopMode`):

- **Seamless** — _there-and-back_. Given the last keyframe across all tracks
  (`userEnd`), in the trailing window `(userEnd, endFrame]` each track ramps
  (eased) from its held last value back to its value at `startFrame`, so
  `value(endFrame) === value(startFrame)`. Enabling extends `endFrame` to
  `userEnd + span` (full forward span) so B→A takes the **same time** as A→B.

- **Cycle** — _per-property cyclic wrap_. The timeline `[startFrame, endFrame]`
  is one period `P`. Inside a track's own keyframe span it resolves normally;
  outside it (before its first keyframe `k0` or after its last `kn`) it
  interpolates across the wrap `kn → k0 + P`. The wrap duration for a property is
  `(endFrame − kn) + (k0 − startFrame)` — so it respects each track's **own**
  keyframe timing/phase, and `value(startFrame) === value(endFrame)` falls out
  automatically. No timeline extension.

**Resolution (`resolveLoopValue`):** dispatches on `opts.mode`; with `opts =
null` it's exactly `resolveKeyframeValue`. Threaded through every resolution path
via `loopOptsFromConfig`: `applyTimelineToFlame` / `…AtFrame` (live playback +
timeline-based export paths), `applyTracksToFlame` (the offscreen export job,
from `job.config`), and `resolveValueAtPath` (so the morph's `blendWeight` loops
too). Setting a mode (`setLoopMode`) is idempotent — re-selecting doesn't pile up
frames; switching to `None` just clears it; keyframes are never touched.

**Composition with Morph:** a morph is `blendWeight` 1 @ start → 0 @ endFrame.
`Seamless` extends the timeline and ramps `blendWeight` 0 → 1 across the new tail
(A→B→A); `Cycle` wraps it within the existing period — both give a seamless loop
for free.

## Files touched

- `flame/schema/timeline.ts` — `loopMode` config field (persisted).
- `utils/timeline.ts` — `loopMode` config field, `LoopMode`, `resolveLoopValue`
  (`resolveSeamless` + `resolveCycle`), `getUserEndFrame`, `loopOptsFromConfig`,
  `setLoopMode`; loop threading in `applyTracksToFlame`,
  `applyTimelineToFlame(AtFrame)` and `resolveValueAtPath`.
- `components/ExportJobs/OffscreenAnimationRender.tsx` — pass loop opts from
  `job.config` so exports bake the loop.
- `components/ViewControls/ViewControls.tsx` — `onMorphFlame` prop + `Morph...`
  button.
- `components/BlendFlameGallery/BlendFlameGallery.tsx` — optional `heading` prop.
- `components/Timeline/TimelineSettings.tsx` — `Seamless` toggle.
- `MainWorkspace.tsx` — `blendIntent` signal, `pickMorphFlame`, `setupMorph`,
  gallery `onSelect` branch + heading, `onMorphFlame` wiring.

## Why dissolve instead of geometric morph

The reference (`foss/chaos`) lerps affine coefficients of a fixed transform set.
That only works when both flames share transform count / variation types. Our
flames don't, and the dissolve via the existing blend shader morphs _any_ pair
of flames robustly while reusing battle-tested GPU code. The trade-off is a
cross-dissolve look rather than geometric interpolation — a deliberate choice to
match the existing **Blend** feature the user asked to mirror.
