# Session recording, replay and export — EARS requirements

**Version:** 0.9.11 (`packages/app/package.json`) — the version whose shipped behaviour this describes
**Date:** 2026-09-10
**Scope:** The `.steps.json` session lifecycle end to end: what an editing session
captures and what it deliberately refuses to capture, how a session file is
validated when it comes back in from a file or a PNG/MP4 chunk, what replay
guarantees about determinism and side-state restore, how a replay step prepares
the UI before it runs, and the export paths that carry a session — artwork
replay video, full-interface capture, and the timeline animation export on both
the main canvas and the offscreen job host. It does **not** cover the timed
player's transport UI (`recorder/player.ts` is cited only where the exporter
shares its pacing), the command registry itself, the Arcade/WebMCP tools that
drive a recording, or the PNG/MP4 chunk formats (`utils/flameInPng.ts`,
`utils/flameInMp4.ts`) beyond the fact that a session rides in them.

**Source:**

- `packages/app/src/recorder/recorder.ts` — per-seat recording streams, command/gesture capture, coalescing, the unnamed-write honesty counter, suppression
- `packages/app/src/recorder/schema.ts` — the `.steps.json` v1 format, every bound, and `validateSession` (ordering, command-id policy, sonification churn)
- `packages/app/src/recorder/types.ts` — the three start-failure reasons
- `packages/app/src/recorder/snapshotOrigin.ts` — the closed origin vocabulary behind value-pinned snapshot actions
- `packages/app/src/recorder/timelineActions.ts` — the recorder-aware timeline facade and compound-edit snapshotting
- `packages/app/src/recorder/focus.ts`, `focusIds.ts` — follow-cam hint grammar, derivation and DOM resolution
- `packages/app/src/recorder/focusPreparation.ts` — the UI preparation derived for each replay step
- `packages/app/src/recorder/replay.ts` — `ReplayTarget`, instant replay, baseline load order, audio-resource policy
- `packages/app/src/recorder/replaySideState.ts`, `replayPaletteState.ts`, `sonificationState.ts` — non-flame side state captured and restored around a replay batch
- `packages/app/src/recorder/replayVideo.ts` — the deterministic artwork-replay schedule, isolated driver, job spec and burnt-in overlay
- `packages/app/src/recorder/replayInterfaceVideo.ts` — real-time full-interface screen capture
- `packages/app/src/recorder/player.ts` — `stepGapMs` / `closingHoldMs`, shared with the video schedule
- `packages/app/src/hooks/useWorkspaceReplay.ts` — the live workspace's `ReplayTarget`, side-state capture/restore and video-export dispatch
- `packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx` — the export dialog, its two animation paths and the motion-blur control
- `packages/app/src/components/ExportPngDialog/metadataCommit.ts` — metadata written back through semantic commands
- `packages/app/src/components/ExportJobs/OffscreenAnimationRender.tsx` — the offscreen/background video render driver
- `packages/app/src/components/ExportJobs/ExportJobHost.tsx` — the offscreen image render driver and the session PNG chunk
- `packages/app/src/utils/animationExport.ts` — the main-canvas animation export driver and motion blur
- `packages/app/src/utils/exportJobs.ts` — the background job store and `AnimationJobSpec`
- `packages/app/src/utils/exportPreferences.ts` — the shared embed-steps preference and the export-time session snapshot
- `packages/app/src/MainWorkspace.tsx` — where the recorder-aware timeline is constructed and handed out

**Tests:**

