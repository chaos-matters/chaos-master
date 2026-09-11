# \<Surface\> — EARS requirements

> **How to use this file.** Copy it to `docs/specs/<surface>.ears.md`, replace
> the front matter and the requirements with your own, then delete everything
> from the `Reference — the five patterns` heading down. Those sections teach
> the format; a finished spec does not carry them.

**Version:** 0.9.11 (`packages/app/package.json`) — the version whose shipped behaviour this describes
**Date:** 2026-09-10
**Scope:** One or two sentences. What surface this covers, and — just as
important — what it deliberately does not, so the next reader knows whether a
missing requirement is a gap or out of bounds.

**Source:**

- `packages/app/src/lib/WebgpuAdapter.ts` — device acquisition, loss handling, init coalescing
- `packages/app/src/lib/gpuStatus.ts` — the session-wide status signal and its terminal latch
- `packages/app/src/lib/AutoCanvas.tsx` — the poster gate every preview renders behind

**Tests:**

- `packages/app/src/lib/activeTab.test.ts` — visibility gating that the poster gate depends on
- `tests/smoke.spec.ts` — end-to-end: the app boots to a rendered canvas on a real GPU
- _Gap:_ `gpuStatus.ts` and `WebgpuAdapter.ts` have no unit test. REQ-GPU-002 and
  REQ-GPU-003 below are unguarded — a change to either can only be caught by hand.

These two blocks are load-bearing. `Source:` is how a reader gets from a
requirement to the code; `Tests:` is how they find out whether anything would
notice if the code stopped honouring it. Together they replace a separately
maintained coherence map, which is why they are allowed to name a gap out loud
instead of leaving the line blank.

---

## Requirements

### REQ-GPU-001 — One device per page

The WebGPU adapter shall coalesce concurrent device-initialisation requests into
a single in-flight promise, so that a page mounting several `Root` components on
one frame acquires exactly one `GPUAdapter` and one `GPUDevice`.

_(`WebgpuAdapter.ts:196`, `:214-220`)_

### REQ-GPU-002 — Device loss is terminal for the session

**If** the device's `lost` promise settles with a reason other than
`'destroyed'`, **then** the adapter shall null both the cached adapter and
device handles, set the session status to `unavailable`, and shall not attempt
to re-acquire a device.

_(`WebgpuAdapter.ts:168-186`; recovery is by page reload only.)_

### REQ-GPU-003 — Our own teardown is not a crash

**If** the loss reason is `'destroyed'` — the adapter's own `onCleanup` or an HMR
swap — **then** the status signal shall be left unchanged.

_(`WebgpuAdapter.ts:180-183`)_

### REQ-GPU-004 — Previews never draw on a dead device

**While** the session status is anything other than `ready`, `AutoCanvas` shall
render `PreviewPoster` for that status in place of the canvas.

_(`AutoCanvas.tsx:120-124`)_

---

# Reference — the five patterns

Delete from here down when you copy this file.

Every requirement is one of five shapes. The pattern word is **bold** in the
source so the shape is readable at a glance, and so a grep for `**While**` finds
every state-driven requirement in the repo.

## Ubiquitous — always true, no trigger

> The \<system\> shall \<response\>.

**REQ-GPU-001 — One device per page**
The WebGPU adapter shall coalesce concurrent device-initialisation requests into
a single in-flight promise, so that a page mounting several `Root` components on
one frame acquires exactly one `GPUAdapter` and one `GPUDevice`.

Use this for invariants. If you find yourself writing "the system shall always",
drop the "always" — ubiquitous already means always.

## Event-driven — a discrete trigger fires

> **When** \<trigger\>, the \<system\> shall \<response\>.

**REQ-AUDIO-004 — Wiring is replaced with reactivity off**
**When** the `audio.applySnapshot` command executes, the workspace shall disable
audio reactivity, then replace the mapping and source, and shall re-enable
reactivity only if `canEnable` accepts the incoming snapshot — so a mapping swap
can never transiently drive an unrelated resource.

_(`packages/app/src/commands/builtins/audio.ts:69-83`)_

The trigger is an event, not a state: a command dispatch, a decoded audio
buffer, a pointerup, a keyframe write. "When the user is scrubbing" is a state —
that is the next pattern.

## State-driven — true for the whole duration of a state

> **While** \<state\>, the \<system\> shall \<response\>.

**REQ-TIMELINE-007 — Playback locks the sidebar**
**While** timeline playback is running, the sidebar shall carry the
`sidebarLocked` presentation, so parameter edits cannot race the animated
values the timeline is writing.

_(`packages/app/src/components/WorkspaceSidebar/WorkspaceSidebar.tsx:185` —
note the lock keys off `isPlaying()` alone, which is narrower than
`isDrivingView()` at `packages/app/src/utils/timeline.ts:703`.)_

