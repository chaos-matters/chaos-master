# Arcade Beats mode — EARS requirements

**Version:** 0.9.11 (`packages/app/package.json`) — the version whose shipped behaviour this describes
**Date:** 2026-09-10
**Scope:** The audio-reactive Arcade mode shipped by PR #74: the bundled track
catalogue, the four `arcade_*` Beats tools, the `ctx.audio` facade they drive
through the command layer, and the enable/disable lifecycle of audio
reactivity around them. It does **not** cover the spectral analysis itself
(`utils/audioAnalysis.ts` — band extraction, beat detection, smoothing), the
audio-reactive panel's waveform and transport UI beyond loading and clearing a
resource, the Sonification panel (a separate synthesis surface that Beats mode
merely allow-lists), or the recorder/replay engine that a Beats take is saved
into. Where a requirement below reaches into those surfaces it does so only at
the seam Beats mode touches.

**Source:**

- `packages/app/src/arcade/bundledTracks.ts` — the two-track CC0 catalogue, its lookup and its fetch helper
- `packages/app/src/webmcp/tools/arcadeBeats.ts` — `arcade_start_beats`, `arcade_get_audio_catalog`, `arcade_set_audio_mapping`, `arcade_end_beats`
- `packages/app/src/commands/builtins/audio.ts` — `audio.applySnapshot` and the disable-first wiring swap every Beats mapping goes through
- `packages/app/src/commands/types.ts:207-226` — the `ctx.audio` facade contract, including `canEnable` as a workspace-supplied resource authorization
- `packages/app/src/recorder/replay.ts:39-52` — `canEnableReplayAudio`, the only implementation of that authorization
- `packages/app/src/MainWorkspace.tsx:3379-3396` (`audio`) — the live facade: signals, and `canEnable` wired to the decoded buffer, track name and live analyzer
- `packages/app/src/MainWorkspace.tsx:3189-3196` (`adoptAudioBuffer`) — the one writer of the audio buffer and track name, which the audio panel and Beats mode (`loadBundledTrack`, `:3225-3226` (`fetchBundledTrackBuffer`)) both go through
- `packages/app/src/components/AudioReactivePanel/AudioReactivePanel.tsx:446-494` (`handleFile`) — file decode and microphone acquisition, and their failure paths
- `packages/app/src/utils/useAudioReactive.ts` — what "enabled" actually gates: modulation, not transport
- `packages/app/src/arcade/topics.ts:305-314` (`BEATS_ALLOWED`), `:345-356` (`beatsPromptCard`) — `BEATS_ALLOWED`, `BEATS_STEP_BUDGET`, the prompt card
- `packages/app/src/arcade/guard.ts`, `packages/app/src/arcade/pilot.ts`, `packages/app/src/arcade/pilotActions.ts` — allow-list enforcement, step budget, session teardown
- `packages/app/src/components/Arcade/ArcadeModePanel.tsx:131` (`setSelectedTrack`), `:331-377` (`beats`) — the hub's track picker
- `packages/app/public/audio/` and `packages/app/scripts/generate-tracks.mjs` — the shipped WAV assets and the script that generates them

**Tests:**

