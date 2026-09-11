# Timeline keyframing and audio-reactive modulation — EARS requirements

**Version:** 0.9.11 (`packages/app/package.json`) — describes `main` at PR #83
(`v0.9.11..a5c2f26f`, 39 commits); the package version has not been bumped since the tag
**Date:** 2026-09-10
**Scope:** The two systems that make a flame move over time — the timeline
(tracks, keyframes, interpolation, loop synthesis, auto-keyframing, transport)
and audio-reactive modulation (feature extraction, mapping evaluation,
attack/release envelopes, the wiring editor). It deliberately does **not** cover
the offline animation exporter (`utils/animationExport.ts`,
`ExportPngDialog`), the recorder/replay wrappers in `recorder/timelineActions.ts`,
the Sonification panel, the WebMCP `arcade_*` audio tools, or the Timeline
panel's DOM layout — a missing requirement about any of those is out of bounds,
not a gap.

**Source:**

- `packages/app/src/utils/timeline.ts` — track/keyframe store, `resolveKeyframeValue`,
  loop synthesis (`resolveLoopValue`/`resolveSeamless`/`resolveCycle`), undo and
  coalescing, transport, `applyTracksToFlame`
- `packages/app/src/utils/easing.ts` — `applyEasing`, `catmullRom`, `clamp` (the copy
  the timeline actually imports)
- `packages/core/src/math/easing.ts` — a byte-identical second copy, re-exported from
  `packages/core/src/index.ts` (see REQ-TA-013)
- `packages/app/src/hooks/useWorkspaceTimelineBinding.ts` — the resolver/writer pair
  the timeline reads parameter values through and writes animated values back with
- `packages/app/src/utils/keyframeOnChange.ts` — the two auto-recording modes
  (Auto keyframe, track-changes) every slider calls after applying a value
- `packages/app/src/utils/audioAnalysis.ts` — FFT bands, beat/onset detection, the
  file and live analyzers, `getAudioFeatureNormalized`, `applyAudioMappingsToFlame`
- `packages/app/src/utils/useAudioReactive.ts` — the 30 Hz transport + modulation loop
- `packages/app/src/utils/audioWiringPresets.ts` — render-only and flame-aware presets
- `packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx` — the wiring editor
  (connect/replace, defaults, its own undo stack, import/export, shortcuts)
- `packages/app/src/flame/Flam3.tsx:530-580`, `:1192-1198` — where the timeline overlay is
  applied to the rendered flame and where playback advances
- `packages/app/src/components/Timeline/hooks/useSeekScrubber.ts` — scrub gesture

**Tests:**

- `packages/app/src/utils/timeline.test.ts` — resolution, all six easing curves,
  `constant`/`spline` interp, loop modes, `applyTracksToFlame`, transport arithmetic
- `packages/app/src/utils/timelineUndo.test.ts` — undo/redo, coalescing, no-op guards,
  load boundaries, value write-back
- `packages/app/src/utils/timeline.variation.test.ts` — `VariationParameterMaps` and
  `resolveVariationParameter`
- `packages/app/src/hooks/useWorkspaceTimelineBinding.test.ts` — resolver/writer round
  trips for render settings, camera, transforms and variations
- `packages/app/src/utils/audioAnalysisMappings.test.ts` — per-target appliers,
  attack/release envelope, dirty-check
- `packages/app/src/utils/audioMappingClamp.test.ts` — schema clamping, integer
  `skipIters`, probability floor, degenerate ranges
- `packages/app/src/utils/audioWiringPresets.test.ts` — preset determinism, targets that
  exist, ranges inside the schema
- `packages/app/src/utils/useAudioReactive.test.ts` — modulation suspension only (one test)
- `packages/app/src/components/AudioReactivePanel/AudioReactivePanel.test.tsx` —
  `defaultTarget` and `flameTargetKey` round trips
- `tests/timeline.spec.ts` — end-to-end: the panel renders, frames navigate, keyframes
  can be added/updated/removed through the UI
- _Gap:_ `AudioWiringModal.tsx` has **no test of any kind** (unit or e2e) — REQ-TA-035
  through REQ-TA-038 are entirely unguarded. `keyframeOnChange.ts` likewise has no test,
  so REQ-TA-020 is unguarded. See **Coverage gaps** at the end for the full list.

