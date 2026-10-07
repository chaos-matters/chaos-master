# EARS requirement specs

Behaviour of record for the surfaces that changed between `v0.9.11` and `main`
(PRs #73–#83). Each file documents **what the shipped code actually does**,
derived by reading it — not what it ought to do. Where the shipped behaviour is
a known defect, the requirement is written as the _correct_ behaviour and
carries a `> **Known deviation:**` blockquote naming the file, the line and what
happens today. Never silently spec the bug; never silently spec the fix. A
deviation a later PR fixed is relabelled `> **Fixed deviation**`, names that PR
and commit, and is pinned to the revision it describes (see the template).

Format, the five patterns, the ID rules and the deviation convention live in
[TEMPLATE.ears.md](TEMPLATE.ears.md). Defects are tracked in
[docs/agent/BUGS.md](../agent/BUGS.md); testing conventions and the mutation-probe
results in [docs/agent/TESTING.md](../agent/TESTING.md).

## The set

Deviation counts are open / fixed, recounted on 2026-09-23 after PRs #90 to #117.

| Spec                                                                           | IDs       | Reqs | Deviations | Covers                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | --------- | ---: | ---------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [arcade-arena.ears.md](arcade-arena.ears.md)                                   | `REQ-AA-` |   42 |      3 / 1 | Flame Clash Arena: overlay lifecycle and document restore, archetype opponents, grounded combat stats and schools, clash staging, voxel territory scoring, multi-round simulation, choreography, champion-card export, and the seven agent-facing tools.                                                                                 |
| [arcade-beats.ears.md](arcade-beats.ears.md)                                   | `REQ-AB-` |   35 |      1 / 2 | Audio-reactive Arcade mode: the bundled track catalogue, the four `arcade_*` Beats tools, the `ctx.audio` facade and `canEnable` authorization, and the enable/disable lifecycle of reactivity around a session.                                                                                                                         |
| [arcade-director.ears.md](arcade-director.ears.md)                             | `REQ-AD-` |   36 |      1 / 1 | Evolutionary Art Director: session and modal lifecycle, candidate normalisation and repair, Like/Dislike/tag capture, the persisted taste store and its cross-session profile, Breed Selected and Mutate Best.                                                                                                                           |
| [documentation-panel-and-seo.ears.md](documentation-panel-and-seo.ears.md)     | `REQ-DS-` |   40 |      2 / 1 | The Documentation modal (catalog search, live previews, TeX and shader rendering, copy actions), the Settings/Help modal, and the crawlability contract of every published origin — `robots.txt`, `X-Robots-Tag`, `sitemap.xml`, `llms.txt`.                                                                                             |
| [recorder-replay-export.ears.md](recorder-replay-export.ears.md)               | `REQ-RR-` |   50 |      0 / 2 | The `.steps.json` session lifecycle: what recording captures and refuses, session validation bounds, replay determinism and side-state restore, follow-cam preparation, and the four export paths including motion blur.                                                                                                                 |
| [timeline-and-audio-modulation.ears.md](timeline-and-audio-modulation.ears.md) | `REQ-TA-` |   38 |      0 / 3 | Tracks and keyframes, value resolution and easing, loop synthesis, `applyTracksToFlame`, auto-keyframing, transport, audio feature extraction and mapping evaluation, and the wiring editor.                                                                                                                                             |
| [touch-and-tablet-layout.ears.md](touch-and-tablet-layout.ears.md)             | `REQ-TL-` |   39 |      1 / 2 | Partly superseded by the native rail and shell (#95, #96): nine requirements are marked **Superseded** and pinned. Phone/tablet/desktop classification and the manual override, which chrome mounts in each band, the breakpoints and which stylesheet owns them, the touch HUD/rail/inspector surfaces, and the horizontal drag helper. |

`bump-astro.md` also sits in this directory. It predates the template, uses a
stacked `WHEN/WHERE/IF/THEN` shape that is not one of the five EARS patterns,
and has no front matter, `Source:` or `Tests:` block. Treat it as legacy: rewrite
it to the template or move it out, but do not copy its shape.

Every spec ends with a **Coverage gaps** section listing, by ID, the requirements
that no assertion would fail on. Those lists are the honest half of the document
— read them before trusting a `Tests:` block.

## Backlog — what still has no spec

Ranked by how much a spec would be worth, given what changed in this range and
where the confirmed defects sit.

1. **Camera and pointer gestures** — `lib/WheelZoomCamera2D.tsx`,
   `WheelZoomCamera3D.tsx`, `utils/createPinchHandler.ts`. This owned a
   confirmed **high** defect no spec recorded: 3D pinch-zoom divided by a
   distance with none of the finiteness guards its 2D twin had, so two
   coincident touches produced a NaN orbit radius. #90 fixed it (the
   `isUsablePinch` gate, a finiteness check, and a schema that rejects NaN), but
   the 3D guards have no direct test and no requirement owns the gestures.
2. **MainWorkspace decomposition and the workspace-hook contract** —
   `MainWorkspace.tsx` (6,655 lines changed in that range) and
   `hooks/useWorkspace*`. Owns the orphaned `sidebarScrollRef` defect (still
   open; #115 removed the dead `sidebarRef` half), and is the seam through which
   two _other_ recorded deviations shipped (REQ-RR-011's raw-timeline wiring and
   REQ-TA-021's widened keyframe short-circuit, both fixed in #90). Nothing states which hook
   owns which signal, or what the command context guarantees per seat.
3. **The command registry and the flame command vocabulary** —
   `commands/registry.ts`, `commands/builtins/flame*` (~2,900 lines changed).
   Four specs use "a registered command" as their unit of truth (REQ-RR-001,
   REQ-RR-014, REQ-TL-023, REQ-AB-024) while the registry's own contract — id
   grammar, preflight, `commandDepth`, `preservesFinishedSession`, argument
   validation — is specified nowhere.
4. **The `@chaos-master/core` extraction boundary** — owned the confirmed
   **medium** "five modules copied instead of re-exported" defect, which #115
   fixed by making the app's easing, record and schemaUtil re-export their core
   twins. The boundary itself is still unspecified, as is the low finding that
   core pulls TypeGPU into the Worker's import graph.
5. **The Arcade session shell** — `arcade/pilot.ts`, `guard.ts`, `topics.ts`,
   `pilotActions.ts`, plus the Teach, Cinema and Duel modes. Three mode specs
   lean on the budget, allow-list and teardown contract; it is written down only
   obliquely, inside Beats (REQ-AB-024 … REQ-AB-029).
6. **Worker API routes** — OG-image integrity, the shortener payload cap, the
   fail-open rate limiter, Discord staging. Security-shaped, already well tested
   in `worker/index.test.ts`, and deliberately out of scope for the docs spec,
   which stops at crawlability.
7. **The benchmark lab** — `pages/Benchmarks/*`. Two confirmed low findings,
   including an extraction whose commit message claimed comprehensive coverage
   for a module that has no tests.
8. **Sonification** — allow-listed by Beats, restored last by replay (REQ-RR-020),
   bounded by the session schema (REQ-RR-015), and unreachable from the touch
   drawer. Cited by three specs, owned by none.
9. **WebGPU resilience** — `lib/WebgpuAdapter.ts`, `lib/gpuStatus.ts`,
   `lib/AutoCanvas.tsx`. The template's own worked example is still the only
   place this behaviour is written down.
10. **Home / community showcase and share-link previews** — changed in this range,
    no requirements at all.

## Keeping these honest

**The spec changes in the same PR as the behaviour.** A spec that lags `main` by
one merge is worse than no spec: it reads as authoritative and is wrong. If a PR
changes what a requirement says the system does, that PR edits the requirement
and bumps the file's `Version:` and `Date:`. If a PR fixes a known deviation, it
deletes the deviation blockquote or relabels it **Fixed deviation** and pins it
— that edit is the receipt, and it is the one review signal that distinguishes a
repair from a regression. When a
requirement is retired, retire its number too; when one is split, the original ID
stays on the closer half. `REQ-TA-021` should mean one thing forever, in a commit
message, a test name and a bug report alike.

**Naming a test is not the same as being covered by it.** Before citing a file in
a `Tests:` block, be able to say which assertion goes red when the requirement is
violated; if the honest answer is "none of them", cite it as a gap instead and
put the ID in the Coverage gaps section. This repo has run mutation probes — six
deliberate one-line breaks, six suites that stayed green — and it has already
shipped a high-severity defect straight through a green suite because a mock
(`webmcp/testUtils.ts`'s `canEnable: () => true`) stood in for the very
authorization the requirement depended on. Two guards in this set used to pin
defective behaviour — the colliding Director record id and the fabricated Beats
track name — and #90 had to edit both assertions when it fixed them; the suite
did not say the fixes were needed. Finally, file-and-line citations drift, and
`pnpm docs:cite` catches it: every citation names the symbol it points at, and
PR CI fails when that symbol is no longer within five lines of the cited ones.
When it fails, re-read the code and re-check the requirement; do not strip the
citation out.
