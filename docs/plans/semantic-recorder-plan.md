# Semantic action recorder — every step as a named, replayable command

Status: **in progress**. M1 (recorder core and `.steps.json`), M2
(deterministic command args), M4 (transport, step list, seeking and one-step
undo) and M5 (sessions embedded in PNG/MP4 exports) are implemented. M3 now
covers the main flame, camera, timeline (including curve edits), audio-reactive
wiring, sonification, viewport and undo/redo surfaces. The remaining authored-
state gap is committed custom-variation code. That gap requires bounded
starting definitions plus committed changes, transient session-owned
registration and an explicit compiled-code trust boundary; a single edit
action would not be enough for a take that starts with a custom variation.
Value-pinned workflows now keep
a validated semantic origin and safe owning-surface focus, with exact anchors
for stable controls. A GPU-free static UI coverage ratchet protects the main
call paths; a representative browser journey remains incremental work. Audited
2026-08-16; see
`docs/recorder-coverage.md` for the audited matrix and follow-up list.

M6 turns a finished take into publishable replay video. M6a is a deterministic,
square artwork MP4 rendered from the semantic session with captions, step
progress and Lumen Apeiron identity burned into the frames. M6b adds a second,
real-time Full interface mode that records the actual app replay, including the
flame, panels, timeline and follow-cam spotlight. These are separate from
embedding the session inside an ordinary animation export; both resulting
videos visibly show the creation sequence.

## The ask

