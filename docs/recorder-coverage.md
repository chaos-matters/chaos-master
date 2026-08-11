# Session recorder — what is covered

Companion to `docs/plans/semantic-recorder-plan.md`. That plan says how the
recorder works; this says **which controls it actually captures today**, and
what a recording still misses.

Scanned across the whole app: every `setFlameDescriptor` / `history.replace`
call site in `MainWorkspace.tsx`, every component holding a `HistorySetter`
or `useChangeHistory`, plus the audio, animation-export and timeline paths.
Counts as of this revision: **4 direct `setFlameDescriptor` + 5
`history.replace`** remain in `MainWorkspace.tsx`, all of them deliberate
(see the second table).

## How to read it

A control is **covered** when it dispatches a registered command, which means
the recorder logs it and a replay reproduces it. An **uncovered** control
still works normally — it just writes the document anonymously, which the
recorder counts as an _unnamed write_ and reports in the pill and in the
saved file's `unnamedWriteCount`. A log with a non-zero count is telling you
it cannot fully reproduce that session.

**Not recorded is not the same as broken.** Nothing below changes how the
editor behaves; it only changes whether a session can replay it.

## Covered

| Area            | Controls                                                                                                                                                                                                                                                                                                                                       | Command                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render settings | 3D auto-exposure toggle and manual re-base, clearing background colour back to Auto, gamma, exposure, contrast, vibrancy, highlight power, skip iters, point batch, density estimation, estimator curve, palette mode/phase/speed, background colour, draw mode, colour-init, point-init, depth colour, light power, 3D auto-exposure strength | `flame.setRenderSetting` (dotted path vocabulary)                                                                                                                   |
| Camera          | pan, zoom, pinch, orbit, look, fly, 3D theta/phi/radius/fov/roll/target                                                                                                                                                                                                                                                                        | `flame.setRenderSetting` on `camera.*` / `camera3D.*`                                                                                                               |
| Transform card  | probability, colour speed, add ("+" and custom-variation "Add to flame"), show/hide, delete (incl. last-one-resets), randomise colour                                                                                                                                                                                                          | `flame.setProbability`, `flame.setColorSpeed`, `flame.setTransformVisible`, `flame.deleteTransform`, `flame.setTransformColor`                                      |
| Variations      | weight, parametric params (whole-object editors too), add ("+"), show/hide, delete (incl. last-one-resets), dice randomise, quick-picker type change, variation-browser apply                                                                                                                                                                  | `flame.setVariationWeight`, `flame.setVariationParams`, `flame.setVariationVisible`, `flame.deleteVariation`, `flame.setVariation`, `flame.applyVariationSelection` |
| Affine editor   | handle drags (translate, rotate, scale), pre/post, 2D and 3D; the affine LIST editor's coefficient scrubs, dice and reset                                                                                                                                                                                                                      | `flame.setTransformAffine`                                                                                                                                          |
| Colour editors  | colour wheel drag, colour scrub inputs, dice, reset, randomise ALL colours                                                                                                                                                                                                                                                                     | `flame.setTransformColor`                                                                                                                                           |
| Palette         | apply, remove                                                                                                                                                                                                                                                                                                                                  | `flame.applyPalette`, `flame.removePalette`                                                                                                                         |
| Blend / morph   | pick partner, clear partner, blend weight, morph setup                                                                                                                                                                                                                                                                                         | `flame.setBlendFlame`, `flame.setBlendWeight`, `flame.setupMorph`                                                                                                   |
| Symmetry        | rotational and dihedral, n-fold; per-transform angle, show/hide and remove in the symmetry list                                                                                                                                                                                                                                                | `flame.applySymmetry`                                                                                                                                               |
| Document        | new flame, open saved flame, load from history, load a bred child, randomise, mutate, apply a random gallery flame; flame name / author / description                                                                                                                                                                                          | `flame.load`                                                                                                                                                        |
| Undo / redo     | toolbar buttons and Ctrl+Z / Ctrl+Y                                                                                                                                                                                                                                                                                                            | `history.undo`, `history.redo`                                                                                                                                      |
| Final transform | set / clear                                                                                                                                                                                                                                                                                                                                    | `flame.setFinalTransform`                                                                                                                                           |
| Timeline        | animation on/off, play, current frame, duration, fps, loop, loop mode, auto-keyframe, add / remove / move keyframe, keyframe value, keyframe interpolation, remove track, clear all, whole-animation load                                                                                                                                      | `timeline.*` (13 commands)                                                                                                                                          |
| Audio wiring    | preset choice, every per-target row (feature, target, sensitivity, range, attack/release), reactivity on/off, file vs microphone                                                                                                                                                                                                               | `audio.setMapping`, `audio.setEnabled`, `audio.setSource`                                                                                                           |
| Viewport        | quality preset, adaptive filter, stochastic filter, fly mode, timeline panel show/hide                                                                                                                                                                                                                                                         | `view.*`                                                                                                                                                            |
| 2D ↔ 3D switch  | the toolbar toggle                                                                                                                                                                                                                                                                                                                             | recorded as `flame.load` + `timeline.loadTimeline` carrying the restored state                                                                                      |