---

## Requirements

### Tracks and keyframes

### REQ-TA-001 — A track exists exactly as long as it holds keyframes

**When** a keyframe is written for a parameter path that has no track, the
timeline shall create a track for that path holding only that keyframe; **when**
the last keyframe is removed from a track, the timeline shall drop the track
entirely rather than keep an empty one.

_(`timeline.ts:974-1018` creates; `:1025-1039` filters `keyframes.length > 0`.)_

### REQ-TA-002 — Re-keying a frame updates in place and keeps what the caller did not pass

**When** a keyframe is written at a frame that already holds one for that path,
the timeline shall replace that keyframe's value and shall preserve its existing
`easing` and `interp` for any of the two the caller omitted — so a value scrub
does not silently reset a keyframe to linear.

_(`timeline.ts:986-1007` — `easing: easing ?? kf.easing`, `interp: interp ?? kf.interp`.)_

### REQ-TA-003 — Keyframing at the playhead writes through to the flame

**When** a keyframe is written at a frame equal to the current frame and a value
writer is registered, the timeline shall also push that value into the flame
descriptor through the writer, so the canvas and the keyframe agree without
waiting for the next resolve.

_(`timeline.ts:1020-1022`.)_

### REQ-TA-004 — An edit that changes nothing costs no undo entry

**If** `removeKeyframe` names a frame with no keyframe, `removeAllKeyframesForPath`
names a path with no track, `clearAllTracks` runs on an empty timeline, or
`setLoopMode` is handed the mode already in effect, **then** the timeline shall
return without pushing an undo entry and without clearing the redo stacks — a
Ctrl+Z must never be spent on a no-op, and must never destroy a live redo.

_(`timeline.ts:1057-1062`, `:1447-1452`, `:1621-1625`, `:1648-1650`; guarded by
`timelineUndo.test.ts:84-107`, `:300`.)_

### REQ-TA-005 — Structural operations refuse non-interpolatable keyframes

**If** the keyframe named by `splitKeyframeAtFrame`, `moveKeyframe`,
`relocateKeyframe`, `applyMirroredValueFromTrack` or `setKeyframeInterp` holds
`null` or a boolean, **then** the operation shall be a no-op and shall report
failure to callers that return a status, rather than write a value the resolver
cannot blend.

_(`timeline.ts:1083-1092` `setKeyframeInterp`, `:1234-1240` `splitKeyframeAtFrame`,
`:1308-1315` `applyMirroredValueFromTrack`, `:1583-1589` `moveKeyframe`,
`:1610-1611` `relocateKeyframe`; guarded by `timeline.test.ts:223`, `:325`.)_

### REQ-TA-006 — A keyframe drag never clobbers its neighbour

**If** `relocateKeyframe` is asked to move a keyframe onto a frame that already
holds one on the same track, **then** it shall leave both keyframes untouched.
`relocateKeyframe` shall push no undo entry of its own, because the drag gesture
that owns it already opened one.

_(`timeline.ts:1608-1620`.)_

### REQ-TA-007 — Loading tracks is a document boundary

**When** `loadTracks` runs, the timeline shall deep-clone the incoming tracks and
keyframes, clear both undo and redo stacks, end any open coalescing run, and
clear `previewHeld` — so Ctrl+Z after opening another flame cannot restore the
previous flame's tracks onto the new one, and a stale redo cannot overwrite what
was just loaded.

_(`timeline.ts:1658-1681`; guarded by `timelineUndo.test.ts:353-385`.)_

---

### Resolving a value at a frame

### REQ-TA-008 — The later keyframe owns the segment

The keyframe resolver shall take both the easing curve and the interpolation
mode for the segment `prev → next` from **`next`**, defaulting to `'linear'` for
each when unset — so a curve authored on a keyframe describes how the animation
arrives at it, not how it leaves it.

_(`timeline.ts:587-588`; exercised throughout `timeline.test.ts:364-408`, which
authors the curve on the second keyframe.)_

### REQ-TA-009 — Outside the keyframe span the value holds

**If** the requested frame is at or before the first keyframe, **then** the
resolver shall return the first keyframe's value; **if** it is at or after the
last, it shall return the last keyframe's value; **if** two keyframes share a
frame, it shall return the earlier one's value. A track with no keyframes shall
resolve to `null`.