- `packages/app/src/webmcp/tools/arcadeBeats.test.ts` — the four tools: refusal with no workspace, start (lock + recorder + `setEnabled(true)` + budget), catalogue shape, mode gating on the mapping tool, one valid mapping, one malformed mapping, end
- `packages/app/src/arcade/topics.test.ts:27-69` "names only registered commands, in every Arcade allow-list", `:163-189` "beats" — every Arcade allow-list names only registered commands and leaves `ALWAYS_ALLOWED` to the tools; `BEATS_ALLOWED` membership, the step-budget floor, and the prompt card's track name and tool names
- `packages/app/src/webmcp/tools/arcadeGlideSwitches.test.ts` — the presentation switches under a real Beats pilot: accepted, named in the refusal's allowed list, left out of the brief; `glide.toFlame` refused
- `packages/app/src/components/Arcade/ArcadeModePanel.test.tsx:37-55` "renders beats mode with bundled tracks and prompt card" — both bundled tracks render as chips and the selected one reaches the prompt card
- `packages/app/src/commands/builtins/audio.test.ts` — `audio.applySnapshot` as a recorded action, and the resource-identity gate on enabling replayed wiring
- `packages/app/src/recorder/replay.test.ts:19-110` — `canEnableReplayAudio`: name match, missing buffer, missing identity, microphone
- `packages/app/src/utils/useAudioReactive.test.ts` — modulation suspension only, and only on the microphone path
- _Gap:_ nothing exercises `bundledTracks.ts` beyond importing the array (14% of statements, 0% of branches), no test asserts the snapshot `arcade_set_audio_mapping` dispatches, and no Playwright spec touches Beats mode at all — `tests/arcade.spec.ts` and `tests/webmcp.spec.ts` contain no reference to beats or audio. Unguarded requirements are listed by ID under [Coverage gaps](#coverage-gaps).

---

## Requirements

### REQ-AB-001 — The catalogue is two compile-time CC0 tracks

The bundled catalogue shall be a static list of two tracks — `ember-drift`
("Ember Drift", 100 BPM, 12 s) and `cyber-pulse` ("Cyber Pulse", 120 BPM,
10 s) — each carrying `id`, `name`, `artist`, `bpm`, `duration`, `url` and
`description`, with audio served from the app's public root at
`/audio/<id>.wav`.

_(`bundledTracks.ts:15-36` (`BUNDLED_TRACKS`); assets `packages/app/public/audio/ember-drift.wav`
and `cyber-pulse.wav`, synthesised by `packages/app/scripts/generate-tracks.mjs`,
which also emits an unused `public/audio/tracks.json` mirror of the same data.)_

### REQ-AB-002 — An unknown track id resolves to nothing

**If** `getBundledTrack` is called with an id no bundled track carries, **then**
it shall return `undefined` — never throw, and never fall back to the first
track.

_(`bundledTracks.ts:38-40` (`getBundledTrack`))_

### REQ-AB-003 — A failed track fetch names the track and the status

**If** `fetchBundledTrackBuffer` receives a response that is not `ok`, **then**
it shall reject with an `Error` naming both the track and the HTTP status, and
shall not resolve to a partial or empty `ArrayBuffer`.

_(`bundledTracks.ts:50-60` (`fetchBundledTrackBuffer`))_

### REQ-AB-004 — The hub offers every bundled track, and only as prompt text

**Where** the Arcade hub's Beats panel is open, it shall render one chip per
entry of `BUNDLED_TRACKS` labelled `<name> (<bpm> BPM)`, preselect the first
entry, and feed the selected track's name into the copyable prompt card. The
selection shall reach nothing else: no workspace signal, no command, no tool
argument.

_(`ArcadeModePanel.tsx:131` (`setSelectedTrack`), `:336-351` (`Bundled`); `beatsPromptCard` at `topics.ts:345-356`)_

### REQ-AB-005 — Beats mode loads the track it advertises

**When** a Beats session starts with a bundled track named, the app shall fetch
and decode that track into the workspace audio buffer and set the workspace
track name to it, so that the snapshot `arcade_set_audio_mapping` later
dispatches satisfies `canEnable` and the flame actually moves to the music.

<!-- cite-check: pinned a5c2f26f -->

> **Fixed deviation** (#90, `f1b74bb9`; this note describes the code at `a5c2f26f`): `packages/app/src/webmcp/tools/arcadeBeats.ts:141-146` —
> nothing loads a bundled track. `fetchBundledTrackBuffer`
> (`packages/app/src/arcade/bundledTracks.ts:42`) has no call site anywhere in
> `packages/*/src`; the only writers of the audio buffer and track name are the
> panel's file picker and drop target
> (`packages/app/src/components/WorkspaceSidebar/WorkspaceSidebar.tsx:435-436`).
> `arcade_start_beats` merely echoes the resolved name back as `activeTrack`.
> With no user-loaded file the session has no audio at all, which is what makes
> REQ-AB-020 fail as well.

<!-- cite-check: live -->

### REQ-AB-006 — Starting requires a workspace that can record audio

**If** no WebMCP context is installed, **then** `arcade_start_beats` shall
return the "Workspace not ready" error; **if** a context exists but any of the
`recorder`, `arcade` or `audio` facades is absent, **then** it shall return
"This workspace does not support audio-reactive recording." In neither case
shall it start a recording or a pilot.

_(`arcadeBeats.ts:145-152` (`execute`))_

### REQ-AB-007 — One Arcade session at a time, never over a live recording

**If** a pilot is already driving, **then** `arcade_start_beats` shall refuse
with "An Arcade session is already active"; **if** the recorder is already
recording, **then** it shall refuse with "A recording is already running." Both
refusals leave the existing session and recording untouched.

_(`arcadeBeats.ts:153-162` (`agentDriving`))_

### REQ-AB-008 — A failed start leaves no orphaned recording

**If** `startPilot` refuses after `recorder.start()` has already succeeded,
**then** `arcade_start_beats` shall cancel that recording before returning the
pilot's error, so a refused start cannot leave the dock recording with nobody
driving.

_(`arcadeBeats.ts:173-193` (`started`))_

### REQ-AB-009 — A started session locks the editor and turns reactivity on

**When** `arcade_start_beats` succeeds, it shall clear narration, close the
Arcade hub, call `audio.setEnabled(true)`, and return `ok` together with a step
budget of 30, the described allow-list, the resolved `activeTrack` and the four
workflow tips. The pilot shall be recorded as `mode: 'beats'` with a `'screen'`
lock on the default seat and the quality preset rank captured at start.

_(`arcadeBeats.ts:180-216` (`briefed`); `BEATS_STEP_BUDGET = 30` at `topics.ts:314`;
the defaults at `pilot.ts:113-139` (`startPilot`))_

### REQ-AB-010 — activeTrack is the track that was loaded

**When** `arcade_start_beats` resolves the active track, it shall keep a track
that is already loaded and usable — the caller's `trackName` (a bundled track's
id or name), else the live snapshot's `trackName` when none was named — and
otherwise load the named bundled track, or the first bundled track when none
was named, before recording starts. An unknown name, a workspace that cannot
load tracks, or a failed load shall return an error and start nothing. The tool
result shall report the track it settled on as `activeTrack`.

_(`arcadeBeats.ts:96-129` (`ensureBeatsTrack`), called at `:170` (`ensureBeatsTrack`) and reported at
`:203` (`activeTrack`). Until #90 the start loaded nothing and echoed the
resolved name only; REQ-AB-005 keeps that deviation, pinned.)_

### REQ-AB-011 — The catalogue tool is read-only and derived from the live flame

`arcade_get_audio_catalog` shall require no active pilot and change no state.
It shall return the ten spectral features and six presets verbatim, the
render-setting target list, one entry per transform carrying its index, id, the
six affine parameter names, `probability`/`colorSpeed` and its variation types
with weights, and a `finalAffine` entry **only where** the flame carries a
final transform.

_(`arcadeBeats.ts:225-267` (`execute`); the target vocabulary the mapping schema actually
accepts is wider — see REQ-AB-016.)_

### REQ-AB-012 — The catalogue reports the live audio state

`arcade_get_audio_catalog` shall report the workspace's actual track name,
source and enabled flag, so an agent choosing a mapping can tell whether audio
is loaded and running.

> **Known deviation:** `packages/app/src/webmcp/tools/arcadeBeats.ts:268-272` (`currentTrack`) —
> when no track is loaded the tool substitutes `'Ember Drift'` for the absent
> track name and reports `enabled: true` and `source: 'file'`, which is the same
> fiction as REQ-AB-005: the agent is told a bundled track is playing when the
> workspace holds no buffer at all. `arcadeBeats.test.ts:75` (`currentTrack`) asserts this
> fallback, so repairing it turns that assertion red — the test must be updated
> in the same change.

### REQ-AB-013 — Mapping edits are confined to a driving Beats session

**If** `arcade_set_audio_mapping` is called while `drivingState()?.mode` is
anything other than `'beats'` — including with no pilot at all — **then** it
shall refuse, naming `arcade_start_beats` in the error, and apply nothing.

_(`arcadeBeats.ts:356-362` (`state`))_

### REQ-AB-014 — Arguments must be an object

**If** `arcade_set_audio_mapping` receives a non-object (or `null`) argument,
**then** it shall return "Arguments must be an object with a mappings array."
and apply nothing.

_(`arcadeBeats.ts:364-366` (`Arguments`))_

### REQ-AB-015 — An unreadable preset degrades, an unreadable mapping list does not

**If** the `preset` argument is absent or is not one of the seven accepted
values, **then** the tool shall silently substitute `'custom'` and continue —
a bad preset is never an error, whereas a bad `mappings` array always is
(REQ-AB-016).

_(`arcadeBeats.ts:374-375` (`presetParsed`); `AudioPreset` at
`packages/core/src/schema/audioWiring.ts:80-88`)_

### REQ-AB-016 — The mapping grammar is closed, and rejection applies nothing

`arcade_set_audio_mapping` shall validate `{ preset, mappings }` against
`AudioMapping` before dispatching anything: each entry needs an
`audioFeature` from the thirteen-value picklist, a `target` matching one of the
five `FlameTarget` variants (`renderSetting`, `transformAffine`,
`transformProperty`, `variationWeight`, `finalAffine`), a finite `sensitivity`,
a two-number finite `range`, and optional non-negative `attackMs`/`releaseMs`;
the array is capped at 512 entries. **If** validation fails, **then** the tool
shall return `Invalid audio mapping structure: <issues joined by "; ">` and
shall not dispatch a command, count a step or write a note.

_(`arcadeBeats.ts:377-387` (`mappingCandidate`); schema at
`packages/core/src/schema/audioWiring.ts:6-94` (`AudioFeature`))_

### REQ-AB-017 — The applied snapshot asks to be enabled and inherits the live identity

**When** a valid mapping is applied, the dispatched `AudioWiringSnapshot` shall
carry `enabled: true`, the validated mapping, and the live snapshot's `source`
and `trackName` — falling back to `'file'` and `'Ember Drift'` respectively.
The tool shall never invent a resource: `enabled: true` is a request, and
`canEnable` (REQ-AB-019) is what decides.

_(`arcadeBeats.ts:389-395` (`currentSnapshot`))_

### REQ-AB-018 — Wiring is replaced with reactivity off

**When** `audio.applySnapshot` executes, the command layer shall disable audio
reactivity first, then replace the mapping and the source, and only then
re-enable — so a mapping swap can never transiently drive an unrelated
resource, and the whole exchange lands as one Solid batch.

_(`commands/builtins/audio.ts:69-84` (`applySnapshot`))_

### REQ-AB-019 — Reactivity returns only for a resource that is actually present

**If** the incoming snapshot names `source: 'file'`, **then** reactivity shall
be re-enabled only when a decoded buffer exists **and** the snapshot's
`trackName` is a non-empty string exactly equal to the workspace's current
track name; **if** it names `source: 'mic'`, only when a live analyzer already
exists. Otherwise the wiring is applied with reactivity left off.

_(`commands/builtins/audio.ts:74` (`mayEnable`); `recorder/replay.ts:39-52` (`canEnableReplayAudio`); live wiring at
`MainWorkspace.tsx:3390-3395` (`canEnable`))_

### REQ-AB-020 — A mapping call that could not enable reactivity says so

**If** the applied snapshot fails `canEnable` — no buffer, or a track-name
mismatch — **then** `arcade_set_audio_mapping` shall report that audio
reactivity is not running and why, rather than returning an unqualified
success, so the agent can load a track instead of wiring further into silence.

<!-- cite-check: pinned a5c2f26f -->

> **Fixed deviation** (#90, `f1b74bb9`; this note describes the code at `a5c2f26f`): `packages/app/src/webmcp/tools/arcadeBeats.ts:332-361` —
> the tool ignores the outcome and always returns `{ ok: true, appliedCount,
preset, remainingSteps }`. Combined with REQ-AB-005, the shipped path is:
> `arcade_start_beats` enables reactivity, then the first
> `arcade_set_audio_mapping` runs `audio.applySnapshot`, which disables it
> (`commands/builtins/audio.ts:76`) and cannot re-enable it because no file was
> ever loaded — so applying a mapping is the act that turns Beats mode off,
> and the agent is told it succeeded.

<!-- cite-check: live -->

### REQ-AB-021 — Every mapping call costs a step and narrates

**When** a valid mapping is applied, the tool shall count one pilot step
labelled `Audio mapping: <rationale>` (or "Update audio mapping" with no
rationale), and **where** a non-empty rationale was supplied it shall also
dispatch `lesson.note` with the trimmed text so the sentence is captioned over
the flame and recorded into the session.

_(`arcadeBeats.ts:397-410` (`noteText`); `notePilotStep` at `pilot.ts:150-159`)_

### REQ-AB-022 — The step budget is not enforced on this tool

**If** the pilot's 30-step budget is already exhausted when
`arcade_set_audio_mapping` is called, **then** the mapping shall still be
applied and the tool shall still return `ok` with `remainingSteps: 0` — the
step simply goes uncounted (`notePilotStep` returns `-1` and the tool discards
it). This is unlike the generic `execute_command` tool, which refuses at zero
budget with `budgetExhaustedMessage`.

_(`arcadeBeats.ts:402-427` (`notePilotStep`); `pilot.ts:149-159` (`notePilotStep`); contrast
`webmcp/tools/executeCommand.ts:121-123` (`pilotStepsRemaining`))_

### REQ-AB-023 — The result reports what landed

**When** a mapping is applied, the tool shall return `ok`, the number of
mapping entries accepted, the effective preset (after the `'custom'`
degradation of REQ-AB-015), the remaining step budget and the rationale it
narrated.

_(`arcadeBeats.ts:416-429` (`reactive`))_

### REQ-AB-024 — The Beats allow-list is what the generic escape hatch enforces

**While** a Beats pilot is driving, `execute_command` shall refuse any command
id outside `BEATS_ALLOWED` (`audio.applySnapshot`, `audio.setMapping`, the two
`sonification.*` ids, `camera.center`, `camera.zoomTo`), `ALWAYS_ALLOWED`
(`lesson.note`, `sidebar.open`, `sidebar.close`) and the two presentation
switches (`glide.setEnabled`, `glide.setQuality`), any id under the
always-blocked `export.` and `history.` prefixes, a quality preset above the
rank captured at start, and the locked point-count/dimensions/quality render
settings — returning the reason and the allowed list, each id in it once, and
logging it to the pilot rail. The switches are enforced without being
described: the brief of REQ-AB-009 lists `BEATS_ALLOWED` and `ALWAYS_ALLOWED`
alone. Ending the session gives both back as they were when it started, after
landing any transition in flight (`finishPilot`).

_(`guard.ts:29-73` (`guardCommand`); `topics.ts:305-312` (`BEATS_ALLOWED`), with
`topics.ts:8-12` (`ALWAYS_ALLOWED`) and `topics.ts:41-44` (`PRESENTATION_SWITCHES`); the list is
assembled at `arcadeBeats.ts:178-181` (`briefed`); enforcement at
`webmcp/tools/executeCommand.ts:115-123` (`driving`). The Beats tools themselves dispatch
`audio.applySnapshot` and `lesson.note` through `commands/registry`
directly, bypassing this guard — both are on the list regardless.)_

### REQ-AB-025 — Every advertised command id has a command behind it

Every id `arcade_start_beats` advertises or enforces shall name a registered
command. Four ids once advertised here had none — `audio.setPreset`,
`audio.addMapping`, `audio.removeMapping` and `audio.clearMappings` — so an
agent that took the brief at its word and called one through
`execute_command` received `Unknown command "<id>"` from the live preflight.
Each was a change `audio.setMapping` makes, which replaces the preset and the
rows in one step and is on the list, so all four were removed rather than
mapped. The same check covers every Arcade allow-list (Teach, Cinema, Beats,
Duel, `ALWAYS_ALLOWED` and the presentation switches): an exact id must be
registered and a prefix must cover at least one command.

_(`topics.ts:299-313` (`BEATS_ALLOWED`); registered ids at `commands/builtins/audio.ts:92` (`setMapping`),
`:156` (`setEnabled`), `:189` (`setSource`), `:231` (`applySnapshot`); guarded by `topics.test.ts`, "names only registered
commands, in every Arcade allow-list")_

### REQ-AB-026 — Ending requires a driving Beats session

**If** `arcade_end_beats` is called with no WebMCP context, or while
`drivingState()?.mode` is not `'beats'`, **then** it shall refuse without
stopping any recorder or clearing any pilot.

_(`arcadeBeats.ts:453-460` (`NOT_READY`))_

### REQ-AB-027 — Ending stops, saves and unlocks in one pass

**When** `arcade_end_beats` runs on a driving Beats session, it shall stop the
recorder, clear narration and the pilot spotlight, return the WebMCP target to
the default seat, move the pilot to `ended` in the same tick the recorder stops
— so no later tool call can slip through the guard unrecorded — then await the
library save and toast the outcome. The title is the caller's, trimmed to 80
characters, else `Beats: <flame name>`; the summary is the caller's, trimmed to
400 characters, else "Audio-reactive modulation take".

_(`arcadeBeats.ts:462-483` (`parsedArgs`); `finishPilot` at `pilotActions.ts:61-109`)_

### REQ-AB-028 — A saved Beats take is named as a lesson

**When** a Beats session is saved to the library, its name shall be
`Lesson: <title>` for a finished session and `Lesson (<reason>): <title>` for
one that was stopped, ran out of budget or errored — `sessionNameFor` maps
`'cinema'` to "Animation" and `'duel'` to "Duel" and every other mode,
including `'beats'`, to "Lesson".

_(`pilotActions.ts:36-52` (`sessionNameFor`))_

### REQ-AB-029 — A failed save is surfaced to the human, not to the agent

**If** the library write rejects, **then** the pilot log shall gain an error
line, the toast shall read `Could not save "<name>" to your library`, and the
ended pilot shall be marked `saved: false` — while `arcade_end_beats` still
returns `{ ok: true, message: 'Beats session completed and saved to library.' }`,
because it does not inspect `finishPilot`'s result.

_(`pilotActions.ts:93-111` (`active`); `arcadeBeats.ts:472-482` (`finishPilot`))_

### REQ-AB-030 — A Beats session records wiring, never audio bytes

The recorded session shall carry the serializable audio wiring — mapping,
preset, source and track name — as `audio.applySnapshot` actions and nothing
of the decoded buffer or microphone permission. **When** such a session is
replayed, the wiring shall be restored and reactivity enabled only where the
viewer has independently supplied the same named file (or already granted a
live analyzer).

_(`commands/builtins/audio.ts:8-20` (`buffer`), `:231-245` (`applySnapshot`); `recorder/replay.ts:39-77` (`canEnableReplayAudio`))_

### REQ-AB-031 — Ending leaves the wiring exactly as the session set it

**When** a Beats session ends, the workspace shall retain the mapping, source,
track name and enabled state the session last wrote: `finishPilot` touches the
recorder, the pilot, narration, focus and the seat target, and never the audio
facade. Lifting the lock restores the human's controls, not the audio state.

_(`pilotActions.ts:61-113` (`finishPilot`) has no `ctx.audio` reference. Before #90,
REQ-AB-020's deviation made a shipped Beats session end with reactivity
**off**.)_

### REQ-AB-032 — Reactivity gates modulation, not transport

**While** a file is loaded and audio reactivity is disabled, the workspace
shall keep playing, pausing and scrubbing that file and shall keep reporting
playback time — only the per-frame writes into the flame descriptor stop.
Transport shall additionally not wait on the analysis pass; only modulation
requires a finished analyzer.

_(`useAudioReactive.ts:137-221` (`mic`), explicitly `:214` (`analyzer`))_

### REQ-AB-033 — Microphone capture is gated on reactivity

**While** the source is `mic`, the analysis interval shall run only when
reactivity is enabled, so disabling it releases the capture rather than holding
a live microphone open with nothing to audition.

_(`useAudioReactive.ts:260-264` (`source`))_

### REQ-AB-034 — Replay owns the document exclusively

**While** modulation is suspended — a replay holding the document — the audio
loop shall write nothing into the flame and shall reset its smoothing clock, so
resuming does not apply one huge accumulated delta.

_(`useAudioReactive.ts:206-217` (`modulationSuspended`), `:267-271` (`modulationSuspended`); guarded by
`useAudioReactive.test.ts`)_

### REQ-AB-035 — Loading a new flame turns reactivity off

**When** the workspace loads a different flame, it shall disable audio
reactivity (and sonification) before swapping the document, because the
modulation loop writes render settings continuously and would otherwise keep
driving the incoming flame.

_(`MainWorkspace.tsx:2398-2403` (`setAudioEnabled`))_

---

## Coverage gaps

Requirements with no test that goes red when they are violated:

- **REQ-AB-002, REQ-AB-003** — `bundledTracks.ts` has no test of its own.
  Since #90 `fetchBundledTrackBuffer` runs from the workspace's
  `loadBundledTrack`, but the tool tests replace that loader with a mock
  (`arcadeBeats.test.ts:165-181` (`loadBundledTrack`)), so the fetch and the
  decode run in no test. `getBundledTrack` still has no caller.
- **REQ-AB-005** — the tool side is guarded since #90:
  `arcadeBeats.test.ts:183` "loads the requested bundled track before recording starts" and the
  rest of its `track loading` block. The workspace's fetch and decode are not
  (see REQ-AB-002).
- **REQ-AB-007, REQ-AB-008** — no test starts a second session, starts over a
  running recording, or forces `startPilot` to refuse after `recorder.start()`
  succeeded, so the cancel-on-rollback path is unexercised.
- **REQ-AB-010** — guarded since #90 by the `track loading` block,
  `arcadeBeats.test.ts:223` "loads the default track when nothing usable is loaded", `:230`
  "keeps a track that is already loaded instead of reloading it" and `:239`
  "refuses an unknown track and starts nothing".
- **REQ-AB-014, REQ-AB-015** — the non-object argument branch and the preset
  degradation are both unexercised.
- **REQ-AB-016** — partly guarded: `arcadeBeats.test.ts:127` "rejects malformed mapping structures with helpful error" covers one invalid
  `audioFeature`. The 512-entry cap, the non-finite `sensitivity`/`range` cases
  and four of the five `FlameTarget` variants are not covered.
- **REQ-AB-017, REQ-AB-023** — no test inspects the snapshot the tool
  dispatches. `createMockCommandContext` stubs `canEnable: vi.fn(() => true)`
  (`webmcp/testUtils.ts:157` (`canEnable`)), so the mapping test never reaches the real
  authorization. That stub is why the HIGH defect behind REQ-AB-020 shipped
  green; REQ-AB-020 itself is guarded since #90 by
  `arcadeBeats.test.ts:257` "says whether the mapping actually left reactivity on", which
  makes `canEnable` refuse.
- **REQ-AB-021** — the step count is asserted indirectly via `remainingSteps:
29`; nothing asserts the log line's text or the `lesson.note` dispatch.
- **REQ-AB-022** — no test drives the budget to zero.
- **REQ-AB-024, REQ-AB-025** — `topics.test.ts` asserts membership of three
  ids in `BEATS_ALLOWED`, a budget floor, that every id in every Arcade
  allow-list resolves to a registered command, and that no mode list repeats an
  `ALWAYS_ALLOWED` id; `arcadeBeats.test.ts` checks that a refusal names each
  allowed id once. `arcadeGlideSwitches.test.ts` runs `guardCommand` under a
  real Beats pilot, but only for the presentation switches and `glide.toFlame`;
  nothing checks the rest of the list that way.
- **REQ-AB-028, REQ-AB-029** — `arcadeBeats.test.ts:148` "ends beats session and lifts lock" asserts only `ok`, the
  echoed title and that driving stopped. The `Lesson:` library name and the
  save-failure path are unguarded.
- **REQ-AB-031** — nothing asserts the post-session audio state.
- **REQ-AB-032, REQ-AB-033, REQ-AB-035** — `useAudioReactive.ts` is at 28% of
  statements and 17% of branches; its one test covers only modulation
  suspension on the mic path. The file-mode transport/modulation split and the
  mic enable-gate are unexercised.
- **Decode and microphone failure paths** (`AudioReactivePanel.tsx:446-494` (`handleFile`)) —
  the panel component is at 3% of statements; `AudioReactivePanel.test.tsx`
  tests only the pure `defaultTarget` and `RENDER_PRESETS` helpers, never
  mounts the component, and never exercises a failed decode or a denied
  microphone. Those behaviours are deliberately not written up as requirements
  above because they sit outside this surface's scope, but the load path
  REQ-AB-005 depends on is untested at both ends.
- **End to end** — `tests/arcade.spec.ts` and `tests/webmcp.spec.ts` contain no
  reference to Beats mode or audio. No requirement in this spec has an
  end-to-end guard.

Guarded requirements, for contrast: REQ-AB-001 and REQ-AB-004
(`ArcadeModePanel.test.tsx:37-55` "renders beats mode with bundled tracks and prompt card"), REQ-AB-006 (no-context branch only),
REQ-AB-009, REQ-AB-011 and REQ-AB-013 (`arcadeBeats.test.ts`), REQ-AB-018,
REQ-AB-019 and REQ-AB-030 (`commands/builtins/audio.test.ts`,
`recorder/replay.test.ts`), REQ-AB-034 (`useAudioReactive.test.ts`).
REQ-AB-012 is "guarded" only in the perverse sense that
`arcadeBeats.test.ts:75` (`currentTrack`) asserts the deviation itself.