- `packages/app/src/recorder/recorder.test.ts` — start feedback, round-trips, gesture coalescing, the unnamed-write ratchet, budgets, serialization, finished-session invalidation
- `packages/app/src/recorder/recorderStreams.test.ts` — per-seat isolation and a shared time origin
- `packages/app/src/recorder/recorderStateRatchet.test.ts` — no module-level signals in the recorder
- `packages/app/src/recorder/documentWriteHook.test.ts` — seat routing of document/transport reports
- `packages/app/src/recorder/narrationMode.test.ts` — sentence-as-step vs sentence-as-caption
- `packages/app/src/recorder/timelineActions.test.ts` — the recorder-aware timeline facade, compound snapshots, seek/scrub coalescing
- `packages/app/src/recorder/snapshotOrigin.test.ts` — origin validation and the "never accept a caller selector" rule
- `packages/app/src/recorder/focus.test.ts`, `focusCamera3D.test.ts` — hint derivation, selector escaping, DOM resolution
- `packages/app/src/recorder/focusPreparation.test.ts` — the preparation derived per replay step
- `packages/app/src/recorder/replay.test.ts` — audio-resource policy, baseline load order, deferred effects
- `packages/app/src/recorder/replaySideState.test.ts`, `replayPaletteState.test.ts`, `sonificationState.test.ts` — side-state normalization, change detection, palette provenance
- `packages/app/src/recorder/player.test.ts` — `stepGapMs` / `closingHoldMs` and the timed player's preflight/batch/takeover rules
- `packages/app/src/recorder/replayVideo.test.ts` — schedule, driver isolation, job-spec refusals, overlay caption fitting
- `packages/app/src/recorder/replayInterfaceVideo.test.ts` — capture orchestration, dimension budget, abort paths
- `packages/app/src/recorder/uiCoverageRatchet.test.ts` — real UI workflows stay command-backed
- `packages/app/src/utils/exportPreferences.test.ts` — the export-time session snapshot
- `packages/app/src/utils/flameInPng.test.ts`, `flameInMp4.test.ts` — the session chunk round-trips out of an exported file
- `packages/app/src/components/ExportPngDialog/metadataCommit.test.ts` — only changed metadata is committed
- _Gap:_ `hooks/useWorkspaceReplay.ts`, `components/ExportPngDialog/ExportPngDialog.tsx` (beyond `metadataCommit`), `components/ExportJobs/OffscreenAnimationRender.tsx`, `components/ExportJobs/ExportJobHost.tsx`, `utils/animationExport.ts` and `utils/exportJobs.ts` have **no** test of their own. See [Coverage gaps](#coverage-gaps) for the requirement IDs this leaves unguarded.
- _Gap:_ `packages/app/src/utils/motionBlur.test.ts` is named for motion blur but imports nothing from `animationExport.ts` — it re-derives the sub-frame arithmetic inline. It cannot go red for any change to the export driver, so it is cited nowhere below.

---

## Requirements

### REQ-RR-001 — A session is intents, not patches

A recorded session shall consist of the document the session started from plus
the ordered, registered-command invocations that transformed it — never the undo
history's patches — so that a log survives a document-schema migration and can be
edited, parameterized and replayed against a different starting state.

_(`recorder/schema.ts:11-22`, `recorder/recorder.ts:22-48`; guarded by
`recorder.test.ts:190` "replays a deterministic session into the same
document".)_

### REQ-RR-002 — Only top-level, unsuppressed commands are logged

**While** a command is executing inside another command (`commandDepth > 0`) or
inside `withRecordingSuppressed`, the recorder shall not append an action, shall
not move the live-workspace mutation stamp, and shall not flag the document
writes that run under it — so a compound command replays through its own
implementation, and replay machinery never absorbs itself into a live take.

_(`recorder/recorder.ts:592`, `:599-613`, `:905-912`; guarded by
`recorder.test.ts:1515` "ignores commands and writes inside
withRecordingSuppressed".)_

### REQ-RR-003 — Record start snapshots the whole world, or refuses with a reason

**When** a recording starts, the recorder shall deep-clone and retain the full
uncondensed flame descriptor plus, where the caller supplies them, the timeline,
audio-wiring, authored-sonification and view snapshots, and shall record the
undo-journal watermark as that take's baseline sequence. **If** the workspace
cannot be cloned, the resulting empty session already fails `persistedSession`,
or a recording is already active on that seat, **then** `start` shall return
`{ ok: false, reason }` naming `'workspace-not-serializable'`,
`'workspace-not-recordable'` or `'already-recording'` and shall leave no
recording active.

_(`recorder/recorder.ts:74-88`, `:357-414`, `recorder/types.ts:1-9`,
`schema.ts:200-231`; guarded by `recorder.test.ts:155`, `:164`, `:177`, and
`:1769` "carries timeline, audio, sonification, and view state through a round
trip".)_

### REQ-RR-004 — The audio file is never captured, only its wiring

**Where** audio reactivity is wired at record time, the session shall carry the
mapping, the source (`file` or `mic`) and the track _name_ only. Audio bytes,
decoded buffers and microphone permission shall never enter a session file.

_(`recorder/schema.ts:210-216`, `recorder/replay.ts:33-49`; guarded by
`replay.test.ts:86` "never treats a missing recorded file identity as a
wildcard".)_

### REQ-RR-005 — One gesture folds into one action per undo entry

**While** a UI gesture is open, repeated invocations of the same command against
the same coalesce key shall replace the anchored action — keeping the gesture's
first timestamp, the final arguments, and a label and focus hint re-derived from
those final arguments — and the anchor set shall be cleared whenever a history
entry lands, so a second drag of the same control becomes a second action
matching the second undo step. A timeline undo push arriving while a flame
command is running shall not clear those anchors.

_(`recorder/recorder.ts:481-516`, `:547-575`, `:802-818`, `:832-848`; guarded by
`recorder.test.ts:405`, `:426`, `:445`.)_

### REQ-RR-006 — An unclaimed document write raises the honesty counter

**If** a history entry lands on the flame or timeline stack outside any command
scope and without a gesture that commands already claimed, **then** the recorder
shall append an unnamed write with its elapsed timestamp, publish the new count,
and warn — rather than dropping the mutation silently. `unnamedWriteCount` is the
log's fidelity marker and 0 is the goal state.

_(`recorder/recorder.ts:802-818`, `:832-848`, `:871-882`, `schema.ts:227-232`;
guarded by `recorder.test.ts:1356` "attributes command writes, counts direct
writes as unnamed".)_

### REQ-RR-007 — A continuous effect earns exactly one fidelity marker per take

**When** a high-frequency unreplayable effect reports itself — audio modulation
ticks, wall-clock timeline transport — the recorder shall record one unnamed
write for the first report under that key and ignore every later report with the
same key for the remainder of the take. **Where** the seat reporting transport is
the seat an Arcade agent is currently driving, no marker shall be recorded at
all: the tool's own preview is not a claim that the session reproduces it.

_(`recorder/recorder.ts:252-261`, `:757-766`, `:855-869`; guarded by
`recorder.test.ts:1334` "reports a high-rate unreplayable effect only once per
take" and `uiCoverageRatchet.test.ts:340`.)_

### REQ-RR-008 — Undo/redo is represented by its result, not the viewer's stacks

**When** an undo or redo lands on a history entry created during the take, the
command shall replace its own recorded action with a value-pinned snapshot
(`flame.load`, or a timeline workspace snapshot) carrying the resulting document.
**If** it would instead land on an entry whose journal sequence is not greater
than the take's baseline, **then** the recorder shall retract the action it
logged, count an unnamed write naming the reason, and clear the coalescing
anchors.

_(`recorder/recorder.ts:686-723`, `:737-748`, `:778-789`; `schema.ts:334-344`
refuses imported `history.undo`/`history.redo`. Guarded by
`recorder.test.ts:346` "records undo as the resulting snapshot so batched replay
stays faithful" and `:1246` "flags an undo of an edit made BEFORE recording
started".)_

### REQ-RR-009 — A budget overrun degrades to a valid prefix plus one marker

**If** an action would exceed the 24-hour timestamp limit, the 2000-action limit,
the per-action schema limits or the 8 MiB compact-JSON budget, **then** the
recorder shall drop that action, record a single deduplicated
`session-persistence-budget` unnamed write, and keep recording; and **if** the
pretty-printed persisted form still does not fit at Stop, it shall trim the
newest actions one at a time until it does, leaving an earlier valid prefix.

_(`recorder/recorder.ts:252-261`, `:265-326`, `:442-468`, `schema.ts:25-40`;
guarded by `recorder.test.ts:1554`, `:1566`, `:1581`, `:1595`.)_

### REQ-RR-010 — A finished session detaches when the workspace diverges

**When** any top-level command that does not declare `preservesFinishedSession`,
any unclaimed history write, or any synthetic snapshot action occurs while no
recording is active, the recorder shall clear the last finished session — so an
export can never embed steps describing a different flame from the one it
rendered.

_(`recorder/recorder.ts:416-428`, `:593-598`, `:649-656`, `:812-814`, `:843-845`;
guarded by `recorder.test.ts:1926` "finished-session export association".)_

### REQ-RR-011 — Compound timeline edits record one value-pinned snapshot

**When** a bulk or compound timeline edit runs through the recorder-aware
timeline — Randomize Animation, Smart Animation, Animate Colors, a preset, a
morph, a multi-track removal, a keyframe split or a mirror — the facade shall run
the raw mutation invisibly to the recorder inside one undo step and then emit a
single synthetic `timeline.loadTimeline` action carrying the resulting timeline
snapshot and its `SnapshotOrigin`, so replay reproduces the exact generated
animation rather than re-rolling it. **If** the mutation leaves the serialized
snapshot unchanged, no action shall be emitted and the last finished session
shall not be invalidated.

> **Known deviation:** `packages/app/src/MainWorkspace.tsx:2411-2419` passes the
> **raw** `timeline` to `useWorkspaceAnimationGen`, not the `recorderTimeline`
> built at `MainWorkspace.tsx:3084`. `runTimelineSnapshotMutation`
> (`recorder/timelineActions.ts:24-33`) finds no `RECORDER_SNAPSHOT_MUTATION`
> symbol on a raw timeline and falls back to `timeline.runWithSingleUndo`, so
> Randomize Animation and Smart Animation
> (`hooks/useWorkspaceAnimationGen.ts:217`, `:241`) emit **no** synthetic action
> today: they still produce one undo step, but a session recorded over them
> replays without the animation they generated.

_(`recorder/timelineActions.ts:24-33`, `:81-113`, `:374-416`; the facade is
guarded by `timelineActions.test.ts:256`, `:283` and `:367` — none of which
reaches the MainWorkspace wiring above.)_

### REQ-RR-012 — Paused frame stepping is authored; playing advance is not

**While** the timeline is playing, `advanceFrame` shall pass straight through to
the raw timeline so the render loop's wall-clock playback stays outside the
semantic log; **while** it is paused, the same button shall dispatch a
deterministic `timeline.setCurrentFrame` seek that replays like clicking the
ruler, wrapping at the configured loop bounds.

_(`recorder/timelineActions.ts:193-217`; guarded by
`timelineActions.test.ts:433` "records paused previous/next buttons as
deterministic frame actions".)_

### REQ-RR-013 — Action timestamps are non-decreasing

**If** any action's `t` is strictly less than its predecessor's, **then**
`validateSession` shall reject the whole session. Equal timestamps are accepted:
that is how a companion pair says it is one gesture and not two.

_(`recorder/schema.ts:287-296`, `:313-320`; guarded by `recorder.test.ts:1658`
"rejects malformed payloads".)_

### REQ-RR-014 — Only registry-shaped command ids, never history commands

**If** a session contains an action whose id does not match the registry grammar
— lowercase-letter first character, alphanumerics with single non-repeating
`.`/`-`/`_` separators and no trailing separator — or whose id is `history.undo`
or `history.redo`, **then** `validateSession` shall reject the whole session
rather than let an imported file operate on the viewer's own history stacks.

_(`recorder/schema.ts:44-67`, `:334-344`; guarded by `recorder.test.ts:1434`
"accepts bounded symmetry edges and rejects imported history commands".)_

### REQ-RR-015 — Every session field is bounded before it is retained

A session shall be rejected unless the whole compact JSON is at most 8 MiB, the
file at most the same in bytes, actions at most 2000, each `t` in
`[0, 86_400_000]`, `args` at most 16 entries, `id` at most 128 characters,
`label` at most 4096, `focus` at most 512, `note` at most 16_384, `holdMs` in
`[0, 600_000]`, and the number of sonification model transitions across the take
at most 16 — the last so a hostile zero-gap session cannot force hundreds of
synchronous Web Audio graph rebuilds on replay.

_(`recorder/schema.ts:25-40`, `:69-108`, `:287-319`; guarded by
`recorder.test.ts:1658` "rejects malformed payloads" and `:1819` "bounds
synchronous sonification model graph transitions".)_

### REQ-RR-016 — Untrusted payloads are rejected, not silently normalized

**If** an imported `initialView.paletteRestoreColors` carries more entries than
the transform limit or any key that is not a safe flame entity id — including
prototype keys that Valibot would omit from a record output — or **if** the
embedded `initial` does not survive `tryValidateFlame` (which dispatches 2D vs 3D
and migrates older saves), **then** the whole session shall be rejected, rather
than accepted as a different, quietly repaired session.

_(`recorder/schema.ts:113-171`, `:268-285`, `:321-326`, `:346-348`; guarded for
the round-trip half by `recorder.test.ts:1637` "round-trips through
serialize/parse".)_

### REQ-RR-017 — Snapshot origins are a closed vocabulary

**If** a value-pinned action's origin argument is not a plain object whose only
keys are `kind` and `detail`, whose `kind` is one of the 22 declared origins, and
whose `detail` (when present) is a 1–160 character string, **then** the origin
shall be discarded. Captions and follow-cam hints for a snapshot action shall be
derived from the validated `kind` alone, so an imported session can never smuggle
a selector or an arbitrary focus hint into the replay UI.

_(`recorder/snapshotOrigin.ts:20-46`, `:60-90`, `:96-181`; guarded by
`snapshotOrigin.test.ts:36` "rejects unknown, oversized, and prototype-bearing
imported values" and `:56` "never accepts a caller-provided focus selector".)_

### REQ-RR-018 — Replay preflights everything, and refuses to run while recording

**When** a session is replayed — instantly, step by step, or into the video
driver — every action shall be preflighted through `preflightReplayCommand`
before the baseline is loaded or any batch is opened, and a rejection shall abort
having changed nothing (the video driver throwing with the 1-based step number).
**If** a session recording is active, **then** replay shall refuse outright and
close any batch it had opened.

_(`recorder/replay.ts:156-168`, `recorder/replayVideo.ts:483-497`; guarded by
`player.test.ts:1142` "preflights every action before opening a batch or loading
state", `replayVideo.test.ts:150`, `recorder.test.ts:1534` and
`player.test.ts:1117`.)_

### REQ-RR-019 — A replay is invisible to the recorder and lands as one undo step

**While** a replay batch is open, every applied action shall run inside
`withRecordingSuppressed`, inside the target's `withBatchWrite` so the history
attributes those writes to the replay's own preview owner, and inside
`withDeferredEffects` so intermediate states never create heavyweight resources —
and the whole run shall commit as exactly one undoable entry.

_(`recorder/replay.ts:163-189`, `hooks/useWorkspaceReplay.ts:502-567`; guarded by
`player.test.ts:529` "collapses a whole run into one undo step" and `:346`
"defers target side effects across an entire seek rebuild".)_

### REQ-RR-020 — The baseline loads in presentation-safe order

**When** a replay loads the session start, it shall apply the flame first, then
the timeline snapshot, then the audio wiring, then the view snapshot, and the
sonification snapshot **last** — so a saved closed sidebar cannot immediately
hide the stop control that an enabled sonification baseline just revealed. **If**
the session carries no timeline, audio, sonification or view snapshot, the
corresponding target hook shall not be called at all, leaving the viewer's own
state alone rather than clearing it.

_(`recorder/replay.ts:191-211`; guarded by `replay.test.ts:235` "loads view
before an optional sonification baseline and then actions" and `:295` "leaves
target sonification untouched for a legacy session".)_

### REQ-RR-021 — Replay never re-enables audio against an unrelated resource

**When** replay applies an audio wiring snapshot, it shall first disable
reactivity, then replace the mapping and source, and shall re-enable reactivity
only where the snapshot's own requirement is met: a live analyzer for a `mic`
source, or a loaded file buffer whose current track name is a non-empty exact
match for the recorded `trackName` for a `file` source. A missing recorded track
name shall never be treated as a wildcard.

_(`recorder/replay.ts:38-76`; guarded by `replay.test.ts:20`, `:37`, `:76`,
`:86`, `:96`.)_

### REQ-RR-022 — Replay Undo carries only changed side state, and only live identities

**If** a replay changed nothing outside the flame document — timeline, audio,
sonification, view and presentation all serialize identically before and after —
**then** the batch shall commit without undo/redo effects, because the patch
history already represents the flame; otherwise the commit shall be forced and
carry effects restoring the captured before/after side state. **When** such an
effect restores a presentation snapshot, the selected transform, collapsed set,
quick-pick target and hovered variation shall each be dropped unless they name a
transform that exists in the restored flame and is not a generated `_sym__` row
(and, for quick-pick, a variation that still exists on it).

_(`recorder/replaySideState.ts:54-88`, `:90-105`,
`hooks/useWorkspaceReplay.ts:289-364`, `:521-567`; guarded by
`replaySideState.test.ts:75`, `:110`, `:128`, `:135`, `:145`, `:152`, `:161`.)_

### REQ-RR-023 — Palette provenance moves with the replayed document

**When** a replayed command changes what a later Palette "Unselect" may restore,
the editor-only stash shall move with it atomically: `flame.load` takes the
serialized provenance from arg 2 and otherwise clears the stash;
`recorder.restoreWorkspaceSnapshot` takes arg 2 but keeps the viewer's stash when
the action predates provenance; `flame.removePalette` clears it; and
`flame.applyPalette` captures the pre-command colours only when the stash is
empty.

_(`recorder/replayPaletteState.ts:37-68`, `:72-105`,
`hooks/useWorkspaceReplay.ts:487-500`; guarded by
`replayPaletteState.test.ts:10`, `:35`, `:66`, `:90`, `:111`, `:144`.)_

### REQ-RR-024 — The command vocabulary wins over a session's saved hint

**When** a replay step derives its follow-cam preparation, it shall re-derive the
hint from the action's command id and arguments through the central table, and
use the session's stored `focus` only where the central table has nothing to say
— so an old or generic hint recorded years ago is upgraded rather than obeyed. At
record time, a command that declares its own `focus()` shall win over the central
table.

_(`recorder/focusPreparation.ts:460-478`, `recorder/focus.ts:158-165`, `:466-483`;
guarded by `focusPreparation.test.ts:35`, `:51`, and `focus.test.ts:18`.)_

### REQ-RR-025 — An unsafe or unresolvable hint changes nothing

**If** a hint's transform or variation segment is not a safe flame entity id, or
its kind is not `param:`/`ui:`/`focus:`, or it resolves to no visible element,
**then** it shall be retained only as the spotlight target — which safely
resolves to no element — and shall never become workspace state. Hint values
shall be escaped for both backslash and quote before being placed inside an
attribute selector, and a selector that still throws shall be skipped rather than
aborting resolution.

_(`recorder/focusPreparation.ts:170-176`, `:478-480`, `recorder/focus.ts:60-101`,
`:103-125`, `:139-141`; guarded by `focusPreparation.test.ts:567`,
`focus.test.ts:264`, `:269`, `:314`.)_

### REQ-RR-026 — Zero-sized matches are skipped, and targets are revealed in place

**When** resolving a hint, the first match with a non-zero bounding rectangle
shall win — a control inside a collapsed card is in the DOM, but framing it would
spotlight an empty rectangle — and revealing a target shall scroll only the
ancestors that actually clip it, using `block: 'nearest'`, `inline: 'nearest'`
and `behavior: 'auto'`, so the recorder dock and canvas do not jump and each
container's own reduced-motion policy is respected.

_(`recorder/focus.ts:103-133`; guarded by `focus.test.ts:297` "skips a zero-sized
match and takes the next selector that is visible" and `:319` "reveals an
off-screen target through its nearest scroll containers".)_

### REQ-RR-027 — Preparation reveals the owning surface before the step executes

**When** a replay step is about to run, the workspace shall apply the derived
preparation first: reveal the timeline (expanding it for dope-sheet and ruler
targets), reveal the editor sidebar and clear transient quick-pick/hover state,
select and expand the owning transform, open the exact editor card (affine,
color, metadata, palette, render, randomizer, or the dedicated symmetry card),
switch the affine mode/tab and colour view, and expand the floating actions —
and **if** the step removes a transform, it shall clear the selection instead of
selecting it.

_(`recorder/focusPreparation.ts:373-457`, `hooks/useWorkspaceReplay.ts:365-435`;
the derivation is guarded across `focusPreparation.test.ts`, the workspace
application is not.)_

### REQ-RR-028 — The video schedule is the live player's pacing

A replay video schedule shall place each step using the same `stepGapMs` and
`closingHoldMs` the live player uses — an authored `holdMs` unclamped, a
narration hold for a step that speaks, otherwise the measured gap floored at
800 ms and capped at 2000 ms, all divided by playback speed — and shall extend
the tail to whichever is longer, the requested tail or the closing hold. **If**
two authored actions share a timestamp, the schedule shall still advance at least
one output frame between them, and the total frame count shall always be large
enough to represent the last authored action even when the caller asks for no
tail.

_(`recorder/replayVideo.ts:388-453`, `recorder/player.ts:135-190`; guarded by
`replayVideo.test.ts:21`, `:56`, `:70`, `:294`.)_

### REQ-RR-029 — Video export refuses takes it cannot reproduce or afford

**If** a take has a non-zero `unnamedWriteCount`, has no actions, references a
`custom_`-prefixed variation anywhere in its baseline flame or any action's
arguments, or schedules to more than 300 000 ms, **then** both video export paths
shall throw a message naming the problem (and, for custom variations, the 1-based
step) — and shall do so before an encoder is allocated and, for the interface
path, before the privacy-sensitive screen-share picker is shown.

_(`recorder/replayVideo.ts:51`, `:302-380`, `:429-436`, `:859-895`,
`recorder/replayInterfaceVideo.ts:310-323`; guarded by `replayVideo.test.ts:40`,
`:214`, `:223`, `:234`, `:248`, `:263`.)_

### REQ-RR-030 — The artwork driver renders in an isolated world with audio off

**While** an artwork replay renders, the driver shall execute each command against
a private command context holding its own flame, timeline, view, audio,
sonification and palette-provenance state — never the workspace's — shall report
`canEnable: () => false` for audio so no runtime resource is attached to a
deterministic export, shall treat `timeline.play` as a no-op, and shall rebuild
from the baseline whenever a seek moves backwards. The plate shall be a fixed
1920×1080 landscape, matching the framing the editor authors in.

_(`recorder/replayVideo.ts:33-38`, `:483-847`, `:717-727`, `:805-847`; guarded by
`replayVideo.test.ts:86` "replays registered commands in an isolated world
without mutating input", `:114`, and `:181`.)_

### REQ-RR-031 — Caption-only steps reuse the accumulated artwork frame

**While** consecutive steps leave the visual fingerprint unchanged — render
settings, transforms, final transform, palette, blend flame and weight, adaptive
and stochastic filters — the offscreen renderer shall re-encode the last
accumulated artwork frame with an updated caption and progress bar instead of
waiting for a GPU re-render that would correctly never arrive.

_(`recorder/replayVideo.ts:97-110`,
`components/ExportJobs/OffscreenAnimationRender.tsx:243-332`; the fingerprint is
guarded by `replayVideo.test.ts:159` "distinguishes visual steps from captions
that can reuse artwork" — the run loop consuming it is not.)_

### REQ-RR-032 — Replay video refuses the MediaRecorder fallback

**If** the encoder created for a replay-video job reports that it fell back to
`MediaRecorder`'s wall-clock `captureStream`, **then** the job shall cancel that
encoder and fail with a message about offline encoding support — an off-line
schedule that reuses one frame many times cannot be paced by a real-time
recorder, and the fallback carries no embedded session metadata.

_(`components/ExportJobs/OffscreenAnimationRender.tsx:189-196`, `:210-219`.)_

### REQ-RR-033 — Interface capture prompts on the export stack and always cleans up

**When** a full-interface replay is exported, `getDisplayMedia` shall be called
directly on the Export-button stack so the browser's transient-activation
requirement is met and the person is prompted every time; after the live player
finishes, the capture shall wait only `schedule.tailMs` minus the closing hold
the player already took, so the closing sentence is not held twice. **If** the
chosen surface reports `displaySurface === 'monitor'`, the page is not a secure
context, the browser exposes no `getDisplayMedia`, sharing stops early, sampling
throws, or the capture overruns the duration limit by more than 5 s, **then** the
capture shall abort with a message naming the actual problem, cancel the encoder
and stop every track — and the source shall be stopped and the timeout cleared on
every exit path.

_(`recorder/replayInterfaceVideo.ts:151-197`, `:340-353`, `:379-388`, `:437-445`;
guarded by `replayInterfaceVideo.test.ts:113` "captures the ordinary replay after
the source is active and cleans up" and `:162` "aborts safely when tab sharing
stops before replay completion".)_

### REQ-RR-034 — The embedded session is snapshotted at export initiation

**Where** the user has left "embed steps" on and a finished session exists, each
of the four export paths — the dialog's PNG job, the no-dialog quick export, the
inline MP4 export and the offscreen MP4 job — shall deep-clone that session at the
moment the export starts and carry the clone through its delayed canvas callbacks
and finalizers, so a recording started while the job renders can never leak into a
file it did not produce.

_(`utils/exportPreferences.ts:17-34`,
`components/ExportPngDialog/ExportPngDialog.tsx:1001`, `:1227`, `:1243`,
`components/ExportJobs/ExportJobHost.tsx:136-141`,
`utils/animationExport.ts:345-353`; guarded by `exportPreferences.test.ts:22`
"keeps the initiation-time recording after the current session changes", and by
`flameInPng.test.ts:134` / `flameInMp4.test.ts:94` for the round-trip.)_

### REQ-RR-035 — Only metadata the export dialog changed is written back

**When** an export is confirmed, the dialog shall compare its private preview
metadata against the workspace flame's and commit a patch containing only the
fields that differ, through the semantic metadata command — so the whole Export
gesture is one recorder action and one history entry, and an untouched field is
never rewritten.

_(`components/ExportPngDialog/metadataCommit.ts:11-28`,
`ExportPngDialog.tsx:1204-1208`, `:1233-1237`; guarded by
`metadataCommit.test.ts`.)_

### REQ-RR-036 — Motion blur accumulates sub-frames inside one output frame

**Where** `motionBlurSamples` is greater than 1, the animation export shall split
each output frame into that many sub-frames offset by
`(index / samples) × (shutterAngle / 360)` frames, advance the playhead and
re-resolve the flame for each, and accumulate them into the same render buffer by
gating each sub-frame on a cumulative point budget of
`round(((index + 1) / samples) × limit)` — capturing only once the final
sub-frame's full budget is reached.

_(`utils/animationExport.ts:176-256`.)_

### REQ-RR-037 — Motion blur applies to the offscreen animation export too

**Where** the user selects "Render in background (offscreen)" with motion blur
above 1, the background render shall produce the same accumulated sub-frame
result as the main-canvas path, so the checkbox changes only _where_ the render
happens and not _what_ it renders.

> **Resolved in #91.** The offscreen render ignored `motionBlurSamples`
> entirely (`OffscreenAnimationRender.tsx` resolved one flame per integer frame).
> Wiring it in exposed a deeper fault shared by **both** paths: the export driver
> sized a tick to reach the whole point budget at once, so the first sub-frame
> took every point and the rest added nothing -- the main canvas had never blurred
> either. Review of #91 then found two more main-canvas faults: the timeline
> reset effect wiped the buffer on every sub-frame whenever the timeline drove
> the view, and each frame's first tick read the previous frame's total and
> skipped sub-frames. Flam3 now stops each sub-frame at its cumulative share
> (`accumulationFraction`), resets only per output frame while an export owns
> resets, and the main loop resets at frame setup. Measured at the encoder
> boundary: offscreen 17-21% softer, main canvas 34-36% softer, blur-off
> unchanged.

### REQ-RR-038 — The main-canvas export restores the workspace flame

**When** a main-canvas animation export finishes, is cancelled, or fails, it shall
restore the render settings, transforms and metadata it snapshotted before the
first frame, and shall clear the export-running, progress, cancel, force-export,
export-image and export-quality signals — on every one of those exit paths.

_(`utils/animationExport.ts:322-330`, `:360-373`, `:371-386`.)_

### REQ-RR-039 — Capture waits for the final image, and Stop & Save keeps what rendered

**While** an export frame is accumulating, the driver shall ignore every
export-image callback until the accumulated point count has reached the quality
limit **and** the callback reports `finalImageReady === true`, so a stale preview
is never encoded, and it shall guard against re-entrant capture while a frame's
bitmap is being created and encoded. **If** the user requests a forced export,
**then** the export shall finalize with exactly the frames already encoded and
report their count — or, **if** no frame has been encoded yet, be treated as a
cancel, the main-canvas path resolving an empty blob and the offscreen job
dismissing itself, so no zero-frame file is offered.

_(`utils/animationExport.ts:157-170`, `:224-274`,
`components/ExportJobs/OffscreenAnimationRender.tsx:376-403`, `:385-393`,
`components/ExportJobs/ExportJobHost.tsx:158-183`, `utils/exportJobs.ts:247-249`,
`:279-289`.)_

---

## Coverage gaps

The requirements below have **no** test whose assertion goes red when the
behaviour is violated. Several cite a test for a pure helper the requirement
depends on; that is noted where it applies, but the requirement itself is
unguarded.

| ID         | Why it is unguarded                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-RR-007 | The Arcade-pilot transport exemption (`recorder.ts:862`) has no test of its own; `uiCoverageRatchet.test.ts:340` covers only the non-exempt path.              |
| REQ-RR-011 | The facade is tested; the **MainWorkspace wiring** that decides whether the facade is used at all is not — which is exactly how its known deviation shipped.   |
| REQ-RR-016 | Nothing constructs a prototype-bearing `paletteRestoreColors` and asserts the session is rejected rather than emptied.                                         |
| REQ-RR-027 | `focusPreparation.test.ts` covers derivation only. Nothing tests `useWorkspaceReplay.ts:365-435`, which applies it — that hook has no test file.               |
| REQ-RR-031 | The fingerprint is tested; the state-run loop in `OffscreenAnimationRender.tsx` that consumes it is not.                                                       |
| REQ-RR-032 | No test file for `OffscreenAnimationRender.tsx`.                                                                                                               |
| REQ-RR-036 | `utils/motionBlur.test.ts` re-derives the arithmetic inline and imports nothing from `animationExport.ts`; it stays green for any change to the export driver. |
| REQ-RR-037 | `utils/motionBlur.test.ts` pins the sub-frame rule; blur itself is verified by measurement only (#91).                                                         |
| REQ-RR-038 | No test file for `utils/animationExport.ts`.                                                                                                                   |
| REQ-RR-039 | No test file for any of the four drivers it cites.                                                                                                             |

Partially guarded, worth naming: REQ-RR-019, REQ-RR-022 and REQ-RR-023 are
covered where their logic lives in `recorder/`, but the `useWorkspaceReplay.ts`
half — capture, restore, and the forced commit against the real history — has no
test at all.

The pattern is one boundary: **everything under `packages/app/src/recorder/` is
densely unit-tested; everything that wires it into the workspace or drives a
GPU/encoder is not.** `hooks/useWorkspaceReplay.ts` (608 lines),
`components/ExportPngDialog/ExportPngDialog.tsx` (1370 lines, only its 28-line
`metadataCommit.ts` helper tested), `components/ExportJobs/*` (1056 lines) and
`utils/animationExport.ts` (399 lines) have no tests. Both known deviations
recorded in this spec live in exactly that untested band.