## Not covered yet

Each of these raises the unnamed-write count when used during a recording.

| Area              | Control                                         | Why it is still open                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup           | Home hand-off, shared-URL apply, backup restore | Run before or around a recording rather than during one; the workspace-remount flag already marks a recording that spans one. Low priority.                                                                                                           |
| Tours             | `tour:restore` snapshot                         | Deliberate — tour machinery, not a user edit.                                                                                                                                                                                                         |
| Audio             | the audio **file** itself                       | A buffer cannot ride in a JSON session. The wiring replays; the session records the track's NAME (`initialAudio.trackName`) so a replay can say which file to supply. Replay does not switch reactivity on unless audio is already loaded.            |
| Audio             | per-frame modulation writes                     | See finding 1 below — an undo bug in its own right, not a recorder gap.                                                                                                                                                                               |
| Custom variations | the WGSL/maths **code editor**                  | Plan defers this: a code edit does not decompose into small commands. Intended shape is one `variation.setCode` action per committed edit.                                                                                                            |
| Timeline          | undo/redo _of_ a timeline edit                  | Timeline edits now record and replay, and the session carries `initialTimeline`. What is still refused is a recorded UNDO that lands on the timeline's separate stack: it is detected and reported as unreplayable rather than silently mis-replayed. |
| Curve editor      | bezier handle drags                             | The handles write through the timeline's own path rather than `timeline.setKeyframeValue`; they now RAISE the unnamed-write count (before this pass they were invisible), so a recording says so honestly.                                            |

Four `setFlameDescriptor` and five `history.replace` calls remain in
`MainWorkspace.tsx`, all in the rows above — two of them being the raw
fallback setters the editors keep for preview copies, which never fire in the
workspace itself.

**The timeline is now watched.** Its `pushUndo` reports to the recorder the
same way the flame history's `onEntryPushed` does, so an uncovered timeline
edit raises the unnamed-write count instead of being invisible. Before this
pass a session could claim "0 unnamed writes" while half the app went
unrecorded — the count was a statement about the flame document only.

## Two findings worth acting on

**1. Audio-reactive modulation writes per frame through the real setter.**
`utils/useAudioReactive.ts` calls `setFlameDescriptor` on every audio tick.
That pushes a history entry per frame, so it floods undo _and_ would flood a
recording with unnamed writes. `history.setSilently` exists for exactly this
case (its own doc comment names derived, non-user writes) and is what the
animation exporter uses. Recommend switching it — this is an undo bug in its
own right, independent of recording.

**2. ~~Wheel zoom logs one action per tick.~~ Fixed.** The original diagnosis
here was wrong: `WheelZoomCamera2D`/`3D` do bracket a whole gesture in one
`startPreview`/`commit`, so the undo stack was always one entry per gesture.
The flood came from the recorder's own coalescing, which only matched the
_immediately preceding_ action — and zoom-about-a-point alternates
`camera.zoom` and `camera.position`, so nothing ever matched. Coalescing now
keys anchors by command + target within the gesture, and one scroll-zoom is
one step again.

## Where recordings live

Stopping a recording saves it to IndexedDB (`chaos-master-sessions`, capped
at 100) rather than pushing a file at you. The **Recordings** button opens
the library, where each entry can be replayed, renamed (click the name),
downloaded as `.steps.json`, or deleted. A storage failure falls back to downloading the file, so a
recording is never lost to a full or unavailable database.

