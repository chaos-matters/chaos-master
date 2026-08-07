# Semantic action recorder — every step as a named, replayable command

Status: **in progress**. M1 (recorder core, coverage ratchet, `.steps.json`),
M2 (determinism: `normalizeArgs`, id addressing, pre-minted ids, seeded
generate/mutate), M4 (replay: transport, step list, jump-to-step,
fork-from-step) and M5 (sessions embedded in exported PNGs and MP4s; dropping either
offers its replay) are implemented. The recorder is no longer dev-gated. M3 is largely done: gesture handling
landed, and the render settings, transform card, affine editor, colour
editors, palette, camera, symmetry, randomize/mutate and document loads are
converted. Roughly two dozen direct writes remain in `MainWorkspace.tsx` —
blend/morph, breeding wiring, audio wiring, custom variation code and the
affine list editor. Captured 2026-08-06.

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

- `packages/app/src/commands/` is a working command registry — 33 commands
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
| Command vocabulary + dispatch | 33 commands, `executeCommand(id, ctx, ...args)`                                      | `src/commands/registry.ts`, `builtins/`               |
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
  seed?: number // session RNG seed, when any random command ran
  initial: FlameDescriptor // condensed starting document
  initialTracks?: TimelineTrack[] // timeline starting state, when non-default
  actions: RecordedAction[]
}