_(`timeline.ts:556-566`, `:580`; the after-last hold is exercised indirectly by
`timeline.test.ts:649`, the empty case by `:410`.)_

### REQ-TA-010 — Six easing curves, applied to the normalized segment position

The resolver shall map the segment position `t = clamp((frame - prev.frame) /
(next.frame - prev.frame), 0, 1)` through the segment's curve before
interpolating, supporting exactly `linear`, `easeIn` (cubic), `easeOut`
(inverse cubic), `easeInOut`, `bounce` and `elastic`, and shall treat any
unrecognised curve as `linear`.

_(`timeline.ts:583-587`, `easing.ts:7-24`; every curve guarded by
`timeline.test.ts:364-408`.)_

### REQ-TA-011 — Interpolation mode is orthogonal to easing

**Where** a segment's `interp` is `'constant'`, the resolver shall hold the
previous keyframe's value for the whole segment; **where** it is `'spline'`, the
resolver shall interpolate with Catmull-Rom (tension 0.5) using the two adjacent
keyframes as tangent controls, substituting the boundary value when a neighbour
is missing or is of a different shape; otherwise it shall interpolate linearly.
The eased `t` shall be fed to all three modes alike.

_(`timeline.ts:489-541`, `:588-617`; guarded by `timeline.test.ts:685-753`.)_

### REQ-TA-012 — Arrays blend component-wise; strings and booleans hold

**While** both endpoints of a segment are numeric arrays of equal length, the
resolver shall interpolate them component-wise (RGB and RGBA colour tracks);
**if** the endpoints are strings, booleans, or arrays of differing length,
**then** it shall hold the previous value rather than produce a blended one, and
snap to the target only once the segment completes.

_(`timeline.ts:508-541`, `:601-622`, `:394-413`; array blending guarded by
`timeline.test.ts:735`, `:415`.)_

### REQ-TA-013 — One implementation of the interpolation math

The monorepo shall hold exactly one implementation of `applyEasing`,
`catmullRom`, `lerp` and `clamp`, so that a fix to a curve reaches every caller.

> **Known deviation:** `packages/core/src/math/easing.ts` is byte-identical to
> `packages/app/src/utils/easing.ts` (`diff` reports no difference). The core copy
> is re-exported by `packages/core/src/index.ts:5` and imported by nothing —
> repo-wide, the only importers of `applyEasing`/`catmullRom` are
> `packages/app/src/utils/timeline.ts:3` and `timeline.test.ts:2`, both of which
> resolve to the **app** copy. The math was copied into core rather than moved, so
> a change to the app twin silently leaves core stale and vice versa.

---

### Loop synthesis

### REQ-TA-014 — With loop synthesis off, resolution is untouched

**Where** `config.loopMode` is `'off'` or absent, `loopOptsFromConfig` shall
return `null` and `resolveLoopValue` shall be exactly `resolveKeyframeValue`.

_(`timeline.ts:372-390`, `:415-429`; guarded by `timeline.test.ts:643`, `:629`.)_

### REQ-TA-015 — Seamless mode synthesizes a there-and-back tail

**Where** `loopMode` is `'seamless'`, the resolver shall, for frames in the
trailing window `(userEnd, endFrame]`, ramp each track from its held value at
`userEnd` back to its value at `startFrame` along an `easeInOut` curve, so that
`value(endFrame) === value(startFrame)` for every track. **If** either endpoint
resolves to `null`, or `endFrame <= userEnd`, **then** it shall fall back to
ordinary keyframe resolution. `userEnd` is the last keyframe frame across all
tracks.

_(`timeline.ts:342-354`, `:432-457`; guarded by `timeline.test.ts:609`, `:649`.)_

### REQ-TA-016 — Cycle mode wraps each track on its own phase

**Where** `loopMode` is `'cycle'`, the resolver shall treat
`[startFrame, endFrame]` as one period `P`, resolve normally inside a track's own
keyframe span, and outside it interpolate across the wrap from that track's last
keyframe to its first keyframe shifted by `+P`, easing with the **first**
keyframe's curve. **If** the track has fewer than two keyframes, `P <= 0`, or the
track's keyframes already span the full period, **then** it shall fall back to
ordinary resolution.

_(`timeline.ts:460-487`; guarded by `timeline.test.ts:618`, `:663`, `:669`.)_

