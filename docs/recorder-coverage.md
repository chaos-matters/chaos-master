# Session recorder — what is covered

Companion to `docs/plans/semantic-recorder-plan.md`. That plan says how the
recorder works; this says **which controls it actually captures today**, and
what a recording still misses.

Scanned across the whole app: every `setFlameDescriptor` / `history.replace`
call site in `MainWorkspace.tsx`, every component holding a `HistorySetter`
or `useChangeHistory`, plus the audio, animation-export and timeline paths.
Counts as of this revision: **20 direct `setFlameDescriptor` + 6
`history.replace`** remain in `MainWorkspace.tsx`.

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

| Area            | Controls                                                                                                                                                                                                                                                  | Command                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render settings | gamma, exposure, contrast, vibrancy, highlight power, skip iters, point batch, density estimation, estimator curve, palette mode/phase/speed, background colour, draw mode, colour-init, point-init, depth colour, light power, 3D auto-exposure strength | `flame.setRenderSetting` (dotted path vocabulary)                                                                                                                   |
| Camera          | pan, zoom, pinch, orbit, look, fly, 3D theta/phi/radius/fov/roll/target                                                                                                                                                                                   | `flame.setRenderSetting` on `camera.*` / `camera3D.*`                                                                                                               |
| Transform card  | probability, colour speed, show/hide, delete (incl. last-one-resets), randomise colour                                                                                                                                                                    | `flame.setProbability`, `flame.setColorSpeed`, `flame.setTransformVisible`, `flame.deleteTransform`, `flame.setTransformColor`                                      |
| Variations      | weight, parametric params, show/hide, delete (incl. last-one-resets), dice randomise, quick-picker type change, variation-browser apply                                                                                                                   | `flame.setVariationWeight`, `flame.setVariationParams`, `flame.setVariationVisible`, `flame.deleteVariation`, `flame.setVariation`, `flame.applyVariationSelection` |
| Affine editor   | handle drags (translate, rotate, scale), pre/post, 2D and 3D                                                                                                                                                                                              | `flame.setTransformAffine`                                                                                                                                          |
| Colour editors  | colour wheel drag, colour scrub inputs, dice, reset                                                                                                                                                                                                       | `flame.setTransformColor`                                                                                                                                           |
| Palette         | apply, remove                                                                                                                                                                                                                                             | `flame.applyPalette`, `flame.removePalette`                                                                                                                         |
| Blend / morph   | pick partner, clear partner, blend weight, morph setup                                                                                                                                                                                                    | `flame.setBlendFlame`, `flame.setBlendWeight`, `flame.setupMorph`                                                                                                   |
| Symmetry        | rotational and dihedral, n-fold                                                                                                                                                                                                                           | `flame.applySymmetry`                                                                                                                                               |
| Document        | new flame, open saved flame, load from history, load a bred child, randomise, mutate                                                                                                                                                                      | `flame.load`                                                                                                                                                        |
| Undo / redo     | toolbar buttons and Ctrl+Z / Ctrl+Y                                                                                                                                                                                                                       | `history.undo`, `history.redo`                                                                                                                                      |
| Final transform | set / clear                                                                                                                                                                                                                                               | `flame.setFinalTransform`                                                                                                                                           |

## Not covered yet

Each of these raises the unnamed-write count when used during a recording.

| Area              | Control                                                                           | Why it is still open                                                                                                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Variations        | **"+" add variation** (sidebar)                                                   | Mints a variation id inside the setter; needs the `normalizeArgs` pre-mint treatment. Small.                                                                                                                                                                                               |
| Transforms        | **"+" add transform** (sidebar), custom-variation "Add to flame" (×3 sites)       | Go through `addTransformWithVariation`, which mints ids inside the setter. `flame.addTransform` already does this correctly — these call sites just have not been switched. Small.                                                                                                         |
| Transform list    | duplicate / delete / show-hide in the **affine list editor**                      | `AffineListEditor` still takes the raw `setTransforms`; needs the `setTransformAffine`-style dispatch prop the grid editor got. Medium.                                                                                                                                                    |
| Colours           | **randomise all colours** (dice on the colour card)                               | One call; needs the computed record recorded as args. Small.                                                                                                                                                                                                                               |
| Render settings   | **3D auto-exposure toggle**, manual exposure re-base, **clear background colour** | Compound edits that write several keys at once with conditional logic. Needs either a dedicated command each or `flame.updateRenderSettings`. Small–medium.                                                                                                                                |
| Metadata          | flame **name / author / description** fields                                      | Three sites that lazily create `metadata`. Small.                                                                                                                                                                                                                                          |
| Gallery           | **Apply Random Flame**                                                            | A `history.replace`; switch to `flame.load`. Trivial.                                                                                                                                                                                                                                      |
| Startup           | Home hand-off, shared-URL apply, backup restore                                   | Run before or around a recording rather than during one; the workspace-remount flag already marks a recording that spans one. Low priority.                                                                                                                                                |
| Tours             | `tour:restore` snapshot                                                           | Deliberate — tour machinery, not a user edit.                                                                                                                                                                                                                                              |
| Audio             | audio **wiring** edits (mappings, sources)                                        | Not yet inspected in detail; treat as uncovered.                                                                                                                                                                                                                                           |
| Custom variations | the WGSL/maths **code editor**                                                    | Plan defers this: a code edit does not decompose into small commands. Intended shape is one `variation.setCode` action per committed edit.                                                                                                                                                 |
| Timeline          | every keyframe edit, track add/remove, duration/fps/loop                          | **Structurally out of scope for v1.** The timeline has its own undo stack and is not part of the session format (`initialTracks` is designed but unimplemented). A recorded undo that lands on a timeline edit is detected and reported as unreplayable rather than silently mis-replayed. |

## Two findings worth acting on

**1. Audio-reactive modulation writes per frame through the real setter.**
`utils/useAudioReactive.ts` calls `setFlameDescriptor` on every audio tick.
That pushes a history entry per frame, so it floods undo _and_ would flood a
recording with unnamed writes. `history.setSilently` exists for exactly this
case (its own doc comment names derived, non-user writes) and is what the
animation exporter uses. Recommend switching it — this is an undo bug in its
own right, independent of recording.

**2. Wheel zoom logs one action per tick.** Each wheel notch opens and
commits its own preview, so a long scroll-zoom produces a long run of
`camera.zoom` / `camera.position` steps rather than one. The log is _correct_
— it matches the undo stack exactly — but it is noisy, and it is the main
reason a real session file looks longer than the work felt. Coalescing wheel
ticks would need the camera to hold one preview across a debounce window,
which changes undo granularity, so it is deliberately not done yet.

## Where recordings live

Stopping a recording saves it to IndexedDB (`chaos-master-sessions`, capped
at 100) rather than pushing a file at you. The **Recordings** button opens
the library, where each entry can be replayed, downloaded as `.steps.json`,
or deleted. A storage failure falls back to downloading the file, so a
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

## Practical notes for recording

- Start the recording **before** the work you want captured; the log embeds
  the document as it was at that moment.
- To embed steps in an export, stop the recording first — the export picks up
  the **last finished** session.
- `unnamedWriteCount` in the saved file is the honest measure of that
  session's fidelity. Zero means the replay is exact.