Where a state has a precise definition in code, name it and cite it. "While the
timeline is driving the view" means `animationEnabled() && (isPlaying() ||
isScrubbing() || previewHeld())` and nothing else; write it that way once and the
rest of the spec can use the short name.

## Unwanted behaviour — a condition you would rather not be in

> **If** \<condition\>, **then** the \<system\> shall \<response\>.

**REQ-GPU-002 — Device loss is terminal for the session**
**If** the device's `lost` promise settles with a reason other than
`'destroyed'`, **then** the adapter shall null both cached handles, set the
session status to `unavailable`, and shall not attempt to re-acquire a device.

_(`packages/app/src/lib/WebgpuAdapter.ts:168-186`)_

This is the pattern for errors, degraded hardware, malformed input, and hostile
agent arguments. It is also where specs earn their keep, so be concrete about
the failure and about the response. "**If** the decoded audio buffer is empty,
**then** Beats mode shall keep the previous track loaded and surface a
non-blocking error toast" is a requirement; "shall handle errors gracefully" is
not.

## Optional feature — only where the feature is present

> **Where** \<feature is included\>, the \<system\> shall \<response\>.

**REQ-WEBMCP-001 — Bridge detection is three-valued**
**Where** the browser exposes `document.modelContext` or `navigator.modelContext`,
the Arcade status pill shall report `detected`; **where** neither exists but the
dev mock is installed on `window.webmcp`, it shall report `mock`; otherwise it
shall report `none`.

_(`packages/app/src/arcade/webmcpDetect.ts:11-17`, guarded by
`packages/app/src/arcade/webmcpDetect.test.ts`)_

Use **Where** for anything that is not present in every build or every runtime:
a browser capability, a dev-only mock, a bundled asset, a layout that only
mounts on a touch device. Do not use it for runtime state — that is **While**.

---

## Requirement IDs

`REQ-<AREA>-NNN`. Three digits, numbered from `001` within the spec, in source
order. `<AREA>` is a short uppercase slug for the surface — `GPU`, `TIMELINE`,
`AUDIO`, `BEATS`, `ARENA`, `RECORDER`, `EXPORT`, `WEBMCP`, `TOUCH` — and stays
the same for the life of the spec.

IDs are stable. When a requirement is deleted, retire its number rather than
reusing it; when one is split, keep the original ID on the closer half and give
the new half the next free number. A commit message, a test name and a bug
report should all be able to say `REQ-TIMELINE-007` and mean one thing forever.

---

## Known deviations

Where the shipped behaviour is a defect that is already understood — anything in
[docs/agent/BUGS.md](../agent/BUGS.md) — write the requirement as the **correct**
behaviour, then attach a deviation blockquote directly under it naming the file,
the line and what actually happens today.

Never quietly spec the bug as if it were intended, and never quietly spec the
fix as if it had shipped. Both leave a future reader unable to tell whether a
diff is a regression or a repair.

### REQ-BEATS-003 — Beats mode loads the track it advertises

**When** Beats mode starts with a bundled track selected, the app shall fetch
and decode that track into the audio buffer and set the audio track name to the
selected track, so that the snapshot dispatched by `arcade_set_audio_mapping`
passes `canEnable` and the flame actually reacts to the audio.

> **Known deviation:** `packages/app/src/webmcp/tools/arcadeBeats.ts:333-349` —
> nothing loads a bundled track. `fetchBundledTrackBuffer`
> (`packages/app/src/arcade/bundledTracks.ts:42`) has zero call sites in
> `packages/*/src`, and the only writers of the audio buffer and track name are
> the manual file picker and drop target. With no user-loaded file,
> `canEnable` is false, so `audio.applySnapshot`
> (`packages/app/src/commands/builtins/audio.ts:74-82`) applies the mapping with
> reactivity **disabled** while the tool still returns `{ ok: true }`. Tracked in
> [docs/agent/BUGS.md](../agent/BUGS.md).

One blockquote per requirement, immediately under it. If a single defect breaks
three requirements, each one gets its own blockquote — a reader fixing one
requirement should not have to find the note attached to another.

---

## How to keep this honest

**The spec changes in the same PR as the behaviour.** A spec that lags the code
by even one merge is worse than no spec: it reads as authoritative and is wrong.
If a PR changes what a requirement says the system does, the PR edits the
requirement. If it fixes a known deviation, the PR deletes the deviation
blockquote — that deletion is the receipt.

**Bump `Version:` and `Date:` when you touch it**, so a reader can tell at a
glance how far behind `main` the file might be.

**A requirement with no test named is a gap, and gaps get written down.** Put
them in the `Tests:` block by ID, the way the block at the top of this file
names REQ-GPU-002 and REQ-GPU-003. An unguarded requirement that is admitted is
a work item; an unguarded requirement that is hidden behind a vague `Tests:`
line is a false claim of coverage.

**Naming a test file is not the same as being covered by it.** This repo has run
mutation probes: six deliberate one-line breaks in production code, six suites
that stayed green (see [docs/agent/TESTING.md](../agent/TESTING.md)). Before
citing a test as the guard for a requirement, be able to say which assertion
goes red when the requirement is violated — and if the honest answer is "none of
them", cite it as a gap instead.

**Cite lines, accept that they drift.** File-and-line references are how a
reader gets from prose to code, and they are worth the maintenance. When a
citation no longer lands where it says, that is a signal to re-read the code and
re-check the requirement, not to strip the citations out.
