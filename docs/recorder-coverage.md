# Session recorder — what is covered

Companion to `docs/plans/semantic-recorder-plan.md`. That plan says how the
recorder works; this says **which controls it actually captures today**, and
what a recording still misses.

Coverage includes the flame document, the timeline's separate history, audio
wiring, viewport state and cross-system undo/redo. Direct setters still exist
for derived animation/export writes and preview copies; those are deliberately
not user actions.

## How to read it

A control is **covered** when it dispatches a registered command or emits a
validated result snapshot, which means the recorder logs it and a replay
reproduces its authored workspace output. An **uncovered document or timeline
write** still works normally — it writes anonymously, which the recorder
counts as an _unnamed write_ and reports in the pill and in the saved file's
`unnamedWriteCount`. A log with a non-zero count is telling you it cannot fully
reproduce that session.

Some state lives outside both histories, so the unnamed-write detector cannot
see it. Those gaps are called out explicitly below rather than being hidden
behind a misleading zero. The recorder also does not try to be a clickstream:
opening a modal, changing a search filter, or browsing candidates is not a
step unless it changes authored workspace/output state.

This inventory is about authored workspace/output changes. Navigation-only
gestures — scrolling, hover, selecting or collapsing a card, switching an
editor tab, and opening a picker without choosing anything — are presentation,
not session steps. Follow-cam reconstructs the owning transform, affine,
colour, timeline, or audio surface. Stable controls use exact anchors; result
snapshots and broader workflows carry a validated semantic origin that points
to their safe owning surface when no single persistent control exists.

**Not recorded is not the same as broken.** Nothing below changes how the
editor behaves; it only changes whether a session can replay it.

## Covered

| Area                  | Controls                                                                                                                                                                                                                                                                                                                                       | Command / replay value                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render settings       | 3D auto-exposure toggle and manual re-base, clearing background colour back to Auto, gamma, exposure, contrast, vibrancy, highlight power, skip iters, point batch, density estimation, estimator curve, palette mode/phase/speed, background colour, draw mode, colour-init, point-init, depth colour, light power, 3D auto-exposure strength | `flame.setRenderSetting` (dotted path vocabulary)                                                                                                                   |
| Camera                | pan, zoom, pinch, orbit, look, fly, 3D theta/phi/radius/fov/roll/target                                                                                                                                                                                                                                                                        | `flame.setRenderSetting` on `camera.*` / `camera3D.*`                                                                                                               |
| Transform card        | probability, colour speed, add ("+" and custom-variation "Add to flame"), show/hide, delete (including last-one-resets), randomise colour                                                                                                                                                                                                      | `flame.setProbability`, `flame.setColorSpeed`, `flame.setTransformVisible`, `flame.deleteTransform`, `flame.setTransformColor`                                      |
| Variations            | weight, parametric params (whole-object editors too), add ("+"), show/hide, delete (including last-one-resets), dice randomise, quick-picker type change, variation-browser apply                                                                                                                                                              | `flame.setVariationWeight`, `flame.setVariationParams`, `flame.setVariationVisible`, `flame.deleteVariation`, `flame.setVariation`, `flame.applyVariationSelection` |
| Affine editor         | handle drags (translate, rotate, scale), pre/post, 2D and 3D; LIST coefficient scrubs, dice and reset                                                                                                                                                                                                                                          | `flame.setAffine`, `flame.setTransformAffine`                                                                                                                       |
| Colour editors        | colour wheel drag, colour scrub inputs, dice, reset, randomise ALL colours                                                                                                                                                                                                                                                                     | `flame.setTransformColor`, `flame.setAllTransformColors`                                                                                                            |
| Palette               | apply, remove; natural-colour restore provenance across load, undo/redo and replay forks                                                                                                                                                                                                                                                       | `flame.applyPalette`, `flame.removePalette`, plus the bounded optional session/history snapshot                                                                     |
| Blend / morph         | pick partner, clear partner, blend weight, morph setup                                                                                                                                                                                                                                                                                         | `flame.setBlendFlame`, `flame.setBlendWeight`, `flame.setupMorph`                                                                                                   |
| Symmetry              | rotational and dihedral, n-fold; per-transform angle, show/hide and remove in the symmetry list                                                                                                                                                                                                                                                | `flame.applySymmetry`, `flame.setTransformAffine`, `flame.setTransformVisible`, `flame.removeTransform`                                                             |
| Document / generators | new flame; gallery, file, history, FLAM3, migration and logo-generator loads; randomise, mutate and random-gallery apply; chosen breed, evolve, simulator and ancestry results                                                                                                                                                                 | the exact resulting descriptor in `flame.load`                                                                                                                      |
| Metadata              | flame name, author and description, including the atomic patch committed from Export                                                                                                                                                                                                                                                           | `flame.setMetadata`                                                                                                                                                 |
| Undo / redo           | toolbar buttons and Ctrl+Z / Ctrl+Y                                                                                                                                                                                                                                                                                                            | the resulting `flame.load` or `recorder.restoreWorkspaceSnapshot`, so replay never depends on the viewer's private history stacks                                   |
| Final transform       | set/replace, handle drags, LIST coefficient scrubs and dice                                                                                                                                                                                                                                                                                    | `flame.setFinalTransform`, `flame.setFinalAffine`                                                                                                                   |
| Timeline              | animation on/off, current frame, duration, fps/auto-fps, playback scale, loop/mode, auto-keyframe, add/remove/move/retime keyframes, values/interpolation, remove/clear tracks, curve edits, presets, random/smart animation, morph tracks and whole-animation loads                                                                           | atomic `timeline.*` commands; compound and randomized edits become one value-pinned `timeline.loadTimeline` snapshot                                                |
| Audio wiring          | preset choice, every per-target row (feature, target, sensitivity, range, attack/release), reactivity on/off, file vs microphone, upload/clear resource identity                                                                                                                                                                               | identity-aware full snapshots carried by `audio.setMapping`, `audio.setEnabled`, `audio.setSource`, and `audio.applySnapshot`                                       |
| Sonification          | enabled state, model, scale, voices, timing, spatial and effects controls                                                                                                                                                                                                                                                                      | `sonification.setEnabled`, `sonification.setConfig`, and a bounded versioned snapshot                                                                               |
| Viewport              | quality preset, live canvas resolution, adaptive filter, stochastic filter, fly mode, timeline panel show/hide                                                                                                                                                                                                                                 | `view.*`                                                                                                                                                            |
| 2D ↔ 3D switch        | the toolbar toggle                                                                                                                                                                                                                                                                                                                             | `flame.load` + `timeline.loadTimeline` carrying the restored state                                                                                                  |