### REQ-TA-017 — Selecting a loop mode adds no keyframes and is undoable

**When** `setLoopMode` runs, it shall change only the config: `'cycle'` and
`'seamless'` shall additionally enable `loop`, and `'seamless'` shall extend
`endFrame` past the last keyframe by the forward span (so the return tail takes
as long as the forward animation) only when `endFrame` does not already exceed
`userEnd`. `'cycle'` shall never extend `endFrame`. The whole change shall record
one undo entry, because a silently rewritten `endFrame` must be reversible.

_(`timeline.ts:1636-1656`; guarded by `timeline.test.ts:574`, `:589`, `:599` and
`timelineUndo.test.ts:287`.)_

---

### Writing tracks onto a flame

### REQ-TA-018 — Only tracks that are present and correctly typed are written

**When** `applyTracksToFlame` runs, it shall write a value into the flame only
for parameter paths that have a track, and only when the resolved value matches
the target's type (number for scalars, string for `drawMode`/`colorInitMode`/
`pointInitMode`, a 3-element array for `backgroundColor`, a 4-element array for
`edgeFadeColor`) — leaving every unanimated field of the flame exactly as it was.
Camera tracks shall additionally be skipped when the flame carries no
`camera`/`camera3D` object to write into.

_(`timeline.ts:1760-1911`, `:2037-2052`; guarded by `timeline.test.ts:846`, `:866`,
`:895`, `:971`.)_

### REQ-TA-019 — The final transform is seeded before it is animated

**If** a flame with `finalTransform` tracks has no `finalTransform`, **then**
`applyTracksToFlame` shall seed one with the identity matrix matching the flame's
dimensionality — the 12-parameter 3D identity when `renderSettings.dimensions === 3`,
the 6-parameter 2D identity otherwise — before applying the `finalTransform.*`
tracks.

_(`timeline.ts:1992-2035`; guarded by `timeline.test.ts:1017`, `:1061`.)_

---

### Auto-keyframing on edit

### REQ-TA-020 — Two recording modes, both gated on the animation UI

**Where** Auto keyframe is on, an edit shall re-record a keyframe at the current
frame only for paths that **already** have a track; **where** the track-changes
diamond is on, an edit shall record a keyframe for every path it changed, creating
the first keyframe for a previously unanimated one. **If** `animationEnabled` is
false, **then** neither mode shall record anything, so a persisted "on" state
cannot leave ghost keyframes behind after the user leaves animation mode.

_(`keyframeOnChange.ts:21-55`; `autoKeyframe` persists under
`timeline-auto-keyframe` and defaults **on** — `timeline.ts:692-695`;
`keyframeOnChange` persists under `editor/keyframe-on-change` and defaults **off**.)_

### REQ-TA-021 — Editing a keyframed parameter at its own keyframe records the new value

**When** the playhead sits exactly on a keyframe for a parameter and the user
edits that parameter, the value resolver shall return the freshly edited value
from the flame descriptor, so auto-keyframing overwrites the keyframe with the
edit.

> **Known deviation:** `packages/app/src/hooks/useWorkspaceTimelineBinding.ts:87-96`
> — `getFlameCameraSetting` consults `getTimelineCameraKeyframeValue` (`:35-45`)
> _before_ checking whether the path is a camera path at all, and `getFlameValue`
> (`:383-384`) routes **every** path that is not a render setting through it. So for
> any transform, variation-weight or variation-parameter path, if the timeline is
> driving the view and a keyframe exists at the current frame, the resolver returns
> the **old keyframe value** instead of the edited one. `addKeyframesAtCurrentFrame`
> then re-keys that stale value, and `addKeyframeImpl` (`timeline.ts:1020`) writes it
> straight back into the flame — the edit is discarded and the slider snaps back.
> Before the `MainWorkspace` decomposition (commit `88070311`) this short-circuit was
> inlined in seven camera `case` arms only (`camera.x`, `camera.y`, `camera.zoom`,
> `camera3D.theta`, `camera3D.phi`, `camera3D.radius`, `camera3D.fov` — never
> `camera.rotation`); the extraction widened it to all paths.

### REQ-TA-022 — The keyframe override applies to camera paths only

