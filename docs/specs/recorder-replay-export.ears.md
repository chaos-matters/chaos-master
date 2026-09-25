# Session recording, replay and export — EARS requirements

**Version:** 0.9.12 (`packages/app/package.json`) — the version whose shipped behaviour this describes
**Date:** 2026-09-23
**Scope:** The `.steps.json` session lifecycle end to end: what an editing session
captures and what it deliberately refuses to capture, how a session file is
validated when it comes back in from a file or a PNG/MP4 chunk, what replay
guarantees about determinism and side-state restore, how a replay step prepares
the UI before it runs, and the export paths that carry a session — artwork
replay video, full-interface capture, and the timeline animation export on both
the main canvas and the offscreen job host. It does **not** cover the timed
player's transport UI (`recorder/player.ts` is cited where the exporter
shares its pacing, for play windows, and for the Glide switches), the command registry itself, the Arcade/WebMCP tools that
drive a recording, or the PNG/MP4 chunk formats (`utils/flameInPng.ts`,
`utils/flameInMp4.ts`) beyond the fact that a session rides in them.

**Source:**

- `packages/app/src/recorder/recorder.ts` — per-seat recording streams, command/gesture capture, coalescing, the unnamed-write honesty counter, suppression
- `packages/app/src/recorder/uncapturedSteps.ts` — the named uncaptured steps a take saves, and the words every panel and the export notice use for them
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
- `packages/app/src/recorder/playWindows.ts`, `playWindowPace.ts` — a take's play windows and the one pace both replays move the playhead by
- `packages/app/src/recorder/playerPlayWindows.ts`, `replayPlayback.ts` — the live player's take clock inside a window, and the workspace timeline it holds
- `packages/app/src/recorder/replayGlideLease.ts` — the viewer's Glide switches over a replay, their own flips kept
- `packages/app/src/recorder/transportStep.ts`, `documentWriteHook.ts` — the Play and Pause step's form and label, and the playback report and probe the recorder reads
- `packages/app/src/utils/timeline.ts`, `packages/app/src/flame/Flam3.tsx` — the frames a playback advanced, and the render-loop clocks a paced replay holds off
- `packages/app/src/commands/builtins/glide.ts`, `packages/app/src/flame/glide/runtime.ts` — the Glide switches, a replay world's own pair and its missing glide runtime, and the capture and restore every replay uses
- `packages/app/src/recorder/glide.ts` — the length of a replayed step's glide, and the tier the take has in force at each step
- `packages/app/src/seats/seat.ts`, `packages/app/src/components/Home/portalScript.ts` — the duel seat's and the Home portal's command contexts, apart from the live glide
- `packages/app/src/commands/builtins/export.ts` — the export commands a take can carry, and the export host they need
- `packages/app/src/hooks/useWorkspaceReplay.ts` — the live workspace's `ReplayTarget`, side-state capture/restore and video-export dispatch
- `packages/app/src/hooks/useWorkspaceBlendPick.ts`, `packages/app/src/flame/blend.ts` — the blend gallery's hover preview, the pick it commits, and the default weight both use
- `packages/app/src/components/BlendFlameGallery/BlendFlameGallery.tsx`, `packages/app/src/components/WorkspaceSidebar/WorkspaceSidebar.tsx` — every way the gallery is left ending the preview, and the Evolve and Diff picks
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
- `packages/app/src/recorder/playWindows.test.ts`, `playWindowPace.test.ts` — the window plan, the loop rule and the shared pace
- `packages/app/src/recorder/playWindowReplay.test.ts` — recorded takes replayed against the real timeline and render loop: pace, wraps, speed, Pause, seeks, a take stopped while playing, a replay ended early inside a window
- `packages/app/src/recorder/replayVideoPlayWindows.test.ts` — the artwork schedule and driver inside a window
- `packages/app/src/recorder/replayGlideSwitches.test.ts`, `packages/app/src/components/SessionRecorder/SessionReplayPanelGlide.test.tsx` — the Glide switches on every way a replay or export ends, the viewer's own flips, the live glide runtime no replay world reaches, and the timeline an early end pauses
- `packages/app/src/recorder/replayVideo.test.ts` — schedule, driver isolation, job-spec refusals, overlay caption fitting
- `packages/app/src/recorder/replayGlideQuality.test.ts`, `packages/app/src/recorder/glide.test.ts` — the take's own Glide tier, step by step, in the live replay and the artwork export
- `packages/app/src/hooks/useWorkspaceReplay.exportStep.test.ts` — an export step in a live replay opens nothing and queues nothing
- `packages/app/src/recorder/replayInterfaceVideo.test.ts` — capture orchestration, dimension budget, abort paths
- `packages/app/src/recorder/uiCoverageRatchet.test.ts` — real UI workflows stay command-backed
- `packages/app/src/utils/exportPreferences.test.ts` — the export-time session snapshot
- `packages/app/src/utils/flameInPng.test.ts`, `flameInMp4.test.ts` — the session chunk round-trips out of an exported file
- `packages/app/src/components/ExportPngDialog/metadataCommit.test.ts` — only changed metadata is committed
- `packages/app/src/hooks/useWorkspaceBlendPick.test.tsx`, `packages/app/src/components/WorkspaceSidebar/WorkspaceSidebar.gallery.test.tsx` — the blend gallery's picks and every way out of its hover preview
- _Gap:_ `hooks/useWorkspaceReplay.ts` (beyond its export steps), `components/ExportPngDialog/ExportPngDialog.tsx` (beyond `metadataCommit`), `components/ExportJobs/OffscreenAnimationRender.tsx`, `components/ExportJobs/ExportJobHost.tsx`, `utils/animationExport.ts` and `utils/exportJobs.ts` have **no** test of their own. See [Coverage gaps](#coverage-gaps) for the requirement IDs this leaves unguarded.
- _Gap:_ `packages/app/src/utils/motionBlur.test.ts` is named for motion blur but imports nothing from `animationExport.ts` — it re-derives the sub-frame arithmetic inline. It cannot go red for any change to the export driver, so it is cited nowhere below.

---

## Requirements

### REQ-RR-001 — A session is intents, not patches

A recorded session shall consist of the document the session started from plus
the ordered, registered-command invocations that transformed it — never the undo
history's patches — so that a log survives a document-schema migration and can be
edited, parameterized and replayed against a different starting state.

_(`recorder/schema.ts:12-23` (`INTENTS`), `recorder/recorder.ts:25-51` (`turns`); guarded by
`recorder.test.ts:191` "replays a deterministic session into the same
document".)_

### REQ-RR-002 — Only top-level, unsuppressed commands are logged

**While** a command is executing inside another command (`commandDepth > 0`) or
inside `withRecordingSuppressed`, the recorder shall not append an action, shall
not move the live-workspace mutation stamp, and shall not flag the document
writes that run under it — so a compound command replays through its own
implementation, and replay machinery never absorbs itself into a live take.

_(`recorder/recorder.ts:597` (`isTopLevel`), `:604-618` (`isTopLevel`), `:975-982` (`breakRecordingCoalescingIn`); guarded by
`recorder.test.ts:1516` "ignores commands and writes inside
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

_(`recorder/startResult.ts:8-15` (`SessionRecordingStartResult`), `recorder/recorder.ts:356-414` (`startIn`),
`schema.ts:204-235` (`TransformColorSnapshotSchema`); guarded by `recorder.test.ts:156` "reports a successful start and an already-active race", `:165` "reports a workspace that cannot be serialized", `:178` "reports a workspace outside the bounded session schema", and
`:1770` "carries timeline, audio, sonification, and view state through a round trip".)_

### REQ-RR-004 — The audio file is never captured, only its wiring

**Where** audio reactivity is wired at record time, the session shall carry the
mapping, the source (`file` or `mic`) and the track _name_ only. Audio bytes,
decoded buffers and microphone permission shall never enter a session file.

_(`recorder/schema.ts:214-220` (`finite`), `recorder/replay.ts:34-50` (`canEnableReplayAudio`); guarded by
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

_(`recorder/recorder.ts:486-521` (`coalesceRecordedAction`), `:552-580` (`recordActiveCommandAction`), `:806-822` (`slider`), `:836-852` (`anchors`); guarded by
`recorder.test.ts:406` "folds one drag into a single action holding the final value", `:427` "keeps two drags of the same control as two actions (two undo steps)", `:446` "keeps distinct controls apart but folds a return to an earlier one".)_

### REQ-RR-006 — An unclaimed document write raises the honesty counter

**If** a history entry lands on the flame or timeline stack outside any command
scope and without a gesture that commands already claimed, **then** the recorder
shall append an unnamed write with its elapsed timestamp and a reason naming the
entry, publish the new count, and warn — rather than dropping the mutation
silently. `unnamedWriteCount` is the log's fidelity marker and 0 is the goal
state; REQ-RR-041 is what it saves about each one.

_(`recorder/recorder.ts:806-822` (`slider`), `:836-852` (`anchors`), `:942-952` (`named`), `schema.ts:231-236` (`TransformColorSnapshotSchema`);
guarded by `recorder.test.ts:1357` "attributes command writes, counts direct
writes as unnamed".)_

### REQ-RR-007 — A continuous effect earns exactly one fidelity marker per take

**When** a high-frequency unreplayable effect reports itself — audio modulation
ticks, a seek or frame step made on the raw timeline outside a command — the
recorder shall record one unnamed write for the first report under that key and
ignore every later report with the same key for the remainder of the take. Play
and Pause are not such an effect: they are steps (REQ-RR-040). **Where** the
seat reporting transport is the seat an Arcade agent is currently driving, no
marker shall be recorded at all: the tool's own preview is not a claim that the
session reproduces it.

_(`recorder/recorder.ts:251-260` (`noteSessionBudgetExceeded`), `:762-771` (`reportUnreplayableOnceIn`), `:860-874` (`Direct`); guarded by
`recorder.test.ts:1335` "reports a high-rate unreplayable effect only once per
take", `recorder.test.ts:2040` "tracks direct timeline seeks without flooding
the recording" and `uiCoverageRatchet.test.ts:287` "keeps document and transport boundaries honest".)_

### REQ-RR-008 — Undo/redo is represented by its result, not the viewer's stacks

**When** an undo or redo lands on a history entry created during the take, the
command shall replace its own recorded action with a value-pinned snapshot
(`flame.load`, or a timeline workspace snapshot) carrying the resulting document.
**If** it would instead land on an entry whose journal sequence is not greater
than the take's baseline, **then** the recorder shall retract the action it
logged, count an unnamed write naming the reason, and clear the coalescing
anchors.

_(`recorder/recorder.ts:691-728` (`accumulated`), `:742-752` (`claiming`), `:782-793` (`started`); `schema.ts:364-374` (`isSessionJsonLengthValid`)
refuses imported `history.undo`/`history.redo`. Guarded by
`recorder.test.ts:347` "records undo as the resulting snapshot so batched replay
stays faithful" and `:1247` "flags an undo of an edit made BEFORE recording
started".)_

### REQ-RR-009 — A budget overrun degrades to a valid prefix plus one marker

**If** an action would exceed the 24-hour timestamp limit, the 2000-action limit,
the per-action schema limits or the 8 MiB compact-JSON budget, **then** the
recorder shall drop that action, record a single deduplicated
`session-persistence-budget` unnamed write, and keep recording; and **if** the
pretty-printed persisted form still does not fit at Stop, it shall trim the
newest actions one at a time until it does, leaving an earlier valid prefix.

_(`recorder/recorder.ts:251-260` (`noteSessionBudgetExceeded`), `:264-325` (`snapshotAction`), `:442-473` (`stopIn`), `schema.ts:26-47` (`MAX_SESSION_JSON_CHARS`);
guarded by `recorder.test.ts:1555` "keeps at most the schema action limit and reports one fidelity marker", `:1567` "drops schema-oversized actions without letting repeated events flood markers", `:1582` "drops actions after the timestamp limit with one fidelity marker", `:1596` "rejects an action that would exceed the whole-session JSON budget".)_

### REQ-RR-010 — A finished session detaches when the workspace diverges

**When** any top-level command that does not declare `preservesFinishedSession`,
any unclaimed history write, or any synthetic snapshot action occurs while no
recording is active, the recorder shall clear the last finished session — so an
export can never embed steps describing a different flame from the one it
rendered.

_(`recorder/recorder.ts:416-428` (`lastFinishedSessionIn`), `:598-603` (`preservesFinishedSession`), `:654-661` (`commandDepth`), `:816-818` (`fromPreview`), `:847-849` (`commandDepth`);
guarded by `recorder.test.ts:1996` "finished-session export association".)_

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

<!-- cite-check: pinned a5c2f26f -->

> **Fixed deviation** (#90, `b6838992`; this note describes the code at `a5c2f26f`): `packages/app/src/MainWorkspace.tsx:2388-2396` passes the
> **raw** `timeline` to `useWorkspaceAnimationGen`, not the `recorderTimeline`
> built at `MainWorkspace.tsx:3061`. `runTimelineSnapshotMutation`
> (`recorder/timelineActions.ts:24-33`) finds no `RECORDER_SNAPSHOT_MUTATION`
> symbol on a raw timeline and falls back to `timeline.runWithSingleUndo`, so
> Randomize Animation and Smart Animation
> (`hooks/useWorkspaceAnimationGen.ts:217`, `:241`) emit **no** synthetic action
> today: they still produce one undo step, but a session recorded over them
> replays without the animation they generated.

<!-- cite-check: live -->

_(`recorder/timelineActions.ts:30-39` (`runTimelineSnapshotMutation`), `:87-119` (`recordSnapshotMutation`), `:377-419` (`removeAllKeyframesForPath`); the facade is
guarded by `timelineActions.test.ts:262` "records a compound edit as one snapshot and preserves its return value", `:289` "keeps the semantic origin of a value-pinned compound edit" and `:373` "does not emit a phantom snapshot for a no-op compound edit" — none of which
reaches the MainWorkspace wiring above.)_

### REQ-RR-012 — Paused frame stepping is authored; playing advance is not

**While** the timeline is playing, `advanceFrame` shall pass straight through to
the raw timeline so the render loop's wall-clock playback stays outside the
semantic log; **while** it is paused, the same button shall dispatch a
deterministic `timeline.setCurrentFrame` seek that replays like clicking the
ruler, wrapping at the configured loop bounds.

A frame the render loop advances while the timeline plays is part of that
playback, not a seek of its own, so the raw timeline reports neither a transport
marker nor a step for it. It does count it: the frames a playback advanced
since it started, for as long as the playhead is where the last advance left
it, so the stop that ends the playback can say how far it got (REQ-RR-040). A
seek, or anything else that moves the playhead, restarts the count.

_(`recorder/timelineActions.ts:196-220` (`setCurrentFrame`), `utils/timeline.ts:704-709` (`setCurrentFrameRaw`),
`:1437-1473` (`advanceFrame`); guarded by `timelineActions.test.ts:439` "records paused
previous/next buttons as deterministic frame actions" and `recorder.test.ts:2057`
"records direct Play and Pause as steps that pin the frame", whose Pause
carries the count.)_

### REQ-RR-013 — Action timestamps are non-decreasing

**If** any action's `t` is strictly less than its predecessor's, **then**
`validateSession` shall reject the whole session. Equal timestamps are accepted:
that is how a companion pair says it is one gesture and not two.

_(`recorder/schema.ts:308-317` (`initialAudio`), `:343-350` (`RecordedSession`); guarded by `recorder.test.ts:1659`
"rejects malformed payloads".)_

### REQ-RR-014 — Only registry-shaped command ids, never history commands

**If** a session contains an action whose id does not match the registry grammar
— lowercase-letter first character, alphanumerics with single non-repeating
`.`/`-`/`_` separators and no trailing separator — or whose id is `history.undo`
or `history.redo`, **then** `validateSession` shall reject the whole session
rather than let an imported file operate on the viewer's own history stacks.

_(`recorder/schema.ts:48-71` (`isCommandId`), `:364-374` (`isSessionJsonLengthValid`); guarded by `recorder.test.ts:1435`
"accepts bounded symmetry edges and rejects imported history commands".)_

### REQ-RR-015 — Every session field is bounded before it is retained

A session shall be rejected unless the whole compact JSON is at most 8 MiB, the
file at most the same in bytes, actions at most 2000, each `t` in
`[0, 86_400_000]`, `args` at most 16 entries, `id` at most 128 characters,
`label` at most 4096, `focus` at most 512, `note` at most 16_384, `holdMs` in
`[0, 600_000]`, and the number of sonification model transitions across the take
at most 16 — the last so a hostile zero-gap session cannot force hundreds of
synchronous Web Audio graph rebuilds on replay.

_(`recorder/schema.ts:26-47` (`MAX_SESSION_JSON_CHARS`), `:73-112` (`RecordedActionSchema`), `:308-349` (`initialAudio`); guarded by
`recorder.test.ts:1659` "rejects malformed payloads" and `:1820` "bounds
synchronous sonification model graph transitions".)_

### REQ-RR-016 — Untrusted payloads are rejected, not silently normalized

**If** an imported `initialView.paletteRestoreColors` carries more entries than
the transform limit or any key that is not a safe flame entity id — including
prototype keys that Valibot would omit from a record output — or **if** the
embedded `initial` does not survive `tryValidateFlame` (which dispatches 2D vs 3D
and migrates older saves), **then** the whole session shall be rejected, rather
than accepted as a different, quietly repaired session.

_(`recorder/schema.ts:117-175` (`animated`), `:289-306` (`RecordedSessionShellSchema`), `:351-356` (`parseSession`), `:376-378` (`initialView`); guarded for
the round-trip half by `recorder.test.ts:1638` "round-trips through
serialize/parse".)_

### REQ-RR-017 — Snapshot origins are a closed vocabulary

**If** a value-pinned action's origin argument is not a plain object whose only
keys are `kind` and `detail`, whose `kind` is one of the 22 declared origins, and
whose `detail` (when present) is a 1–160 character string, **then** the origin
shall be discarded. Captions and follow-cam hints for a snapshot action shall be
derived from the validated `kind` alone, so an imported session can never smuggle
a selector or an arbitrary focus hint into the replay UI.

_(`recorder/snapshotOrigin.ts:20-46` (`file`), `:60-90` (`SnapshotOrigin`), `:96-179` (`Randomize`); guarded by
`snapshotOrigin.test.ts:36` "rejects unknown, oversized, and prototype-bearing
imported values" and `:56` "never accepts a caller-provided focus selector".)_

### REQ-RR-018 — Replay preflights everything, and refuses to run while recording

**When** a session is replayed — instantly, step by step, or into the video
driver — every action shall be preflighted through `preflightReplayCommand`
before the baseline is loaded or any batch is opened, and a rejection shall abort
having changed nothing (the video driver throwing with the 1-based step number).
**If** a session recording is active, **then** replay shall refuse outright and
close any batch it had opened.

_(`recorder/replay.ts:199-203` (`isSessionRecording`), `recorder/player.ts:399-425` (`rejectBeforeStart`),
`recorder/replayVideo.ts:620-625` (`validatedSession`); guarded by
`player.test.ts:1142` "preflights every action before opening a batch or loading
state", `replayVideo.test.ts:150` "rejects an imported action before touching replay state", `recorder.test.ts:1535` "refuses to replay while a recording is active" and
`player.test.ts:1117` "closes an open replay batch when a recording blocks a seek".)_

### REQ-RR-019 — A replay is invisible to the recorder and lands as one undo step

**While** a replay batch is open, every applied action shall run inside
`withRecordingSuppressed`, inside the target's `withBatchWrite` so the history
attributes those writes to the replay's own preview owner, and inside
`withDeferredEffects` so intermediate states never create heavyweight resources —
and the whole run shall commit as exactly one undoable entry.

_(`recorder/replay.ts:164-203` (`withDeferredEffects`), `hooks/useWorkspaceReplay.ts:527-592` (`currentPaletteColors`); guarded by
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

_(`recorder/replay.ts:205-225` (`withRecordingSuppressed`); guarded by `replay.test.ts:235` "loads view
before an optional sonification baseline and then actions" and `:295` "leaves
target sonification untouched for a legacy session".)_

### REQ-RR-021 — Replay never re-enables audio against an unrelated resource

**When** replay applies an audio wiring snapshot, it shall first disable
reactivity, then replace the mapping and source, and shall re-enable reactivity
only where the snapshot's own requirement is met: a live analyzer for a `mic`
source, or a loaded file buffer whose current track name is a non-empty exact
match for the recorded `trackName` for a `file` source. A missing recorded track
name shall never be treated as a wildcard.

_(`recorder/replay.ts:39-77` (`canEnableReplayAudio`); guarded by `replay.test.ts:20` "enables a loaded file only when its name matches the session", `:37` "restores wiring without acquiring or relabelling a mismatched file", `:76` "keeps file reactivity off when no buffer is loaded",
`:86` "never treats a missing recorded file identity as a wildcard", `:96` "requires an existing live analyzer for microphone replay".)_

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

_(`recorder/replaySideState.ts:54-88` (`normalizeReplayPresentation`), `:90-105` (`replaySideStateChanged`),
`hooks/useWorkspaceReplay.ts:294-369` (`restoreReplaySideState`), `:546-592` (`withBatchWrite`); guarded by
`replaySideState.test.ts:75` "restores only transform presentation that belongs to the restored flame", `:110` "drops picker state whose exact transform or variation no longer exists", `:128` "does not retain side-effect snapshots for a flame-only replay", `:135` "retains side effects when timeline silent-write state changed", `:145` "retains follow-cam timeline expansion so Undo can restore collapse", `:152` "retains palette restore colours so replay Undo and Redo restore the stash", `:161` "retains authored sonification state for replay Undo and Redo".)_

### REQ-RR-023 — Palette provenance moves with the replayed document

**When** a replayed command changes what a later Palette "Unselect" may restore,
the editor-only stash shall move with it atomically: `flame.load` takes the
serialized provenance from arg 2 and otherwise clears the stash;
`recorder.restoreWorkspaceSnapshot` takes arg 2 but keeps the viewer's stash when
the action predates provenance; `flame.removePalette` clears it; and
`flame.applyPalette` captures the pre-command colours only when the stash is
empty.

_(`recorder/replayPaletteState.ts:37-68` (`paletteRestoreColorsAfterReplayCommand`), `:72-95` (`runPaletteRestoreTransition`),
`hooks/useWorkspaceReplay.ts:512-525` (`setStochasticFilterEnabled`); guarded by
`replayPaletteState.test.ts:10` "captures the first palette apply exactly and preserves it across palette switches", `:35` "clears stale colours at load and remove boundaries", `:66` "restores serialized provenance for history-compressed replay actions", `:90` "keeps legacy workspace restores but clears legacy document loads", `:111` "moves load provenance with the replaced document through undo and redo", `:144` "moves palette apply/remove provenance through ordinary undo and redo".)_

### REQ-RR-024 — The command vocabulary wins over a session's saved hint

**When** a replay step derives its follow-cam preparation, it shall re-derive the
hint from the action's command id and arguments through the central table, and
use the session's stored `focus` only where the central table has nothing to say
— so an old or generic hint recorded years ago is upgraded rather than obeyed. At
record time, a command that declares its own `focus()` shall win over the central
table.

_(`recorder/focusPreparation.ts:460-478` (`deriveReplayFocusPreparation`), `recorder/focus.ts:158-165` (`focusForCommand`), `:467-484` (`focusHintFor`);
guarded by `focusPreparation.test.ts:35` "upgrades a legacy generic variation hint from the command arguments", `:51` "trusts the replay command ids over a stale exact hint", and `focus.test.ts:18` "lets a command that declares its own focus win".)_

### REQ-RR-025 — An unsafe or unresolvable hint changes nothing

**If** a hint's transform or variation segment is not a safe flame entity id, or
its kind is not `param:`/`ui:`/`focus:`, or it resolves to no visible element,
**then** it shall be retained only as the spotlight target — which safely
resolves to no element — and shall never become workspace state. Hint values
shall be escaped for both backslash and quote before being placed inside an
attribute selector, and a selector that still throws shall be skipped rather than
aborting resolution.

_(`recorder/focusPreparation.ts:170-176` (`FINAL_AFFINE_FOCUS_ID`), `:478-480` (`spotlightFocus`), `recorder/focus.ts:60-101` (`focusSelectors`),
`:103-125` (`resolveFocusElement`), `:139-141` (`cssQuote`); guarded by `focusPreparation.test.ts:567` "does not turn an unsafe imported id into workspace state",
`focus.test.ts:264` "rejects a malformed hint instead of building a broken selector", `:269` "escapes quotes, because hints come out of user-supplied files", `:314` "resolves to null when nothing matches, so the overlay shows the canvas".)_

### REQ-RR-026 — Zero-sized matches are skipped, and targets are revealed in place

**When** resolving a hint, the first match with a non-zero bounding rectangle
shall win — a control inside a collapsed card is in the DOM, but framing it would
spotlight an empty rectangle — and revealing a target shall scroll only the
ancestors that actually clip it, using `block: 'nearest'`, `inline: 'nearest'`
and `behavior: 'auto'`, so the recorder dock and canvas do not jump and each
container's own reduced-motion policy is respected.

_(`recorder/focus.ts:103-133` (`resolveFocusElement`); guarded by `focus.test.ts:297` "skips a zero-sized
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

_(`recorder/focusPreparation.ts:373-457` (`applyContainerPreparation`), `hooks/useWorkspaceReplay.ts:370-440` (`prepareReplayFocus`);
the derivation is guarded across `focusPreparation.test.ts`, the workspace
application is not.)_

### REQ-RR-028 — The video schedule is the live player's pacing

A replay video schedule shall place each step using the same `stepGapMs` and
`closingHoldMs` the live player uses — an authored `holdMs` unclamped, a
narration hold for a step that speaks, otherwise the measured gap floored at
800 ms and capped at 2000 ms, all divided by playback speed — and shall extend
the tail to whichever is longer, the requested tail or the closing hold.
**While** the take's timeline was playing across a gap (a play window,
REQ-RR-044), that gap shall be the recorded one divided by playback speed, with
no floor, ceiling, hold or glide, so the schedule, the live player and the
full-interface capture that records the live player all give the window the
take's own length. **If** two authored actions share a timestamp, the schedule
shall still advance at least one output frame between them, and the total frame
count shall always be large enough to represent the last authored action even
when the caller asks for no tail.

_(`recorder/replayVideo.ts:424-539` (`buildScheduleSpec`), `recorder/player.ts:140-221` (`closingHoldMs`); guarded by
`replayVideo.test.ts:21` "matches replay timestamp clamping, authored holds, and speed", `:56` "gives simultaneous authored actions distinct video frames", `:70` "keeps the final step when an internal caller requests no tail", `:306` "always covers the hold the live player will take", `replayVideoPlayWindows.test.ts:77` "gives a play window its real duration, and an edit inside it its recorded time"
and `playWindowReplay.test.ts:710` "gives the interface capture the same window the player plays".)_

### REQ-RR-029 — Video export refuses takes it cannot reproduce or afford

**If** a take has no actions, references a `custom_`-prefixed variation anywhere
in its baseline flame or any action's arguments, or schedules to more than
300 000 ms, **then** both video export paths shall throw a message naming the
problem (and, for custom variations, the 1-based step) — and shall do so before
an encoder is allocated and, for the interface path, before the
privacy-sensitive screen-share picker is shown. A non-zero `unnamedWriteCount`
is not such a problem (REQ-RR-042).

_(`recorder/replayVideo.ts:61` (`MAX_REPLAY_VIDEO_DURATION_MS`), `:354-420` (`flameUsesCustomVariation`), `:424-452` (`buildScheduleSpec`), `:501-507` (`durationMs`),
`:1093-1123` (`createReplayVideoJobSpec`), `recorder/replayInterfaceVideo.ts:318-333` (`captureReplayInterfaceVideo`); guarded by
`replayVideo.test.ts:40` "refuses pathological videos before allocating an encoder", `:235` "refuses custom variation code that the portable session cannot package", `:246` "checks custom variations introduced by a later whole-flame step", `:260` "checks custom variation ids carried by semantic add steps", `:275` "refuses an empty take that has no creation sequence to publish", and the last sentence
by `:214` "publishes a take with uncaptured steps by skipping them, as replay does".)_

### REQ-RR-030 — The artwork driver renders in an isolated world with audio off

**While** an artwork replay renders, the driver shall execute each command against
a private command context holding its own flame, timeline, view, audio,
sonification, palette-provenance and Glide-switch state, and no glide runtime —
never the workspace's — shall report `canEnable: () => false` for audio so no runtime
resource is attached to a deterministic export, shall treat `timeline.play` as
a no-op, and shall rebuild from the baseline whenever a seek moves backwards,
or a frame asks for an earlier moment of the step it has already paced past
(REQ-RR-045). The plate shall be a fixed 1920×1080 landscape, matching the
framing the editor authors in.

_(`recorder/replayVideo.ts:37-42` (`landscape`), `:612-1078` (`createReplayVideoDriver`), `:760` (`play`), `:863` (`canEnable`), `:932-934` (`APART_FROM_LIVE_GLIDE`),
`:998-1003` (`lastApplied`); guarded by `replayVideo.test.ts:86` "replays registered commands
in an isolated world without mutating input", `:114` "preserves timeline write-through and renders the held frame", `:181` "builds a detached landscape MP4 without cropping the editor framing",
`replayVideoPlayWindows.test.ts:124` "renders the same frame for the same moment, in any order" and `replayGlideSwitches.test.ts:179` (`advanceTimersByTime`).)_

### REQ-RR-031 — Caption-only steps reuse the accumulated artwork frame

**While** consecutive steps leave the visual fingerprint unchanged — render
settings, transforms, final transform, palette, blend flame and weight, adaptive
and stochastic filters — the offscreen renderer shall re-encode the last
accumulated artwork frame with an updated caption and progress bar instead of
waiting for a GPU re-render that would correctly never arrive.

_(`recorder/replayVideo.ts:109-126` (`stochasticFilter`),
`components/ExportJobs/OffscreenAnimationRender.tsx:247-335` (`finish`); the fingerprint is
guarded by `replayVideo.test.ts:159` "distinguishes visual steps from captions
that can reuse artwork" — the run loop consuming it is not.)_

### REQ-RR-032 — Replay video refuses the MediaRecorder fallback

**If** the encoder created for a replay-video job reports that it fell back to
`MediaRecorder`'s wall-clock `captureStream`, **then** the job shall cancel that
encoder and fail with a message about offline encoding support — an off-line
schedule that reuses one frame many times cannot be paced by a real-time
recorder, and the fallback carries no embedded session metadata.

_(`components/ExportJobs/OffscreenAnimationRender.tsx:193-200` (`frameIndex`), `:214-223` (`audioBuffer`).)_

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

_(`recorder/replayInterfaceVideo.ts:160-206` (`onError`), `:339-352` (`source`), `:378-387` (`bitmap`), `:436-444` (`width`);
guarded by `replayInterfaceVideo.test.ts:113` "captures the ordinary replay after
the source is active and cleans up" and `:191` "aborts safely when tab sharing
stops before replay completion".)_

### REQ-RR-034 — The embedded session is snapshotted at export initiation

**Where** the user has left "embed steps" on and a finished session exists, each
of the four export paths — the dialog's PNG job, the no-dialog quick export, the
inline MP4 export and the offscreen MP4 job — shall deep-clone that session at the
moment the export starts and carry the clone through its delayed canvas callbacks
and finalizers, so a recording started while the job renders can never leak into a
file it did not produce.

_(`utils/exportPreferences.ts:17-34` (`setEmbedStepsInExports`),
`components/ExportPngDialog/ExportPngDialog.tsx:1029` (`sessionSnapshot`), `:1308` (`session`), `:1324` (`sessionSnapshot`),
`components/ExportJobs/ExportJobHost.tsx:139-144` (`encodedSteps`),
`utils/animationExport.ts:372-380` (`embedMetadata`); guarded by `exportPreferences.test.ts:22`
"keeps the initiation-time recording after the current session changes", and by
`flameInPng.test.ts:134` "carries the flame and the session in separate chunks" / `flameInMp4.test.ts:94` "round-trips the flame and the session together" for the round-trip.)_

### REQ-RR-035 — Only metadata the export dialog changed is written back

**When** an export is confirmed, the dialog shall compare its private preview
metadata against the workspace flame's and commit a patch containing only the
fields that differ, through the semantic metadata command — so the whole Export
gesture is one recorder action and one history entry, and an untouched field is
never rewritten.

_(`components/ExportPngDialog/metadataCommit.ts:11-28` (`commitChangedExportMetadata`),
`ExportPngDialog.tsx:1280-1284` (`commitChangedExportMetadata`), `:1314-1318` (`commitChangedExportMetadata`); guarded by
`metadataCommit.test.ts`.)_

### REQ-RR-036 — Motion blur accumulates sub-frames inside one output frame

**Where** `motionBlurSamples` is greater than 1, the animation export shall split
each output frame into that many sub-frames offset by
`(index / samples) × (shutterAngle / 360)` frames, advance the playhead and
re-resolve the flame for each, and accumulate them into the same render buffer by
gating each sub-frame on a cumulative point budget of
`round(((index + 1) / samples) × limit)` — capturing only once the final
sub-frame's full budget is reached.

_(`utils/animationExport.ts:179-271` (`motionBlurSamples`).)_

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

_(`utils/animationExport.ts:350-357` (`restoreFlameState`), `:387-401` (`setAnimationExportCancel`), `:399-415` (`cleanup`).)_

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

_(`utils/animationExport.ts:159-172` (`forceAnimationExportNow`), `:237-289` (`ExportInfo`),
`components/ExportJobs/OffscreenAnimationRender.tsx:379-406` (`actionIndex`), `:388-396` (`encodeFrame`),
`components/ExportJobs/ExportJobHost.tsx:180-205` (`handleExport`), `utils/exportJobs.ts:263-265` (`requestJobForceExport`),
`:295-302` (`dismissJob`).)_

### REQ-RR-040 — Play and Pause are steps that pin the frame

**When** the timeline's playing state changes while a take is recording —
through Space, the transport buttons, a workspace flow that pauses the raw
timeline, or a non-looping playback that runs off its end and stops itself —
the recorder shall append `timeline.setPlaying(playing, frame)` carrying the
frame playback started or stopped on, and shall count no unnamed write for it.
A stop shall also carry the frames the playback advanced (REQ-RR-012),
`timeline.setPlaying(false, frame, advanced)`, so a replay can play the window
at the pace it ran (REQ-RR-044). **When** a take stops while its timeline is
still playing, the recorder shall end it on
`timeline.setPlaying(true, frame, advanced)`, labelled "Still playing at frame
N", where the playback had got to. A Pause with nothing playing is not a change
and shall record nothing. **While** a command is running, or recording is
suppressed, or the seat is the one an Arcade agent drives, the change shall not
be recorded. **When** a replay applies the step, it shall seek to that frame and
then play or pause, so a replay pauses exactly where the take paused; the count
changes nothing the step does, and the replay policy shall accept the step with
or without it. **When** a replay rebuilds from the baseline, the workspace
target shall pause first, because every take starts paused. `execute_command`
shall refuse the step live (`agentCallable: false`).

_(`utils/timeline.ts:1437-1473` (`advanceFrame`), `:1493-1527` (`play`), `recorder/recorder.ts:442-446` (`stopIn`),
`:883-932` (`Playback`), `recorder/documentWriteHook.ts:89-105` (`playbackProbes`),
`recorder/transportStep.ts:14-29` (`TIMELINE_PLAYBACK_COMMAND_ID`), `commands/builtins/timeline.ts:503-532` (`reportTimelinePlaybackIn`),
`commands/registry.ts:590-594` (`agentCallable`), `hooks/useWorkspaceReplay.ts:476-480` (`loadInitial`); guarded
by `timelineActions.test.ts:613` "records Space pressed twice as two steps and
replays to the paused frame", `:659` "pins the frame a playback stops on when
it reaches the end by itself", `:694` "records a pause that a workspace flow
makes on the raw timeline", `:721` "leaves the playback of the seat an Arcade
agent drives out of its take", `playWindowReplay.test.ts:509` "ends a take
stopped while playing on the frame the playback had, still playing", and
`commands/builtins/timeline.test.ts` "timeline.setPlaying".)_

### REQ-RR-041 — Every uncaptured step is saved by name

**When** a take counts an uncaptured step, the recorder shall keep when it
happened (take time, held to the session's timestamp range) and why, in words a
person can read: the history entry's own description for an edit made outside
the commands, the command's label for a command that is not a step, and which
case an unreplayable undo or redo is (an edit from before recording started,
nothing left to undo, a history with no journal stamps). A command that changes
nothing a replay reproduces (`preservesFinishedSession`: every `export.*`
command) shall count as no uncaptured step and end no coalescing run, while
one that does, such as `timeline.play`, still counts. A finished session
shall carry them as `uncapturedSteps`, in order, next to the count, which stays
for readers that predate the list. The list shall name at most as many steps
as a take can hold actions and shall never name more steps than the count;
`validateSession` shall refuse a file that does. While a take records, the
recorder shall hold no more names than that and count the rest, so a flood of
unrouted writes moves only the count. **When** the take stops with any, the
recorder shall write the named list to the console. The recorder
controls (while recording), each library entry and the replay panel shall open
the count into the list, each line reading "reason, at m:ss"; **if** a session
carries a count but no list, **then** they shall say "Details were not saved by
the version that recorded it."

_(`recorder/uncapturedSteps.ts:20-74` (`UncapturedLog`), `:94-150` (`summarizeUncapturedSteps`), `recorder/recorder.ts:213` (`uncapturedSessionFields`),
`:225` (`uncapturedJsonChars`), `:470-471` (`uncaptured`), `:742-752` (`claiming`), `:927-952` (`snapshot`), `recorder/schema.ts:273-286` (`UncapturedStepSchema`),
`:338-340` (`uncapturedSteps`), `:435-441` (`unnamedWriteCount`), `commands/builtins/history.ts:81-92` (`unreplayableHistoryReason`),
`components/SessionRecorder/UncapturedSteps.tsx:19-46` (`session`); guarded by
`recorder.test.ts:2143` "saves each one with the time it happened and why it was not captured", `:2176` "names an undo that has nothing left to undo", `:2190` "names each one while the take is still recording", `:2203` "logs the named list when the take stops",
`uncapturedSteps.test.ts`, `SessionRecorderControls.test.tsx:307` "names each uncaptured step while the take records",
`SessionLibraryPanel.test.tsx:53` "names the steps each saved take did not capture", `SessionReplayPanel.test.tsx:255`, `:264` (`session`),
and `recorder.test.ts` "an export during a take".)_

### REQ-RR-042 — An export skips uncaptured steps, and says so before it starts

**When** the viewer starts a video export of a take with uncaptured steps, the
replay panel shall first show, in place of starting, how many steps the video
skips, from which replay step on it may differ from the take (or that its
finished flame may, or simply that it may when the names were not saved), and
the named list; the export button shall read "Export anyway" or "Record anyway"
and the next press shall start the export, on that press's own stack so a
full-interface capture keeps its user activation. Cancel shall leave nothing
started. Both export paths shall then run the take the way the in-app replay
does: the uncaptured steps are not in `actions`, so there is nothing to apply
for them, and the embedded session keeps their count and names.

_(`components/SessionRecorder/SessionReplayPanel.tsx:681-688` (`unnamedWriteCount`), `:782-790` (`confirmingSkips`),
`components/SessionRecorder/UncapturedSteps.tsx:53-82` (`ExportSkipNotice`),
`recorder/uncapturedSteps.ts:159-172` (`describeExportSkips`), `recorder/replayVideo.ts:1100` (`uncaptured`),
`recorder/replayInterfaceVideo.ts:324` (`uncaptured`); guarded by `replayVideo.test.ts:214` "publishes a take with uncaptured steps by skipping them, as replay does",
`replayInterfaceVideo.test.ts:162` "records a take with uncaptured steps instead of refusing it", `SessionReplayPanel.test.tsx:302` "lists what an artwork export will skip before it starts",
`:348` "starts a full-interface capture on the click that accepts the skipped steps".)_

### REQ-RR-043 — A picked blend partner is recorded with the weight it showed

**When** a partner is picked in the blend gallery, the workspace shall first
put back what the hover preview replaced, an absent weight included, and then
run `flame.setBlendFlame(partner, 0.4)`: one step that names the default
weight the preview showed, so a replay lands on the blend the viewer saw, and
one history entry that spans the document from before the hover, so one undo
returns to exactly that, partner and weight. A pick made without a hover (a
touch, or Enter on a tile) shall record the same step. A morph set up from a
hovered partner shall put the preview back the same way before
`flame.setupMorph` runs, and a hover on a later visit to the gallery shall put
back the pick rather than the document from before it. **When** the gallery
is left any other way while a preview shows, the workspace shall put back the
same, so the document and its undo stack are as they were before the hover and
a take across it has nothing uncaptured and replays to that document: an
Evolve or Diff pick, which shall end the preview before the view it opens reads
the document; the gallery going away under a still pointer, as when the sidebar
closes or another panel or the Home hand-off takes its place; Home or the
Arcade covering the workspace; and the page being hidden. **When** `flame.setBlendFlame` runs without a weight, as an older take or an agent may,
a document that already has a weight shall keep it, whether or not it had a
partner, and only a document with no weight shall start at the default; a
weight it is given shall be held to 0..1 and win. The replay policy shall
accept the one- and two-argument forms and refuse a weight outside 0..1. The
creation synthesizer shall name the target's weight on the partner's step, and
shall treat a missing weight as 0, which is how everything that draws reads it:
a partner saved without a weight is rebuilt at 0, without a snap. The weight is
the edited flame's share of the blend: 0 draws the partner alone.

_(`flame/blend.ts:17` (`DEFAULT_BLEND_WEIGHT`), `hooks/useWorkspaceBlendPick.ts:200-300` (`FlameDescriptor`),
`commands/builtins/flame/coreCommands.ts:36-75` (`history`), `commands/registry.ts:288-296` (`setBlendFlame`),
`recorder/synthesize/atoms.ts:523-556` (`blendFlame`), `canonical.ts:19-56` (`comparable`),
`MainWorkspace.tsx:1328-1333` (`setupMorph`), `components/BlendFlameGallery/BlendFlameGallery.tsx`,
`components/WorkspaceSidebar/WorkspaceSidebar.tsx` `onSelect`; guarded by
`WorkspaceSidebar.gallery.test.tsx`, `useWorkspaceBlendPick.test.tsx:152` "commits the weight its preview showed, replays to it, and undoes to the document before the hover",
`:190` "gives a pick made without a hover, as on a touch screen, the same weight", `:177` (`setBlendFlame`), `:231` "puts back the pick, not the document before it, when a later hover leaves", `:287` "puts back exactly what a hover replaced when the pointer leaves", `commands/builtins/flame/blend.test.ts:52` "gives the default weight to a document that has none",
`:68` "keeps a weight the document already has when its first partner names none", `:79` "keeps the weight when an existing blend swaps its partner", `:88` "lets a weight it is given win, over none or over the one the document has", `:116` "replays a weight from 0 to 1 and refuses anything else", `:143` "replays a take recorded before picks carried a weight at the weight the viewer saw" and `planCreation.test.ts:209` "builds a blend at the weight the target has", `:230` "rebuilds a partner saved without a weight, which draws as weight 0",
`:252` "adds no blend step to a flame without a blend".)_

### REQ-RR-044 — A play window replays at the pace the take played it

A play window is a stretch of a take in which its timeline played: from a Play
step, or a seek made while playing, to whatever next stops or moves the
playhead — the Pause, a seek, another Play, or the end of the take.

**While** a replay is inside a play window, the player shall wait the take's own
time for the next step, divided by the replay speed (REQ-RR-028), shall keep the
timeline's own clock (the interval advance and the auto-FPS advance) off the
playhead, and shall put the playhead on every animation frame where the take
had it at that moment, so the step that ends the window finds it on the
recorded frame with no jump. The live player and the artwork video
(REQ-RR-045) shall share one pace:

- a window whose stop recorded the frames it advanced (REQ-RR-040) shall
  spread that count evenly across the window, loops included;
- a count that does not reach the recorded end frame shall be distrusted,
  unless a step inside the window changed the loop range, and then the count
  wins;
- a window without a count (a take recorded with the two-argument form, a
  window a seek ended, a window the take never closed) shall be estimated from
  the take's measured rate over the windows that carry a count, or from the
  configured fps and time scale when none does;
- advances past the end frame shall wrap to the start frame on a loop, and stop
  there once without one, as `advanceFrame` does.

**When** a step inside the window runs, such as an edit made while playing, it
shall run at its recorded time with the playhead on the frame the take had then.
**When** the replay speed changes inside a window, the take's clock shall
re-anchor at once and re-time the step it waits for. **When** the viewer pauses
the replay inside a window, the playhead shall stay, paused, where the take's
clock stopped, and Resume shall carry on from that moment. **When** the viewer
seeks to a step inside a window, the playhead shall go where the take had it at
that step, playing on only while the replay plays. **When** the replay
finishes, the timeline shall get its own clock back, and a
take that ended still playing leaves it playing. **When** it ends early inside a
window, because it is stopped or closed (the full-interface export's cancel and
failure included), a step fails, or the viewer takes the document over, the
timeline shall pause on the frame it has, as no step of any take, and then get
its own clock back; the Play/Pause toggle (Space, the transport button) that
took the replay over there shall leave it paused, as the press meant. A hold, a narration or a glide inside a
window is not waited for.

_(`recorder/playWindows.ts:83-150` (`planPlayWindows`), `recorder/playWindowPace.ts:18-178` (`nominalFramesPerMs`),
`recorder/playerPlayWindows.ts:34-138` (`createPlayerPlayWindows`), `recorder/player.ts:185-193` (`stepGapMs`),
`:294-305` (`createPlayerPlayWindows`), `:339-346` (`preserveBaseline`), `:385-408` (`rejectAction`), `:455-470` (`runStep`), `:548-553` (`reset`), `:608-652` (`finish`),
`:680-681` (`holdAt`), `:717-719` (`holdAt`), `:726-733` (`stop`), `recorder/timelineActions.ts:161-167` (`togglePlay`),
`recorder/replayPlayback.ts:13-35` (`timelineReplayPlayback`), `recorder/replay.ts:171-184` (`playback`),
`hooks/useWorkspaceReplay.ts:456-459` (`replayTarget`), `flame/Flam3.tsx:595-604` (`createEffect`), `:1251-1258` (`isAutoFpsReady`),
`utils/timeline.ts:729-731` (`setIsPlaying`); guarded by `playWindows.test.ts`,
`playWindowPace.test.ts`, and `playWindowReplay.test.ts:210` "plays five seconds
as five seconds and lands on the Pause frame with no jump", `:254` "wraps a looping playback as often as the take did", `:290` "reproduces a render loop slower than the configured fps",
`:326` "stops a non-looping playback where the take ran off its end", `:362` "starts a new window at a seek made while playing", `:398` "lands an edit made while playing at its recorded time and frame", `:431` "keeps the Pause frame when the replay speed changes inside the window", `:454` "holds the playhead through a replay Pause and resumes from it", `:482` "seeks into a window paused and restarts it from the baseline", `:508` "ends a take stopped while playing on the frame the playback had, still playing", `:547` "still replays a take recorded before the Pause carried its count", `:629` "pauses on the frame it had when the replay is closed", `:643` "pauses on the frame it had when the viewer takes the document over", `:658` "pauses on the frame the failed step ran on", `:687` "pauses on Space pressed inside the window, as the press meant", and
`SessionReplayPanelGlide.test.tsx:212` "pauses the timeline where it is when the export is cancelled", `:232` "pauses the timeline where it is when the capture fails".)_

### REQ-RR-045 — The artwork video plays a play window frame by frame

**While** an output frame of an artwork replay video falls inside a play window,
the schedule shall give it the take time it shows (the step's recorded time plus
the frame's own time since that step, times the playback speed, never past the
next step), each such frame shall be a state run of its own, and the driver
shall pose the timeline on the frame the shared pace (REQ-RR-044) gives that
time. The animation shall so advance frame by frame through the window, an edit
made while playing shall land at its recorded time and frame, and the frame a
Pause shows shall be the recorded one. The same moment shall render the same
frame in whatever order the job asks for it. A take that ended still playing
shall keep moving through the tail, and a take that never played shall render
as before. A window of D seconds lasts D / speed seconds of video, so a long
one can take a take past the 300 s limit (REQ-RR-029), which a faster speed
fits.

_(`recorder/replayVideo.ts:442-539` (`createReplayVideoSchedule`), `:548-610` (`replayStateAtFrame`), `:647-659` (`pacer`), `:987-1049` (`advanceTo`),
`components/ExportJobs/OffscreenAnimationRender.tsx:64` (`takeMs`), `:327` (`advanceTo`); guarded by
`replayVideoPlayWindows.test.ts:77` "gives a play window its real duration, and an edit inside it its recorded time", `:93` "moves the playhead frame by frame through the window onto the Pause frame", `:114` "applies the edit at the frame the take made it on", `:124` "renders the same frame for the same moment, in any order", `:137` "keeps a take that ended still playing moving through the tail", `:149` "leaves a paused take exactly as it was",
`:164` "refuses a window longer than the video limit, and fits it at a faster speed".)_

### REQ-RR-046 — Every replay hands the viewer's Glide switches back

**When** a workspace replay runs its first step, the player shall keep the
viewer's Glide switches, `{enabled, quality}` (`captureGlideSwitches`), let the
take's own `glide.setEnabled` and `glide.setQuality` steps switch them while it
runs, set them back before a rebuild replays the steps up to a seek point, and
put them back (`restoreGlideSwitches`) when the replay ends, however it ends:
finished, stopped or closed, a step failing, or the viewer taking the document
over. A replay Pause shall keep the take's switches until the replay ends.
**When** the viewer flips a switch themselves during the replay (through an
agent of their own), found as a switch other than the replay last left it, that
flip shall be kept, each switch on its own: it is their setting from then on,
the one a rebuild starts from and the one the end puts back, though the take's
later steps may still switch it while the replay runs. A switch the viewer set
to the value it already had is no flip. A flip is no edit either: both switches
declare `preservesFinishedSession` (REQ-RR-010), so a flip made while the replay
is paused shall leave the live workspace mutation stamp where it was, and
Resume shall carry on from the paused step rather than rebuild the take from
its start; a flip shall not detach the last finished take from its document.
Nor shall a flip take a playing replay over: both switches are
`presentationSwitch`, so a live run skips `beforeCommand`, the replay plays on
without a rebuild and glides its next step at the flipped setting, and
`execute_command` lets a glide in flight finish rather than settle it. Every
other live command, the export dialog openers and render commands included,
shall still hand a playing replay back before it runs.
The full-interface export records that same player, so its switches shall go
back when the capture succeeds, is cancelled, or fails while the replay runs.
The artwork export's driver, the
synthesize sandbox, a duel seat and the Home portal shall give their command
context switches of its own that change nothing, and no glide runtime
(`APART_FROM_LIVE_GLIDE`), so a Glide step run there never reaches the
viewer's switches and a `glide.toFlame` never settles or animates the live
canvas: the step lands on its flame in one move there, and the artwork export
glides it on its own plans (REQ-RR-045). A seat and the portal have canvases of
their own but no glide of their own: a duel refuses transitions, and the
portal's tours animate through their own `animateValue`.

_(`recorder/replayGlideLease.ts`, `recorder/player.ts:306-308` (`glideLease`), `:361-367` (`openBatch`),
`:455-470` (`runStep`), `:548-553` (`reset`), `:608-615` (`finish`), `:726-733` (`stop`),
`commands/builtins/glide.ts:14-17` (`context`), `:44-46` (`preservesFinishedSession`), `:50` (`setGlideEnabled`), `:61-62` (`preservesFinishedSession`), `:65` (`setGlideQualityPreference`), `:98` (`runtime`),
`commands/types.ts:315-323` (`glideSwitches`), `:351-361` (`reproduces`), `:369-374` (`presentationSwitch`),
`commands/registry.ts:537-543` (`beforeCommand`), `webmcp/tools/executeCommand.ts:286-295` (`presentationSwitch`),
`flame/glide/types.ts:181-188` (`GlideDriver`),
`recorder/recorder.ts:597-603` (`isTopLevel`),
`recorder/replayVideo.ts:932-934` (`APART_FROM_LIVE_GLIDE`), `recorder/synthesize/sandbox.ts:125-127` (`APART_FROM_LIVE_GLIDE`),
`seats/seat.ts:279-280` (`APART_FROM_LIVE_GLIDE`), `components/Home/portalScript.ts:219-220` (`APART_FROM_LIVE_GLIDE`),
`components/SessionRecorder/SessionReplayPanel.tsx:185-190` (`exportTookReplay`), `:714-729` (`setExportError`),
`flame/glide/runtime.ts:410-433` (`captureGlideSwitches`); guarded by `replayGlideSwitches.test.ts:98` "follows the take while it plays and hands them back when it finishes",
`:111` "hands them back when the replay is closed midway", `:122` "hands them back when a step fails", `:136` "hands them back when the viewer takes the document over", `:160` (`isFinished`), `:166` "keeps a switch the viewer flips while paused, though the take flips it again", `:187` "resumes a paused replay where
it paused after a live glide.setQuality", `:212` "seeks forward from a paused replay after a live flip without a rebuild", `:230` "keeps the last finished take on the document it describes", `:261` "still rebuilds a paused replay after a live edit", `:281` "keeps the switch the viewer flips and puts back the one they left", `:301` "keeps the viewer's flip through a seek that rebuilds the take",
`:330` "plays on through a live glide.setQuality, and keeps the flip", `:351`
"still hands a playing replay back to open export.png", `:366` "sets them as the take had them at the step a seek lands on", `:413` "never reaches the live glide while the artwork export glides into a flame", `:427` "never reaches it while the synthesize sandbox checks the take", `:435` "leaves the viewer's switches alone while the artwork export replays", `:441` "leaves them alone while the synthesize sandbox checks a take", `:471` "never reaches the live
glide or switches through a duel seat", `replayGlideQuality.test.ts:182` "glides
the next step at a tier the viewer flips while it plays",
`executeCommand.test.ts:458` "lets a glide in flight finish through glide.setQuality", `SessionReplayPanelGlide.test.tsx:148` "hands them back when the export succeeds",
`:163` "hands them back when the export is cancelled midway", `:179` "hands them back when the capture fails while the replay runs".)_

### REQ-RR-047 — The artwork export glides at the take's own Glide quality

**While** an artwork replay video glides into step N, the glide's length
(`glideMsForAction`, in the schedule of REQ-RR-028) and the quality its moving
frames render at (`glideFrameQuality`) shall be those of the tier the take has
in force once step N ran, as the live replay's are: the viewer's own Glide
quality switch when Export was pressed (`preference`, flips kept, whatever the
take had switched by then), switched by the take's `glide.setQuality` steps,
and under `auto` resolved on the quality preset of the take's initial view and
its `view.setQualityPreset` steps, or, where the take has none, the tier the
viewer's own preset gave. The live player shall time the glide into a step
once the step ran, so the glide it plays, the dwell after it subtracts and the
tier it renders at are the same tier, and the two replays give every step the
same glide length and the same step times. A take's `glide.setEnabled` step
shall change neither replay's glides, which follow the replay panel's toggle.
A job queued before the preference travelled with it shall start at the tier
it recorded. The export's driver shall plan each glide with the inputs the live
runtime plans that step's glide with: the step's glide length and tier from the
schedule (`glideMs`, `glideTiers`), so both replays straighten, frame and
downshift a glide alike. Two exports of one request shall produce the same job and
schedule.

_(`recorder/glide.ts:48-50` (`GlideQualityPreference`), `:82-109` (`presetOf`), `recorder/replayVideo.ts:84-86` (`glideMs`),
`:453-459` (`spec`), `:527-528` (`glideMs`), `:569-577` (`replayFrameQuality`), `:612-615` (`createReplayVideoDriver`), `:1058-1075` (`glidePlanFor`),
`flame/glide/runtime.ts:232-236` (`planned`),
`components/ExportJobs/OffscreenAnimationRender.tsx:56` (`createReplayVideoDriver`), `:69-85` (`Quality`), `:329` (`setPerFrameQuality`),
`recorder/player.ts:518-529` (`settled`), `:243` (`viewerGlideSwitches`), `:739` (`viewerGlideSwitches`), `recorder/replayGlideLease.ts:22-24` (`GlideSwitches`),
`:66-69` (`viewer`), `components/SessionRecorder/SessionReplayPanel.tsx:705-711` (`glide`); guarded
by `replayGlideQuality.test.ts:175` "glides into each step at the tier in force once it ran, live", `:196` "gives the same glide lengths and
step times as the live replay", `:207` "plans each glide with the inputs the
live replay plans it with", `:226` "renders each glide frame at its step's tier and each settle at full", `:252` "makes two exports of one take identical, whatever the switches do after", `recorder/glide.test.ts:114` "starts from the viewer's switch and follows the take's", `:129` (`reads`),
`:149` "holds an export queued before the preference was sent to its tier", `replayGlideSwitches.test.ts:242` "names the viewer's own switches for an export, whatever the take holds".)_

### REQ-RR-048 — A replay never exports

**When** a live replay runs a take's `export.renderImage` or
`export.renderAnimation` step, as a hand-written take can carry, it shall queue
no render: the command context it runs steps against has no export host, so
the step runs in its place, with its label and its spotlight, and changes
nothing; the export job store is untouched. The full-interface export records
that same replay, so it queues none either. The artwork export's driver and the
synthesize sandbox have no export host to begin with. Outside a replay,
`execute_command` shall still queue the render.

_(`hooks/useWorkspaceReplay.ts:184-186` (`replayRunsExports`), `:443-454` (`workspace`),
`commands/builtins/export.ts:75-79` (`execute`),
`:109-113` (`execute`), `commands/types.ts:287-307` (`Background`); guarded by
`useWorkspaceReplay.exportStep.test.ts:187` "queues nothing when the live
replay plays it, and keeps its place", `:209` "still renders when an agent runs it live, outside a replay", `:220` "cannot render in the artwork export or the synthesize sandbox".)_

### REQ-RR-049 — A change that glides itself glides once

A command may animate its own change through the glide runtime whatever the
Glide switch says, and declares it (`glidesItself`); `glide.toFlame` is the
one that does. **When** such a command runs, exactly one glide shall present
its change, the command's own, and it shall land on the command's target:

- `execute_command` shall neither settle nor glide around it. The command
  settles the glide in flight itself, keeping the frame the viewer could see.
  Its duration shall be the command's own duration argument; else the call's
  `glideMs` (clamped; `0` or less is no glide), passed down as that argument;
  else the planner's duration for the change at the viewer's Glide quality
  tier, whether the Glide switch is on or off. The call shall await that glide
  and report a deadline landing as it does for any glide.
- A live run shall record the duration its glide takes as the command's
  argument, so the take replays the same glide for the same time.
- **While** a replay's Glide switch is on, the player shall pass the duration it
  would have glided for down to the step (`glideMsForAction`, where the step's
  own recorded duration comes first, ahead of an authored `glideMs`, a hint and
  the default) and glide nothing itself; the artwork export's schedule shall
  time the step from the same number. **While** it is off, the step shall run
  as recorded.
- A rebuild (a seek) glides nothing, so it shall run such a step with no glide:
  a glide left running there wrote its frames over the steps rebuilt after it.

**When** a glide starts while another is in flight, the runtime shall first land
the one in flight on its settle, which resolves the promise its caller awaits
and clears its wall-clock deadline, and only then read the document for the new
glide, so no deadline is left to land a later glide early and no glide takes
another's frame for its target.

_(`flame/glide/runtime.ts:220-225` (`landInFlight`), `:280-301` (`landInFlight`), `flame/glide/types.ts:188-193` (`plannedDurationMs`),
`commands/types.ts:326-332` (`SelfGlide`), `:375-388` (`glidesItself`), `commands/builtins/glide.ts:78-94` (`glidesItself`),
`webmcp/tools/executeCommand.ts:137-162` (`withCallGlideMs`), `:236-306` (`withCallGlideMs`), `recorder/glide.ts:53-75` (`glideMsForAction`),
`recorder/player.ts:452-472` (`runStep`), `:497-512` (`selfGlideOf`), `:560-575` (`runStep`); guarded by
`runtime.test.ts:260` "finishes the replaced glide, so its caller hears back",
`:275` "reads its target from the settled document, not from a frame", `:289` "glideTo also lands the replaced glide before reading its start", `:304` "leaves no deadline armed to cut the next glide short",
`runtimeReplaceExamples.test.ts:48` "lands every pair on its target", `executeCommandSelfGlide.test.ts:71`
"Glide on: one glide, at the planner duration, landing on the target", `:90` "glideMs: one glide, for that long, and the take keeps it",
`:107` "the command's own duration wins over glideMs and the setting", `:123` "Glide off and nothing named: the command still glides, once, awaited", `:145` "glideMs 0: no glide at all, and the take says so", `:160` "reports the command's glide when the deadline landed it", `:176` "leaves no deadline behind to cut the next glide short", and `playerSelfGlide.test.ts:90`
"Glide on: one glide, for the duration the step recorded", `:100` "Glide on, no recorded duration: one glide, for the replay's", `:111` "Glide off: one glide, the command's own",
`:119` "times the step the way the live replay glides it", `:132` "a seek rebuilds through it without a glide, keeping the steps
after it".)_

### REQ-RR-050 — A plain-flame load while playing records its Pause

**When** a flame with no animation is loaded while the timeline plays, the load
shall stop playback through the timeline's `pause()`, before the block that keeps
the load's own writes out of the take, so the take records the Pause (REQ-RR-040)
ahead of the load's timeline snapshot, and its replay shall stop the timeline
there and run the rest of the take on the stopped playhead, as the viewer saw it.

_(`MainWorkspace.tsx:2709-2712` (`withRecordingSuppressed`); guarded by `MainWorkspace.plainLoad.test.ts:17`
"stops playback through pause(), before the unrecorded block", `:23` "never stops it through the raw setter, which reports nothing", and
`playWindowReplay.test.ts:793` "records the Pause, so the replay stops where the
take did", `:818` "the raw setter it replaces left the replay playing (the bug)".)_

---

## Coverage gaps

The requirements below have **no** test whose assertion goes red when the
behaviour is violated. Several cite a test for a pure helper the requirement
depends on; that is noted where it applies, but the requirement itself is
unguarded.

| ID         | Why it is unguarded                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-RR-007 | The Arcade-pilot exemption for seeks (`recorder.ts:867` (`reportTimelineTransportIn`)) has no test of its own; the same exemption for Play and Pause is guarded (REQ-RR-040). |
| REQ-RR-011 | The facade is tested; the **MainWorkspace wiring** that decides whether the facade is used at all is not — which is how its deviation (fixed in #90) shipped.                 |
| REQ-RR-016 | Nothing constructs a prototype-bearing `paletteRestoreColors` and asserts the session is rejected rather than emptied.                                                        |
| REQ-RR-027 | `focusPreparation.test.ts` covers derivation only. Nothing tests `useWorkspaceReplay.ts:370-440` (`prepareReplayFocus`), which applies it — that hook has no test file.       |
| REQ-RR-031 | The fingerprint is tested; the state-run loop in `OffscreenAnimationRender.tsx` that consumes it is not.                                                                      |
| REQ-RR-032 | No test file for `OffscreenAnimationRender.tsx`.                                                                                                                              |
| REQ-RR-036 | `utils/motionBlur.test.ts` re-derives the arithmetic inline and imports nothing from `animationExport.ts`; it stays green for any change to the export driver.                |
| REQ-RR-037 | `utils/motionBlur.test.ts` pins the sub-frame rule; blur itself is verified by measurement only (#91).                                                                        |
| REQ-RR-038 | No test file for `utils/animationExport.ts`.                                                                                                                                  |
| REQ-RR-039 | No test file for any of the four drivers it cites.                                                                                                                            |
| REQ-RR-044 | The `pacedPlayback` guards in `Flam3.tsx` and the `useWorkspaceReplay.ts:476` (`loadInitial`) wiring are untested; tests use a stand-in render loop. Measured on a GPU.       |

Partially guarded, worth naming: REQ-RR-019, REQ-RR-022 and REQ-RR-023 are
covered where their logic lives in `recorder/`, but the `useWorkspaceReplay.ts`
half — capture, restore, and the forced commit against the real history — has no
test at all.

The pattern is one boundary: **everything under `packages/app/src/recorder/` is
densely unit-tested; what wires it into the workspace or drives a GPU/encoder is
thinly tested at best.** Measured with `wc -l` on 2026-09-23:
`hooks/useWorkspaceReplay.ts` (643 lines) is tested only for its export step
(`useWorkspaceReplay.exportStep.test.ts`);
`components/ExportPngDialog/ExportPngDialog.tsx` (1457 lines) only through
`quickExport.test.tsx` and its 28-line `metadataCommit.ts` helper; the
`components/ExportJobs/*.tsx` components (1199 lines) and
`utils/animationExport.ts` (431 lines) have no tests. Both deviations this spec
recorded lived in that band — REQ-RR-011's, fixed in #90, and REQ-RR-037's,
resolved in #91 — and none is open.