### Exact output, condensed intent

Several rich workflows deliberately record their **finished value**, not every
internal choice that produced it:

- **Randomise, Mutate, history/candidate apply and originated file/gallery
  loads** carry the complete resulting flame in `flame.load`, plus a bounded
  origin that restores the initiating button or picker. Migration and generated
  logo loads remain exact value-pinned actions with their existing labels, but
  do not yet carry a dedicated source origin. Replay never rerolls any of them.
- **Breed, Evolve, Population Simulator and Ancestry** carry the chosen child
  in `flame.load` and focus the genetics entry point. Browsing generations,
  changing genetics settings and comparing candidates inside those tools are
  not represented as recipe steps.
- **Random Animate, Smart Animate, Colors and timeline presets** carry the
  completed tracks in one `timeline.loadTimeline` snapshot. Replay never
  repeats `Math.random`; the validated origin preserves the initiating button,
  and Random Animate also carries its chosen preset ids as bounded caption
  detail.
- **Sonification** carries a bounded, independently versioned snapshot of the
  enabled state plus model, scale, voices, timing, space and effects. Each
  authored panel control is a semantic command; replay Undo/Redo restores the
  complete snapshot. AudioContext/device lifetime and the local “keep playing
  when closed” preference remain runtime-only.

An explicit recorded **Enable** is output intent, so replay reveals the
Sonification panel with its stop control; otherwise the app's hidden-audio
safety effect would immediately silence it. Replay Undo/Redo restores the
captured panel presentation and authored snapshot. With keep-playing off, a
user panel close or panel switch records **Disable** before hiding the panel;
with it on, the authored output remains enabled and only presentation changes.
If the user later changes that unrecorded preference, the current local safety
preference still wins when restoring a hidden panel. Closing the full editor
sidebar (including its mobile drawer) follows the same rule: the user-owned
hide records **Disable** first, while replay-owned presentation changes defer
the audio engine until their final authored state is known.

This is output-exact and compact, but it intentionally does not become a full
clickstream of generator/genetics exploration before a result is applied.

## Authored state not represented yet

The **Signal** column says whether the current recorder can warn about the gap.
Selecting a Home flame while a take is active is blocked with a toast; the
handoff is never allowed to replace the document underneath that recording.