**While** the timeline is driving the view, the value resolver shall prefer the
keyframe value over the flame descriptor's value **only** for the seven camera
paths that the timeline overlay, rather than the base flame, owns
(`camera.x`, `camera.y`, `camera.zoom`, `camera3D.theta`, `camera3D.phi`,
`camera3D.radius`, `camera3D.fov`). Every other path shall resolve from the live
flame descriptor.

> **Known deviation:** `packages/app/src/hooks/useWorkspaceTimelineBinding.ts:87-96`
> — the override is reached for every non-render-setting path, not just the seven
> camera ones. Same root cause as REQ-TA-021; fixing it means testing
> `CAMERA_GETTERS[path]` before consulting the keyframe, not after.

### REQ-TA-023 — One gesture is one undo step

**While** the same set of parameter paths is being re-recorded at the same frame,
successive `addKeyframesAtCurrentFrame` calls shall coalesce into the undo entry
the first of them pushed — so a slider scrub that fires per pointer-move costs
one Ctrl+Z, not hundreds. The run shall end **when** any of the following happens:
the playhead moves, the owning input calls `breakUndoCoalescing` at gesture end,
a different path set or frame is recorded, an undo or redo runs, or the caller
passes `coalesce: false` (dice rolls, diamond clicks, debounced flushes), each of
which shall be its own step.

_(`timeline.ts:661-667`, `:814-816`, `:1529-1552`, `:1557-1568`; guarded by
`timelineUndo.test.ts:109-208`.)_

---

### Transport: scrubbing versus playing

### REQ-TA-024 — One definition of "the timeline owns the view"

The timeline shall expose `isDrivingView()` as
`animationEnabled() && (isPlaying() || isScrubbing() || previewHeld())`, and every
consumer that overlays animated values onto the rendered flame shall gate on that
accessor rather than on `isPlaying()` alone — otherwise a frame reached by
clicking or stepping renders its camera but not its transforms.

_(`timeline.ts:703-704`; consumed at `Flam3.tsx:541-544`.)_

### REQ-TA-025 — A seeked frame outlives the gesture that reached it

**When** the playhead is moved by any means — `goToFrame`, `advanceFrame`,
`goBackFrame` or `play` — the timeline shall latch `previewHeld`, so the canvas
keeps showing that frame's animated state after the pointer is released instead of
snapping back to the base flame. **While** a scrub drag is in progress
`isScrubbing` shall be true, and it shall be cleared on pointerup, pointercancel
or unmount; only `loadTracks`, `clearAllTracks` and the Home hand-off reset shall
clear `previewHeld`.

_(`timeline.ts:1366-1425`, `:1621-1622`, `:1658-1659`;
`useSeekScrubber.ts:11-17`, `:33-36`, `:68-70`; `MainWorkspace.tsx:2240-2246`.)_

### REQ-TA-026 — Playback advances at the configured rate, or on quality with Auto FPS

**While** playback is running and Auto FPS is off, the renderer shall advance
`config.timeScale` frames every `1000 / config.fps` ms. **Where** Auto FPS is on,
that interval shall not run at all; the render loop shall advance one frame each
time the current frame reaches target quality, and the timeline shall report the
achieved rate as an exponential moving average (`0.8` prior, `0.2` new sample),
reported as `undefined` whenever playback stops.

_(`Flam3.tsx:558-579` and `:1192-1198`; `timeline.ts:1366-1387`, `:687-691`.)_

### REQ-TA-027 — Playback without loop stops at the end

**When** `advanceFrame` passes `config.endFrame`, the timeline shall return the
playhead to `config.startFrame`, and **if** `config.loop` is false, **then** it
shall additionally stop playback and reset the FPS meter. `play` shall rewind to
`startFrame` first **if** looping is off and the playhead is already at or past
the end.

_(`timeline.ts:1390-1400`, `:1418-1426`; guarded by `timeline.test.ts:440-461`.)_

---

### Audio-reactive modulation

### REQ-TA-028 — Every audio feature reaches the mapper as 0-1

The analyzer shall expose thirteen features and normalize each into `[0, 1]`
before mapping: eight FFT bands (`subBass`…`fullSpectrum`) as their mean bin
magnitude capped at 1, `rms` capped at 1, `centroid` divided by 20 kHz and
capped, `flatness` as computed, `onset` as its rolling-median strength, and
`beat` as `1` on a detected beat and `0` otherwise. An unrecognised feature name
shall yield `0`.

