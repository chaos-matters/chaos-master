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

## Feature 2 — Seamless Loop ("smart loop")

**Goal:** make any user animation loop like a GIF — the last frame flows back
into the first with no visible jump.

**UX:** a `Seamless` **toggle** (checkbox) in the timeline settings bar, next to
`Loop`. It's a switch — flip it on/off, idempotent. Crucially it **adds no
keyframes**: the return is synthesized at resolve time, so the user's dope sheet
stays exactly as they drew it.

**Config flag:** `TimelineConfig.seamlessLoop: boolean` (persisted in the
animation schema, so it survives save/share/reload).

**Resolve-time synthesis (`resolveSeamlessValue`):** given
`opts = { startFrame, endFrame, userEnd }` where `userEnd` is the last keyframe
across all tracks:
- For frames in the trailing window `(userEnd, endFrame]`, a track's value ramps
  (eased) from its **held last value** back to its value at `startFrame`. So
  `value(endFrame) === value(startFrame)` and the wrap is invisible.
- Everywhere else it's exactly `resolveKeyframeValue` (no change).
- With the flag off (`opts = null`) it is a pure pass-through.

This is threaded through every resolution path via `seamlessOptsFromConfig`:
`applyTimelineToFlame` / `…AtFrame` (live playback + the timeline-based export
paths), `applyTracksToFlame` (the offscreen export job, from `job.config`), and
`resolveValueAtPath` (so the morph's `blendWeight` loops too).

**Enabling the toggle (`setSeamlessLoop(true)`):** sets `seamlessLoop = true`
and `loop = true`, and — only if the timeline currently ends on/before the last
keyframe (`endFrame <= userEnd`) — extends `endFrame` to `userEnd + round(span ×
0.5)` so a return ramp exists. Re-enabling when room already exists is a no-op
(idempotent — no piling up). Disabling just clears the flag; the keyframes were
never touched.

**Composition with Morph:** a morph is `blendWeight` 1 @ start → 0 @ endFrame.
Turning Seamless on extends the timeline past that final keyframe and ramps
`blendWeight` 0 → 1 across the new tail (and every other animated parameter back
to its origin), giving a seamless **A → B → A** loop for free.

## Files touched

- `flame/schema/timeline.ts` — `seamlessLoop` config flag (persisted).
- `utils/timeline.ts` — `seamlessLoop` config field, `resolveSeamlessValue`,
  `getUserEndFrame`, `seamlessOptsFromConfig`, `setSeamlessLoop` /
  `toggleSeamlessLoop`; seamless threading in `applyTracksToFlame`,
  `applyTimelineToFlame(AtFrame)` and `resolveValueAtPath`.
- `components/ExportJobs/OffscreenAnimationRender.tsx` — pass seamless opts from
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
flames don't, and the dissolve via the existing blend shader morphs *any* pair
of flames robustly while reusing battle-tested GPU code. The trade-off is a
cross-dissolve look rather than geometric interpolation — a deliberate choice to
match the existing **Blend** feature the user asked to mirror.