| Area              | State / action                                      | Signal                           | Why it is still open                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom variations | committed WGSL/maths code                           | none for the code blob           | A code edit should not decompose into keystrokes. A portable take needs bounded starting definitions as well as semantic committed revisions, preflight compilation, transient registry state, collision handling and replay Undo/Redo restoration. |
| Startup           | shared-URL apply, backup restore                    | unnamed-write or remount warning | These normally run before a recording. A recording that crosses one is marked rather than pretending continuity.                                                                                                                                    |
| Tours             | `tour:restore` snapshot                             | unreplayable marker              | Deliberate — tour machinery, not a user-authored edit.                                                                                                                                                                                              |
| Audio             | the audio **file** itself                           | required-track metadata          | A buffer cannot ride in a JSON session. Wiring and required track name replay, but reactivity only enables when the matching file is already loaded (or an existing live microphone analyser is available).                                         |
| Audio             | playback clock and per-frame modulation             | one deduplicated warning         | Play/pause/seek and derived 30 fps writes are external runtime state. They stay out of undo and do not flood the log; audio bytes and playback position are not embedded.                                                                           |
| Timeline          | wall-clock Play/Pause and loaded-animation autoplay | unreplayable transport marker    | Playback timing is hardware-driven state, not an authored edit. Replay pauses a running timeline, records timeline data and playhead state, and never restarts wall-clock playback during undo.                                                     |

**The timeline is now watched.** Its `pushUndo` reports to the recorder the
same way the flame history's `onEntryPushed` does, so an uncovered timeline
edit raises the unnamed-write count instead of being invisible. Before this
pass a session could claim "0 unnamed writes" while half the app went
unrecorded — the count was a statement about the flame document only.

## Deliberate session boundaries

These are not missing output mutations and are intentionally outside the v1
artifact:

- modal open/close, hover previews, card/tab selection, searches and filters;
- randomizer ranges/preferences and genetics exploration before a result is
  applied (the applied result itself is exact);
- custom-palette-library create/edit/delete (the applied palette data is
  embedded in the flame action);
- timeline/audio transport clocks, analyzer progress and microphone
  permission/resource acquisition;
- export, download, clipboard, share and queue side effects. Metadata committed
  back to the flame and generated artwork loaded back into the editor are
  recorded. Opening Export is the deliberate modal exception: toolbar and
  keyboard both dispatch `export.png`; the external export remains excluded.

## Follow-up completeness audit

The 2026-08-15 follow-up landed bounded semantic origins for pinned flame and
timeline results; exact anchors and preparation for generator, timeline,
view, blend/morph, symmetry and transform-visibility controls; audio-panel
preparation; toolbar Render parity with the keyboard command; pointer-id
filtering for timeline drags; and a GPU-free static UI wiring ratchet. Replay
preparation reveals the Randomizer without authoring a sonification stop, and
reopens a collapsed symmetry card before targeting its controls.

The deliberate remaining work is:

1. Design portable custom-variation capture as a separate trust-boundary
   project: bounded starting definitions, semantic committed revisions,
   preflight compilation, transient registration/collision handling and
   replay Undo/Redo restoration. A single `variation.setCode` action is not
   sufficient when a take starts with an existing custom variation.
2. Add dedicated semantic origins for migration and generated-logo loads.
3. Collapse companion presentation commands from one-click workflows where
   they produce redundant adjacent captions.
4. Add a representative Playwright recording journey that clicks the real UI
   and asserts `unnamedWriteCount === 0`. The static ratchet protects known
   architecture, but cannot prove every new runtime control.

### Recommended sequence after recorder accessibility polish

This order is intentionally saved here rather than in a personal dotfile so
the reasoning travels with the recorder implementation:

1. **Runtime confidence:** add the representative Playwright journey above.
   Prefer GPU-independent controls in CI and keep the fuller WebGPU journey as
   a documented local test if the software-GPU runner remains unreliable.
2. **Library scale:** split IndexedDB summary metadata from session payloads.
   Listing Recordings should not hydrate and validate up to 100 payloads of up
   to 8 MiB each; load one payload only for Replay or Download and migrate the
   current rows in place.
3. **Replay narrative:** combine redundant companion presentation commands
   from Random/Smart Animate, Morph, animation loads and dimension switches;
   add the small migration/generated-logo origins in the same semantic-polish
   pass.
4. **Custom variations:** complete the trust-boundary design above before
   putting executable WGSL into a portable session. Until then, the loader's
   “external sessions are data, never code” guarantee remains true.
5. **Architecture, protected by the browser journey:** extract typed
   capture/apply ports for flame, timeline, audio, sonification, view and
   replay presentation, then move the live replay transaction out of
   `MainWorkspace` into a workspace replay controller. Preserve the current
   restoration ordering rather than attempting one large rewrite.
6. **Before format v2:** add golden released `.steps.json` fixtures and a
   session/action migration dispatcher. The current v1 schema is intentionally
   strict; the migration seam should land before the first breaking command
   or artifact change.