_(`audioAnalysis.ts:587-609`, `:101-154`; beats at `:177-220` — spectral-flux peaks
above `mean + 1.5σ` with a 100 ms minimum gap; onsets at `:227-270`.)_

### REQ-TA-029 — Attack and release are a one-pole envelope on the normalized feature

**Where** a mapping declares `attackMs` or `releaseMs`, the mapper shall smooth
the normalized feature with `next = prev + (dt / (tc + dt)) * (value - prev)`,
using `attackMs` as `tc` while the value is rising and `releaseMs` while it is
falling, falling back to whichever of the two is set when the other is absent.
**If** both are absent or zero, **then** the feature shall pass through
unsmoothed. `prev` shall come from the per-target smoothing state, seeded with the
current value on the first frame so a mapping does not ramp up from zero.

_(`audioAnalysis.ts:695-723`, called from `:895-901`; guarded by
`audioAnalysisMappings.test.ts:267`.)_

### REQ-TA-030 — The mapped value is `lo + smoothed × sensitivity × (hi − lo)`

The mapper shall convert a smoothed feature into a target value as
`range[0] + smoothed * sensitivity * (range[1] - range[0])`. Sensitivity scales
the span rather than clipping it, so a sensitivity above 1 can carry the value
past `range[1]`; keeping the result inside the schema is REQ-TA-032's job, not
this formula's.

_(`audioAnalysis.ts:611-618`, `:913`.)_

### REQ-TA-031 — Sub-threshold movement does not re-render

**If** a target's smoothed value has moved less than 0.005 from the value last
applied to that target, **then** the mapper shall skip writing it, shall keep the
previously applied value as the comparison baseline, and shall still record the
new smoothed value so the envelope keeps advancing. **If** no target changed on a
frame, the mapper shall leave `flame.renderSettings` referentially untouched, so
the render loop sees no new work.

_(`audioAnalysis.ts:625`, `:725-745`, `:908-921`; guarded by
`audioAnalysisMappings.test.ts:320`.)_

### REQ-TA-032 — Audio modulation cannot leave the flame schema-invalid

**When** the mapper writes a render setting, it shall clamp the value to that
setting's schema bounds, round `skipIters` to an integer, and substitute `0` for
a non-finite value. **When** it writes a transform probability, it shall clamp to
a floor of `0.001`, never zero or negative. **If** the target names a transform
index that does not exist, or a variation type the transform does not carry,
**then** the write shall be skipped rather than create the missing object.

Rationale, not decoration: audio modulation writes straight into the live
descriptor, and one out-of-range `palettePhase` makes that flame permanently
un-breedable, un-exportable and un-openable in the ancestry tree.

_(`audioAnalysis.ts:657-684`, `:787-824`, `:773-785`, `:827-844`; guarded by
`audioMappingClamp.test.ts:62-133` and `audioAnalysisMappings.test.ts:158`, `:226`.)_

### REQ-TA-033 — Auditioning a track is not the same as driving the flame

**While** a decoded file is loaded, the audio transport — context, buffer source,
seek and the playback-position readout — shall run regardless of whether audio
reactivity is enabled and regardless of whether the analysis pass has finished;
only the modulation step shall wait on both. **Where** the source is the
microphone, both transport and modulation shall be gated on reactivity being
enabled, so an idle mic capture is never held open.

_(`useAudioReactive.ts:98-211` for file mode — note the analyzer is consulted only
at `:172`; `:213-248` for mic mode.)_

### REQ-TA-034 — Replay suspension freezes modulation and its clock

**While** `modulationSuspended` is true — a recorder replay owns the document —
the audio loop shall write nothing to the flame and shall clear its `lastTickTime`
baseline, so the first tick after resuming uses a fresh `dt` rather than charging
the envelope for the whole suspended interval. The transport clock shall keep
advancing.

_(`useAudioReactive.ts:168-171`, `:221-224`; guarded by
`useAudioReactive.test.ts:37`.)_

---

### The wiring editor

### REQ-TA-035 — One wire per target

**When** the user connects an audio source to a target that already has a wire,
the wiring editor shall remove the existing mapping, add the new one, and surface
a non-blocking replacement toast naming the displaced source for 2.5 s. **If** the
target is already wired to that same source, **then** the editor shall select the
existing wire and change nothing.