type RecordedAction = {
  t: number // ms since session start (performance.now offset) — video sync
  id: string // registered command id, e.g. "flame.setVariationWeight"
  args: unknown[] // JSON-serializable, validated per-command
  label?: string // human-readable, derived from command metadata at record time
}
```

Decisions baked into this shape:

- **Initial state is embedded, not referenced.** A log that replays from
  "whatever was open" is not reproducible. `condenseFlameDescriptor` keeps it
  small.
- **Commit-level granularity.** A slider drag records one action with the
  final value (piggybacking on the existing `startPreview`/`commit`
  coalescing), not 200 intermediate values. The `t` timestamp of the commit
  preserves video-sync fidelity well enough; per-frame gesture curves are a
  non-goal for v1.
- **Undo/redo are recorded as actions** (`history.undo` / `history.redo`).
  The raw log is the faithful journey — that's what syncs to a video and what
  a model should learn from. A derived, _condensed_ log (undos cancelled
  against their targets, no-ops elided — same spirit as `compressPatches`) is
  a pure function over the raw log and becomes the "recipe" view. Store raw,
  derive condensed.
- Schema + serialization live in a new `packages/app/src/recorder/` module
  (`schema.ts`, `recorder.ts`, `replay.ts`, `condense.ts`), unit-testable
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
started or one held on the timeline's own stack, or a workspace remount that
swapped the document underneath an active recording. These retract the action
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
- **Audio-reactive modulation.** `useAudioReactive` writes continuously; the
  recorder captures the _wiring configuration_ changes, not the per-frame
  modulation. (Replaying a session with audio wiring reproduces the setup;
  reproducing the exact audio-driven frames is the animation exporter's job.)

### Replay

`createSessionReplayer(session, ctx)` — the `portalScript.ts` pattern,
generalized:

- **Into the live workspace:** `MainWorkspace` already wires a full
  `CommandContext` (`cmdContext`, see the `runTourCommand.fn` wiring at
  `MainWorkspace.tsx:2459`). Replay = load `session.initial` via the existing
  history `replace`, then `executeCommand(a.id, cmdContext, ...a.args)` per
  action — either timed (original `t` offsets, or scaled) for watch-me mode,
  or instant for jump-to-step (state replay is cheap; the progressive
  renderer catches up on its own).
- **Step list UI:** a panel listing `label`s with the current position;
  clicking step _N_ replays `initial → N` instantly. Scrub-back is replay
  from the start, not undo — the log is the source of truth.
- **Guards:** replay must set an `isReplaying` flag that (a) suspends the
  recorder (no re-recording), and (b) routes writes through the normal
  history so the user can take over at any step and keep undo — "fork from
  step 12" is a feature, not an edge case.
- **Sandboxed replay** (thumbnails, gallery previews) reuses the isolated-
  context recipe and its hazard checklist from the `portalScript.ts` header
  comment (module-global `registerRedoClearer`, `persistentSignal`
  localStorage keys, the autosave→`recentFlames` poll, document-level
  shortcut bindings). Not v1; the API shape just has to keep `ctx` injectable,
  which it already does.

### Determinism

Three known blockers, all with established fix patterns in-repo:

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

1. **Prop-adapter mutations** — ~~the affine editor~~ **done** (it takes a
   `setTransformAffine` dispatch; preview copies keep the raw setter). Still
   open: `AffineListEditor` only — `ColorEditor`, `FlameColorEditor` and
   `ColorListEditor` now take a `setTransformColor` dispatch on the same
   pattern (optional, so preview copies keep the raw setter).
2. **Named handlers** — palette apply/remove are done (`flame.applyPalette`
   / `flame.removePalette`; removal takes the restore colours as an argument,
   since the editor keeps them in a signal and no log can reconstruct UI
   state). Still open: `applySymmetry`,
   `setupMorph`, `runGenerateFlame`, `runMutateFlame`, breeding apply,
   `applyRandomizeSettings`, `handleUpdateRenderSettings`,
   `handleLoadHistory`, `handleRandomizeAnimation`, `handleSmartAnimation`.
3. **Camera writes** — **done**. `setFlameZoom`, `setFlamePosition` and the
   `makeCamera3DSetter` family keep Solid's Setter contract but resolve the
   updater against current state and dispatch a concrete value, so the
   `flame.setRenderSetting` path vocabulary (now dotted: `camera.zoom`,
   `camera3D.theta`) carries it. Every camera gesture is already bracketed by
   `startPreview`/`commit` in `WheelZoomCamera2D`/`3D`, so a whole pan or
   orbit folds into one recorded step.
4. **Document lifecycle** — **mostly done**: `flame.load` carries the
   descriptor itself, so a mid-session open, history load or bred child
   replays without looking anything up. The mount-time paths (Home hand-off,
   shared-URL apply) still use `history.replace` directly; they run before a
   recording can be under way, and the workspace-remount flag covers the case
   where one is.
5. **Blend, audio wiring, custom variation code edits** — later; each is a
   self-contained vocabulary addition.
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

**The ratchet is not yet enforceable in CI.** Coverage is a property of the
UI, not of the command layer: a unit test cannot notice a control that still
writes directly. Making it enforceable needs the recorder reachable from a
production build under test (the record pill is dev-gated), so the honest
statement today is that the unnamed-write count is observable in dev, the
mechanism that makes zero reachable is in place and unit-tested, and the
e2e ratchet lands once the remaining surfaces above are converted.

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

### Undo-journal interplay

Recording sits _above_ the undo systems, so the usual hazards don't apply,
but two rules keep them honest:

- Replay into the live workspace goes through the normal history (`replace`
  for `initial`, commands thereafter), so `undoJournal` seq ordering and
  `createUndoRouter` arbitration keep working — a replayed-then-edited
  session undoes correctly across flame and timeline stacks.
- Timeline commands mutate the timeline's own snapshot-based history
  (`utils/timeline.ts`); the recorder treats both stores uniformly because it
  records commands, not store writes. The `unnamed`-write detector needs a
  sibling hook on the timeline's push path for the same coverage guarantee.

## Milestones

Each ships independently; nothing blocks the app in a half-migrated state
because unrecorded mutations still work — they're just visible as `unnamed`
diagnostics.

| #   | Deliverable                                                                                                                                                                                                                             | Effort                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| M1  | `src/recorder/` module: session schema, recorder hooked into `executeCommand` + history push, `unnamed` coverage diagnostics, record/stop UI stub, `.steps.json` export. Round-trip vitest for the already-command-routed vocabulary.   | ~1 week                |
| M2  | Determinism: id-based addressing in `builtins/flame.ts`, pre-minted ids on add-commands, exported seeded-RNG wrappers, seeded `randomize`/`mutate` commands. Round-trip test extended to random commands.                               | 3–5 days               |
| M3  | Command coverage of the core editing surface (prop adapters, named handlers, camera) + `data-command` attributes as controls are rewired. Coverage ratchet test in Playwright.                                                          | 1–2 weeks, incremental |
| M4  | ~~Replay~~ **done**: `createSessionPlayer` transport, step-list panel, timed playback with speed control, jump-to-step, fork-from-step. A run or a seek is ONE undo step, so watching a session does not bury the viewer's own history. | shipped                |
| M5  | Sharing: PNG `FlameSteps` chunk, MP4 metadata, export-dialog bundle, recent-flames `session?` field.                                                                                                                                    | 3–5 days               |
| —   | Later: sandboxed replay for gallery previews, scripting/MCP surface over the registry, condensed-recipe editor, gallery publishing.                                                                                                     | separate plans         |

M1 + M2 is the demoable core (record a session using existing commands +
randomize, replay it deterministically). M3 is the long tail and can proceed
one control at a time forever after.

## Risks and open questions

- **`MainWorkspace.tsx` is 6217 lines.** M3 touches it heavily. The
  refactor-plan (2026-07) context applies; promoting handlers to
  `builtins/` files is _also_ an extraction mechanism, so the two efforts
  compound rather than conflict — but sequencing against any active refactor
  work needs a check before M3 starts.
- **Command arg schemas.** `FlameCommand` currently types `execute(ctx,
...args: any[])`. Recorded args crossing a serialization boundary need
  per-command valibot schemas (validated on replay, like `tryValidateFlame`
  on load). Add to the `FlameCommand` shape in M1 while the surface is small.
- **Schema migration of logs.** A session recorded on app v0.9.9 replayed on
  v1.2 must either migrate (command vocabulary is more stable than the
  document schema — a point in favor of recording intents) or clearly refuse.
  `migrateFlameTypes.ts` handles the embedded `initial`; command-level
  versioning starts as "same major vocabulary version or refuse."
- **Custom variation code edits** (CodeMirror sessions) don't decompose into
  small commands. v1 records the committed code blob as one
  `variation.setCode` action; keystroke-level capture is out of scope.
- **Gesture fidelity for video.** Commit-level coalescing loses the visual
  journey of a long drag. If step-synced videos feel jumpy, a later additive
  `gesture` sample stream (preview values between `startPreview` and
  `commit`) can be recorded without changing the core model — explicitly
  deferred until a real video proves the need.