Smaller hardening can ride with the nearest item: reject duplicate command ids
in development/tests, bound unnamed-write diagnostics to a counter plus a
small ring, cache immutable replay preflight results for repeated seeks, guard
unsaved caption drafts on Close, and make recording discard/library deletion
recoverable rather than immediate. The next recorder-chrome edit should also
centralize the repeated panel material, button and responsive target tokens so
one surface cannot silently miss a density or accessibility fix.

## Resolved performance and fidelity findings

**1. Audio-reactive modulation no longer writes 30 history entries per
second.** It now uses `history.setSilently`, invalidates stale export-session
metadata, and raises at most one unreplayable marker per take. Long audio runs
therefore keep undo and recorder memory bounded.

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

Everything that arrives from outside is data, never code. The loader caps raw
and decompressed session sizes, action/argument counts, nesting and string
budgets, validates the initial flame/timeline/audio schemas, and preflights all
commands before loading the session's starting state. Unknown, wall-clock or
invalid actions abort without touching the workspace. High-risk structural
commands (load, symmetry, randomize/mutate and timeline/audio snapshots) add
their own exact shape and allocation bounds.

## The follow-cam

`docs/channel-content-plan.md` §7 calls this the feature that decides whether
the videos are followable: a dense UI at full size while something small
changes in a corner is the number one reason tool videos lose people.

**Each recorded step carries a hint** — `param:gamma`, `ui:dope-sheet`,
`focus:tx:<id>` — saying _what to look at_, never where. Replay resolves the
hint to an element, keeps the IFS canvas fully luminous, quiets the surrounding
chrome, and captions the step. Two consequences worth stating:

- A session recorded in one window size directs correctly in another, and a
  hint whose control has moved in the markup can be fixed in
  `recorder/focus.ts` rather than being stale in every file ever recorded.
- Stable transform and variation identities keep repeated controls distinct;
  replay opens the relevant sidebar/timeline, expands the owning transform,
  selects it, and switches the affine or colour surface and mode before
  resolving the exact target.
- Because the hint lives in the recording, **a viewer's replay is directed
  too**, not just re-executed. That is the difference from a screen capture.

Hints are derived centrally from the command id and args (`focusHintFor`),
reusing the `data-tour-target` vocabulary the tours already keep honest; a
command can declare its own `focus` when the args do not say what changed.
A hint that resolves to nothing still leaves the flame unobscured; camera
moves therefore show their payoff directly rather than dimming the artwork.

When a resolved control is outside a scrollable sidebar, follow-cam reveals it
with `scrollIntoView({ block: 'nearest' })` before positioning the spotlight.
The focus button in the replay transport toggles this mode; the editor never
dims itself while you work, only during a replay.

## Authored captions and pacing

`docs/replay-duel-plan.md` §4 asks for three things from the file format.
All three are in:

| Field     | What it does                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------- |
| `note`    | An authored caption that overrides the derived label. "shear it sideways", not "Set gamma to 2.42". |
| `holdMs`  | How long to hold the step, overriding the measured gap (validated up to ten minutes).               |
| `focus`   | The follow-cam hint above.                                                                          |
| `initial` | Already present — the defined starting state both sides of a duel need.                             |

Edit them with the pencil button on any step in the replay list; **Save captions**
writes the result to the library as a new entry, leaving the raw take alone.

## The dock (recorder UI)

Everything lives in one dock in the bottom-left: the record pill, and above it
the replay and library panels it opens.

- **Show/hide** — the record-dot toggle in the FloatingActions toolbar, or the
  dock's close button. Hiding is refused while a recording is running, so the Stop
  button can never disappear mid-take.
- **Collapse** — the chevron button drops the step list and the library, keeping the pill
  and the replay transport. This is the answer to a loaded session covering a
  third of the canvas; playback still works collapsed.
- **Transparency** — the half-circle button opens a resting-opacity slider plus a "fade" checkbox that
  dims the dock while the canvas is animating, exporting, or replaying, so it
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
- `unnamedWriteCount` in the saved file is the honest measure of untracked
  flame/timeline writes. Zero means every watched document edit was
  represented; state explicitly listed under “Authored state not represented
  yet” remains outside that detector, and a matching external audio source is
  still required when the take used one.

## Housekeeping worth knowing about

Three source files contained a **literal NUL byte** — two of them using one as
a string-join separator (`join('\0')` written as the raw character), one in a
doc comment. Git treats such a file as binary: no diff, no blame, no merge.
All three now use the `\0` escape, which is the same byte at runtime and
plain text on disk (`recorder/recorder.ts`, `utils/timeline.ts`,
`utils/flameImport.ts`).