_(`AudioWiringModal.tsx:638-670`.)_

### REQ-TA-036 — A new wire is audible by default

**When** a wire is created by drag or click, the editor shall give the entry
`sensitivity: 0.3`, `attackMs: 40`, `releaseMs: 150`, and a range of `[0, 1]` —
or `[0.5, 1.5]` **where** the target is camera zoom, for which `[0, 1]` would
collapse the view.

_(`AudioWiringModal.tsx:33-39`, `:654-661`.)_

### REQ-TA-037 — Imported wiring is shape-checked before it is applied

**If** pasted or loaded wiring JSON is not an array, or any entry lacks a string
`audioFeature`, an object `target` with a string `kind`, a numeric `sensitivity`
or a two-element `range`, **then** the editor shall reject the import with an
explanatory message and leave the current mappings untouched. A valid import
shall record an undo entry before replacing the mappings.

_(`AudioWiringModal.tsx:1003-1024`, `:1052-1069`; the editor keeps its own 50-entry
undo stack at `:498`, `:685-713`, cleared of redo on every mutating operation.)_

### REQ-TA-038 — Editor shortcuts never steal keys from a text field

**If** a keydown originates from an `INPUT`, `TEXTAREA` or `SELECT`, **then** the
editor shall not handle undo/redo or delete for it. Escape shall unwind exactly
one layer per press, in the order import panel → pending paste → active drag →
pending connection → selected wire → close the modal.

_(`AudioWiringModal.tsx:855-915`.)_

---

## Coverage gaps

Requirements below have **no test whose assertion goes red when the requirement is
violated**. Naming a nearby test file would be a false claim of coverage, so they
are listed instead.

| Requirement             | Why it is unguarded                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-TA-003              | No test registers a value writer and then calls `addKeyframe` at the current frame. `timelineUndo.test.ts:315-352` exercises the write-back on **undo/redo** only.                                 |
| REQ-TA-006              | `relocateKeyframe`'s "destination occupied" guard is never exercised. `recorder/timelineActions.test.ts:472` calls it, but asserts command coalescing, not the guard.                              |
| REQ-TA-012 (strings)    | Array blending is tested; the string/boolean hold path (`timeline.ts:619-622`) is not.                                                                                                             |
| REQ-TA-013              | Nothing asserts the two easing copies agree, and nothing imports the core copy, so drift is invisible.                                                                                             |
| REQ-TA-020              | `keyframeOnChange.ts` has no test file. Neither the Auto-mode "already animated" filter nor the `animationEnabled` gate is covered.                                                                |
| REQ-TA-021              | **Actively hidden.** `useWorkspaceTimelineBinding.test.ts:11-12` mocks `isDrivingView` and `hasKeyframeAtFrame` to return `false` unconditionally, so the defective branch never runs in any test. |
| REQ-TA-022              | Same mock, same reason.                                                                                                                                                                            |
| REQ-TA-024              | `isDrivingView` has no unit test; its three-term definition is only exercised through the app.                                                                                                     |
| REQ-TA-025              | Neither the `previewHeld` latch nor the scrub gesture lifecycle is tested. `tests/timeline.spec.ts:245` seeks to a frame but asserts only the frame readout.                                       |
| REQ-TA-026              | The advance **arithmetic** is tested (`timeline.test.ts:433-461`); the interval rate, `timeScale` multiplication, the Auto-FPS handoff and the EMA are not.                                        |
| REQ-TA-028              | `getAudioFeatureNormalized` is never called directly by a test, nor are `computeBeats` / `computeOnsetStrengths`. The mapping tests feed hand-built `FrameData` past it.                           |
| REQ-TA-030              | The formula is exercised incidentally by `audioAnalysisMappings.test.ts:66` at `sensitivity: 1`; nothing pins the `sensitivity ≠ 1` behaviour.                                                     |
| REQ-TA-033              | `useAudioReactive.test.ts` contains exactly one test, for suspension. Nothing covers transport-without-reactivity, seek, or the mic gate.                                                          |
| REQ-TA-035 – REQ-TA-038 | `AudioWiringModal.tsx` (1643 lines) has **no unit test and no e2e coverage**. Every behaviour of the wiring editor is unguarded.                                                                   |