Press **Record** in the app, create a flame, press **Stop** — and get, alongside
the exported flame/PNG/MP4, a step log of everything that was done: a list of
semantic actions ("add transform", "set swirl weight to 0.3", "apply palette
41") with timestamps. The log must be:

1. **replayable** — load it in the app and watch the flame being rebuilt,
   step by step, or jump to any step;
2. **scriptable** — the same log format doubles as a macro/automation language
   (the "Scripting: No" cell in the roadmap's Apophysis comparison);
3. **machine-readable** — a stable command vocabulary + addressable UI is the
   substrate for driving the app from tests, an API/MCP server, or a model;
4. **shareable** — published next to a gallery entry so a viewer can replay
   the exact creation in their own browser.

This is wanted independent of the content/marketing series, but the series is
the forcing function: every recorded session should produce a publishable
recipe.

## First, the thing that is easy to get wrong

**This is not a new event system, and it must not record patches or DOM
events.** Three systems in the codebase already cover most of the ground, and
the design is about closing one gap between them:

- `packages/app/src/commands/` is a working command registry
  (`flame.addTransform`, `flame.setVariationWeight`, `camera.zoomTo`, …),
  each `execute(ctx, ...args)` taking its `CommandContext` **as an argument**,
  so the same command can run against the live workspace or a sandbox.
- `packages/app/src/components/Home/portalScript.ts` already **replays**
  registered commands headlessly against an isolated context. The replay
  engine exists; there is no recorder.
- `packages/app/src/utils/createStoreHistory.ts` is the **single choke point**
  for every flame-document write (~88 call sites, all funneling through one
  `HistorySetter`), already patch-based with an optional `description` label.

The gap: **the UI does not route through the registry.** `MainWorkspace.tsx`
holds ~69 direct `setFlameDescriptor(closure)` calls, and the prop adapters
that hand narrowed setters to `AffineEditor`/`FlameColorEditor` etc. drop even
the `description` (only ~10 distinct description strings exist today). So the
document sees anonymous closures, not intents.

Why not just record the patches the history already produces? Because patches
are _effects_, not _intents_. A patch log replays only against the exact same
starting state, can't be edited or parameterized, means nothing to a script
author or a model, and breaks the moment the schema migrates. The recorder
must capture `("flame.setVariationWeight", [tid, "swirl", 0.3])`, not
`{ path: ["transforms", "abc-123", "variations", 2, "weight"], value: 0.3 }`.

The patches still matter — as a **coverage detector**, not as the recording
(see Milestone 1).

## What already exists (substrate inventory)

| Need                          | Already there                                                                        | Where                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Command vocabulary + dispatch | `executeCommand(id, ctx, ...args)` plus guarded `executeReplayCommand`               | `src/commands/registry.ts`, `builtins/`               |
| Headless replay precedent     | `createPortalDriver`, isolated `CommandContext`, DOM/GPU-free                        | `src/components/Home/portalScript.ts`                 |
| Declarative step sequences    | Tour system emits commands, has `snapshotFlame`/`restoreFlame`                       | `src/tours/`, `components/SpotlightTour/tourTypes.ts` |
| Mutation choke point          | `HistorySetter` with `description`, patch pairs, journal `seq`                       | `src/utils/createStoreHistory.ts`                     |
| Deterministic randomness      | `createSeededRandomSource`, `generateSeededRandomFlame` (seed + ID canonicalization) | `src/flame/randomize.ts`                              |
| Gesture coalescing            | `startPreview`/`commit` collapse drags into one history entry                        | `createStoreHistory.ts`                               |
| Cross-system undo ordering    | `undoJournal.ts` seq stamps + `createUndoRouter`                                     | `src/utils/undoJournal.ts`, `undoRouting.ts`          |
| Shareable artifact embedding  | zlib `zTXt` chunk in PNG (`FlameJson`), MP4 metadata                                 | `src/utils/flameInPng.ts`, `flameInMp4.ts`            |
| Keyboard → command binding    | `useShortcutManager` builds bindings from command metadata                           | `src/shortcuts/useShortcutManager.ts`                 |

## Design

### The recorded artifact

A **session log**, versioned and valibot-validated like everything else:

```ts
type RecordedSession = {
  version: 1
  app: { version: string; flameSchemaVersion: string }
  createdAt: string
  initial: FlameDescriptor // complete starting document
  initialTimeline?: TimelineSnapshot
  initialAudio?: AudioWiringSnapshot
  initialSonification?: SonificationSnapshot
  initialView?: SessionViewSnapshot
  actions: RecordedAction[]
  unnamedWriteCount: number
}

type RecordedAction = {
  t: number // ms since session start (performance.now offset) — video sync
  id: string // registered command id, e.g. "flame.setVariationWeight"
  args: unknown[] // JSON-serializable, validated per-command
  label?: string // human-readable, derived from command metadata at record time
  focus?: string // semantic follow-cam target
  note?: string // authored caption override
  holdMs?: number // authored playback pacing override
}
```

Decisions baked into this shape:

- **Initial state is embedded, not referenced.** A log that replays from
  "whatever was open" is not reproducible. The complete descriptor is cloned
  so hidden transforms and document metadata survive the round trip.
- **Commit-level granularity.** A slider drag records one action with the
  final value (piggybacking on the existing `startPreview`/`commit`
  coalescing), not 200 intermediate values. The `t` timestamp of the commit
  preserves video-sync fidelity well enough; per-frame gesture curves are a
  non-goal for v1.
- **Undo/redo are recorded as resulting data snapshots.** Live history still
  routes through `history.undo` / `history.redo`, but the recorder replaces
  that transient command with `flame.load` or
  `recorder.restoreWorkspaceSnapshot`. Replays never inspect or mutate the
  viewer's private flame/timeline stacks.
- Schema + serialization live in a new `packages/app/src/recorder/` module
  (`schema.ts`, `recorder.ts`, `player.ts`, `replay.ts`), unit-testable
  without DOM or GPU, following `portalScript.ts`'s discipline.

### Recording

`createSessionRecorder()` hooks exactly two seams:

1. **`executeCommand`** in `src/commands/registry.ts` — one `if (recording)`
   line. Everything already command-routed is recorded for free.
2. **`createStoreHistory`'s entry-push path** (`set` and `replace`, i.e.
   wherever `addToStack` receives a new `HistoryItem`) — _not_ to record, but
   to detect writes that did **not** come from a command. During recording,
   such a write is logged as a diagnostic `unnamed` event with its
   `description` (if any) and a stack-trace-derived hint in dev builds.

A third path exists for things the log cannot reproduce even though no
anonymous write happened — an undo reverting an edit made before recording
started, wall-clock transport, live audio modulation, or a workspace remount
that swapped the document underneath an active recording. These retract the action
just logged (if any) and count an unnamed write instead, so the marker rises
rather than the log asserting a fidelity it lost.

Seam 2 is the **coverage ratchet**. Recording is correct when a session
produces zero `unnamed` events. Until then, every unnamed event is a
work-item pointing at a `MainWorkspace` handler that needs promoting to a
command. `DEBUG_MODE` (`src/defaults.ts`) surfaces the count in the console
store; a Playwright test can drive the main editing surfaces and assert the
unnamed count stays at the ratcheted floor, so coverage never regresses.

What recording explicitly ignores:

- **`setSilently` writes.** Animation export drives per-frame state through
  `history.setSilently` (`utils/animationExport.ts` via `MainWorkspace`), and
  3D auto-exposure uses it for derived follower writes. These are not user
  intent. The silent path stays invisible to the recorder — which falls out
  naturally from hooking the entry-push path rather than the setter itself.
- **Timeline playback.** `setFlameValue` (`MainWorkspace.tsx:3029`) also
  writes silently during scrubbing/playback; recorded sessions capture
  timeline _edits_ (already commands: `timeline.addKeyframe`,
  `timeline.setCurrentFrame`, …), never playback frames.
- **Audio-reactive modulation.** `useAudioReactive` writes continuously via
  `history.setSilently`, so it does not flood undo. The recorder captures the
  wiring and records one deduplicated fidelity warning per take when live
  modulation runs, because the audio bytes and playback position are external.

### Replay

`createSessionPlayer(session, target)` — the `portalScript.ts` pattern,
generalized:

- **Into the live workspace:** replay first preflights every action through
  `preflightReplayCommand`, then loads the captured flame/timeline/audio/view
  state and calls `executeReplayCommand` with canonical args. It never reruns
  live normalizers, which may mint IDs. The full run is one atomic history
  entry with side-state undo/redo effects; a rejected action stops the run and
  later steps never execute.
- **Step list UI:** a panel listing `label`s with the current position;
  clicking step _N_ replays `initial → N` instantly. Scrub-back is replay
  from the start, not undo — the log is the source of truth.
- **Guards:** recording and replay are mutually exclusive at both UI and
  player boundaries. Replay suppresses recording hooks, pauses live timeline
  transport, isolates temporary timeline history, and commits only the final
  combined state so the user can take over at any step.
- **Sandboxed replay** (thumbnails, gallery previews) reuses the isolated-
  context recipe and its hazard checklist from the `portalScript.ts` header
  comment (module-global `registerRedoClearer`, `persistentSignal`
  localStorage keys, the autosave→`recentFlames` poll, document-level
  shortcut bindings). Not v1; the API shape just has to keep `ctx` injectable,
  which it already does.

### Determinism

Three determinism blockers shaped the implementation:

1. **Positional transform addressing.** `builtins/flame.ts` resolves
   transforms by index (`getTransformKey(transforms, index)`). Recorded args
   must use `TransformId`/`VariationId` (the branded UUIDs from
   `flame/transformFunction.ts`). Commands accept id-or-index during a
   transition; the recorder always writes ids.
2. **ID minting inside setters.** `flame.addTransform` calls
   `generateTransformId()` inside the mutation. Replay would mint different
   ids and every later id-addressed action would dangle. Fix: the command
   generates the id _before_ the setter and it becomes part of the recorded
   args — `flame.addTransform(id?)` mints only when absent. (This also
   resolves the "setter must be pure, it runs once under
   `produceWithPatches`" rule documented in `createStoreHistory`.)
3. **Unseeded randomness.** `randomize.ts` already has the whole mechanism —
   `createSeededRandomSource`, module-private `withRandomSource`, and
   `generateSeededRandomFlame`'s seed + post-hoc ID canonicalization. Export
   `withRandomSource` (or add seeded wrappers) and give the random commands
   (`randomize`, `mutate`, breed, random-animation presets) a `seed` argument
   that the recorder fills from the session seed stream. Direct `Math.random`
   call sites in flame-affecting paths (`PopulationSimulator`,
   `Timeline/presets.ts`, `MainWorkspace` randomize-animation) migrate to
   `random01()` as those features get command coverage.

Determinism is verifiable mechanically: record a session, replay it, assert
`condenseFlameDescriptor(recorded) deepEquals condenseFlameDescriptor(replayed)`.
That round-trip is the recorder's core test and belongs in vitest, not e2e.

### Command coverage (the real work)

Two things learned while starting this milestone, both of which changed the
shape of the work:

**Gestures had to be solved before any control could be converted.** A slider
drag fires `onInput` continuously, and the control — not the handler — opens
a preview and commits it (`Slider.tsx`), so the drag is one undo step whose
commit happens _outside_ any command. Converting a slider naively logs a
hundred actions and still leaves an unnamed write. So the recorder learned
about gestures: `createStoreHistory` reports `onPreviewStarted` and marks
pushed entries `fromPreview`, a gesture whose writes came from commands is
counted as accounted-for, and commands carry an optional `coalesceKey` whose
repeats fold into one action holding the final value. Folding is bounded by
entry pushes, so two drags of one control stay two actions against two undo
steps — otherwise a later recorded undo would revert too much.

**Render settings get one command, not twenty.** `flame.setRenderSetting(path,
value)` addresses them by the parameter path the controls already declare as
`data-parameter-path` and the timeline already uses for keyframes. For these,
the path IS the intent, and a new setting becomes recordable without a new
command. Paths and value shapes are validated against the schema defaults —
the plan's "per-command arg schemas" idea, in the one place it earns its keep,
since hand-edited logs are a supported workflow. Structural edits keep named
commands, where the intent is more than "this field took this value". The
existing single-purpose setters (`flame.setGamma` and friends) stay for
scripts and tours.

The registry's commands still cover only part of real user actions. The
labeled-but-anonymous and fully anonymous mutations in `MainWorkspace.tsx`
need promoting, roughly in order of how often they appear in an editing
session (**render settings, item 6, are done**):

1. **Prop-adapter mutations** — affine and colour editors are routed through
   stable transform/variation IDs; preview-only copies retain raw setters.
2. **Named handlers** — palette, symmetry, morph, seeded generate/mutate,
   breeding loads, applied randomizer results, document render-setting
   controls and whole-document loads are covered. Randomizer ranges and
   browsing preferences remain deliberately outside the recipe.
3. **Camera writes** — **done**. `setFlameZoom`, `setFlamePosition` and the
   `makeCamera3DSetter` family keep Solid's Setter contract but resolve the
   updater against current state and dispatch a concrete value, so the
   `flame.setRenderSetting` path vocabulary (now dotted: `camera.zoom`,
   `camera3D.theta`) carries it. Every camera gesture is already bracketed by
   `startPreview`/`commit` in `WheelZoomCamera2D`/`3D`, so a whole pan or
   orbit folds into one recorded step.
4. **Document lifecycle** — **mostly done**: `flame.load` carries the
   descriptor itself, so a mid-session open, history load or bred child
   replays without looking anything up. A Home hand-off is rejected while a
   take is active, so it cannot replace the recorded workspace underneath the
   recorder. Mount-time shared-URL/restore paths still use direct replacement;
   the unnamed-write or workspace-remount marker covers a recording that
   somehow crosses one.
5. **Blend and audio wiring** — covered. Committed custom variation code is
   still open. It should capture bounded starting definitions and one semantic
   source-revision action per commit, never a stream of keystrokes. Imported
   definitions need preflight compilation, transient/session-owned registry
   state, collision handling and replay Undo/Redo restoration before this can
   ship safely.
6. **Render settings** — ~~the sliders and mode pickers writing
   `renderSettings.*`~~ **done**: 18 controls route through
   `flame.setRenderSetting`. `blendWeight` deliberately stays on its own
   handler — it is not in the schema's render-settings defaults, so it is not
   part of that path vocabulary.

UI-only state (sidebar tabs, modals, theme) is _not_ flame mutation and is
recorded only where it already has commands (`sidebar.open`/`close`) — useful
for video/tutorial sync, ignored by the condensed recipe.

This milestone is also where element addressability lands: the repo has
essentially no `data-testid` convention (16 occurrences, nearly all in
Timeline). Controls that carry a parameter path are already addressable by it
(`data-parameter-path`, which is also the command's argument); the ones that
need a name are the structural actions — add/remove/duplicate transform,
apply palette, symmetry — which gain `data-command` as they are rewired. That
serves Playwright, the recorder's dev overlay, and any future model-driven
operation without inventing a parallel naming scheme.

**The main UI wiring now has a GPU-free CI ratchet.** It statically checks the
representative workspace call paths that must dispatch commands or pinned
snapshots. It cannot prove runtime behavior or notice every novel control, so
a focused Playwright journey should still record representative edits and
assert `unnamedWriteCount === 0`; until then the live counter and saved marker
remain the honest runtime coverage signal.

### Persistence and sharing

- `.steps.json` download/upload alongside the existing export surfaces, and a
  bundle option in `ExportPngDialog` (flame + PNG + steps).
- **Embed the session in exported PNGs** as a second `zTXt` chunk
  (`FlameSteps`) next to `FlameJson` — `flameInPng.ts` already has the chunk
  machinery. A dropped PNG then offers "Load flame" _and_ "Replay creation".
  Same trick for MP4 via `flameInMp4.ts`'s metadata payload.
- Recent-flames deliberately does NOT carry sessions. It holds up to 150
  entries in localStorage, and a session (an embedded initial flame plus its
  actions) per entry would risk the quota — silently failing the write that
  keeps the user's recent work. The PNG/MP4 chunks and the `.steps.json`
  download already cover sharing; persisting an in-progress recording across
  a reload, if wanted, should store the ONE active session, not 150.
- Gallery/endpoint publishing is out of scope here — it composes on top
  (the gallery-admin plan's D1/R2 pipeline gains one more file per item).

### Publishable replay video

M6 is split into modes because an offline semantic composition and a faithful
browser-interface recording have fundamentally different guarantees.

#### M6a — Artwork composition

The replay panel can queue a **1080 × 1080, 24 fps MP4** from the edited take.
It uses the same clamped timestamps, authored `holdMs` values and selected
playback speed as interactive replay. Each step is applied in an isolated
command world, so exporting never moves the live editor or borrows its current
flame. Captions, step count, brand tag and progress line are composited into the
video, and the source session remains embedded in MP4 metadata.

This is intentionally a semantic render, not a screen recording. The artwork
gets the full frame and presentation-only actions reuse the previous artwork
while still receiving their own caption and timing. Consecutive frames with an
unchanged semantic state reuse one accumulated GPU render, keeping export cost
proportional to meaningful visual changes rather than video duration.

The first version is silent. A `.steps.json` contains audio wiring and resource
identity, but never copyrighted/source audio bytes; silently borrowing whatever
track happens to be open in the exporting workspace would make the artifact
non-deterministic.

Artwork also fails closed when any rendered state references a custom variation.
The current session format deliberately does not carry executable WGSL, so a
portable video cannot yet prove that the exporter has the same custom code.
That changes only with the trust-boundary work already tracked below.

#### M6b — Full interface capture

Full interface is a second export mode, not an option on the artwork renderer.
It starts the normal replay player and captures the current tab in real time,
preserving the actual sidebar, timeline, follow-cam mask, captions, recorder
chrome and WebGPU flame. Standard browser capture deliberately requires a new
user-approved source picker for every recording, so the UI asks for **This
Tab** and the tab must remain visible. The result keeps the viewport aspect,
within a 1920-pixel long-edge / 1080p pixel budget. WebCodecs produces MP4 with
the source session embedded; the browser-recorder fallback produces WebM and
does not claim embedded-session portability.

The two modes therefore answer different publishing needs:

- **Artwork:** deterministic, square, branded, clean, background export.
- **Full interface:** faithful app tutorial, spotlight and live workspace,
  foreground capture with explicit browser permission.

#### Next phases, in order

1. **M6c — Composition presets:** 9:16 stories/reels, 16:9 video and square,
   with per-network safe areas, fit/crop controls and a preview of the chosen
   framing. Apply these first to Artwork; Full interface can use a guided
   viewport preset rather than distorting captured UI.
2. **M6d — Identity and explanation:** reusable brand templates,
   author/project/tags, optional intro/outro cards, and semantic focus callouts
   or leader lines. Keep the default quiet so the flame remains the subject.
3. **M6e — Soundtrack:** an explicit upload/mix step with trim, gain, fades and
   caption ducking. Treat audio as export input rather than recorder-session
   state so local files and rights remain deliberate.
4. **M6f — Publishing:** platform-specific filenames/metadata and opt-in
   publishing integrations only after the local artifact, preview and consent
   flow are proven.
5. **M6g — Motion fidelity:** optional sampled gesture paths for sliders,
   affine handles and colour controls if real exports show that commit-level
   jumps feel too abrupt. Do not inflate the portable action log until that
   visual need is demonstrated.

### Undo-journal interplay

Recording sits _above_ the undo systems, so the usual hazards don't apply,
but two rules keep them honest:

- Replay mutates the flame inside one preview and captures timeline/audio/view
  state as that entry's undo/redo side effects. One undo therefore restores
  the entire pre-replay workspace, not only the flame.
- Timeline replay runs against transient stacks. The viewer's previous
  timeline history is restored before the combined flame entry commits, then
  the normal global redo invalidation happens once. The timeline push path
  also feeds the same unnamed-write detector as flame history.

## Milestones

Each ships independently; nothing blocks the app in a half-migrated state
because unrecorded mutations still work — they're just visible as `unnamed`
diagnostics.

| #     | Deliverable                                                                                                                                                                                                                                         | Effort         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| M1    | `src/recorder/` module: session schema, recorder hooked into command/history seams, fidelity diagnostics, production UI and `.steps.json` persistence.                                                                                              | shipped        |
| M2    | Determinism: id-based addressing, pre-minted ids, seeded generate/mutate and round-trip tests.                                                                                                                                                      | shipped        |
| M3    | Core editing-surface coverage, sonification state/commands and semantic-origin follow-cam coverage are shipped, including exact anchors for stable controls; committed custom code and a representative Playwright coverage-ratchet journey remain. | incremental    |
| M4    | ~~Replay~~ **done**: `createSessionPlayer` transport, step-list panel, timed playback with speed control, jump-to-step, fork-from-step. A run or a seek is ONE undo step, so watching a session does not bury the viewer's own history.             | shipped        |
| M5    | Sharing: PNG `FlameSteps` chunk, MP4 metadata and export-dialog integration.                                                                                                                                                                        | shipped        |
| M6a   | Artwork replay video: deterministic square MP4, burned captions/identity/progress, isolated command replay and background export queue.                                                                                                             | shipped        |
| M6b   | Full-interface replay video: current-tab capture of the actual replay, panels, timeline, spotlight, captions and WebGPU flame.                                                                                                                      | in progress    |
| M6c–g | Framing presets; identity/callouts; explicit soundtrack mixing; publishing integrations; optional sampled gesture motion.                                                                                                                           | planned        |
| —     | Later: sandboxed replay for gallery previews, scripting/MCP surface over the registry, condensed-recipe editor, gallery publishing.                                                                                                                 | separate plans |

M1 + M2 is the demoable core (record a session using existing commands +
randomize, replay it deterministically). M3 is the long tail and can proceed
one control at a time forever after.

## Risks and open questions

- **`MainWorkspace.tsx` is large.** M3 touches it heavily. The
  refactor-plan (2026-07) context applies; promoting handlers to
  `builtins/` files is _also_ an extraction mechanism, so the two efforts
  compound rather than conflict — but sequencing against any active refactor
  work needs a check before M3 starts.
- **Command arg schemas.** `FlameCommand.validateReplayArgs` now provides the
  untrusted-file seam. A generic finite-JSON budget runs for every command,
  allocation-sensitive structural commands have exact validators, and replay
  is deny-by-default when a command has no declared policy. A registry ratchet
  keeps every registered command explicit as the vocabulary evolves.
- **Schema migration of logs.** A session recorded on app v0.9.9 replayed on
  v1.2 must either migrate (command vocabulary is more stable than the
  document schema — a point in favor of recording intents) or clearly refuse.
  `migrateFlameTypes.ts` handles the embedded `initial`; command-level
  versioning starts as "same major vocabulary version or refuse."
- **Custom variation code edits** (CodeMirror sessions) don't decompose into
  small commands. Portable replay needs bounded starting definitions as well
  as one semantic source revision per commit, with preflight compilation and
  session-owned registration; keystroke-level capture remains out of scope.
- **Gesture fidelity for video.** Commit-level coalescing loses the visual
  journey of a long drag. If step-synced videos feel jumpy, a later additive
  `gesture` sample stream (preview values between `startPreview` and
  `commit`) can be recorded without changing the core model — explicitly
  deferred until a real video proves the need.