Three ways to bring a session back:

- the **Recordings** library,
- **Open steps** (file picker), or
- **dropping** a `.steps.json` on the canvas — which loads no flame, just
  offers the session against whatever is open. Dropping one of our PNGs or
  MP4s loads the flame _and_ offers its session.

Everything that arrives from outside goes through the same validation: an
unknown format version or an initial flame that fails the schema is refused,
and each command validates its own arguments (paths against the schema
vocabulary, affines by exact key set and finiteness). A hostile file can at
worst produce an odd-looking flame; nothing in a session is executable.

## The follow-cam

`docs/channel-content-plan.md` §7 calls this the feature that decides whether
the videos are followable: a dense UI at full size while something small
changes in a corner is the number one reason tool videos lose people.

**Each recorded step carries a hint** — `param:gamma`, `ui:dope-sheet`,
`focus:tx:<id>` — saying _what to look at_, never where. Replay resolves the
hint to an element, dims the rest of the screen, and captions the step. Two
consequences worth stating:

- A session recorded in one window size directs correctly in another, and a
  hint whose control has moved in the markup can be fixed in
  `recorder/focus.ts` rather than being stale in every file ever recorded.
- Because the hint lives in the recording, **a viewer's replay is directed
  too**, not just re-executed. That is the difference from a screen capture.

Hints are derived centrally from the command id and args (`focusHintFor`),
reusing the `data-tour-target` vocabulary the tours already keep honest; a
command can declare its own `focus` when the args do not say what changed.
A hint that resolves to nothing — a collapsed card, a closed panel, or a
camera move whose payoff IS the picture — clears the overlay and shows the
whole canvas.

Toggle it with `◎` in the replay transport. It is a mode, not a behaviour:
the editor never dims itself while you work, only during a replay.

## Authored captions and pacing

`docs/replay-duel-plan.md` §4 asks for three things from the file format.
All three are in:

| Field     | What it does                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------- |
| `note`    | An authored caption that overrides the derived label. "shear it sideways", not "Set gamma to 2.42". |
| `holdMs`  | How long to hold the step, overriding the measured gap. Pacing is authorial, so it is not clamped.  |
| `focus`   | The follow-cam hint above.                                                                          |
| `initial` | Already present — the defined starting state both sides of a duel need.                             |

Edit them with the `✎` on any step in the replay list; **Save captions**
writes the result to the library as a new entry, leaving the raw take alone.

## The dock (recorder UI)

Everything lives in one dock in the bottom-left: the record pill, and above it
the replay and library panels it opens.

- **Show/hide** — the record-dot toggle in the FloatingActions toolbar, or the
  dock's own `×`. Hiding is refused while a recording is running, so the Stop
  button can never disappear mid-take.
- **Collapse (`▾`/`▴`)** — drops the step list and the library, keeping the pill
  and the replay transport. This is the answer to a loaded session covering a
  third of the canvas; playback still works collapsed.
- **Transparency (`◐`)** — a resting-opacity slider plus a "fade" checkbox that
  dims the dock while the canvas is animating or an export is running, so it
  stays out of a screen recording. Hovering or focusing the dock always brings
  it back to full opacity, whatever the slider says.
- **Drag** — grab the dots at the left of the pill. Docked (the default) it
  sits in the bottom bar's flow; dragging switches it to fixed positioning so
  the bar does not keep a hole where it was. Double-click the grip to dock it
  again. Position, opacity, collapsed and visible states all persist.

## Practical notes for recording

- Start the recording **before** the work you want captured; the log embeds
  the document as it was at that moment.
- To embed steps in an export, stop the recording first — the export picks up
  the **last finished** session.
- `unnamedWriteCount` in the saved file is the honest measure of that
  session's fidelity. Zero means the replay is exact.

## Housekeeping worth knowing about

Three source files contained a **literal NUL byte** — two of them using one as
a string-join separator (`join('\0')` written as the raw character), one in a
doc comment. Git treats such a file as binary: no diff, no blame, no merge.
All three now use the `\0` escape, which is the same byte at runtime and
plain text on disk (`recorder/recorder.ts`, `utils/timeline.ts`,
`utils/flameImport.ts`).
