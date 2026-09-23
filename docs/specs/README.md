# EARS requirement specs

Behaviour of record for the surfaces that changed between `v0.9.11` and `main`
(PRs #73–#83). Each file documents **what the shipped code actually does**,
derived by reading it — not what it ought to do. Where the shipped behaviour is
a known defect, the requirement is written as the _correct_ behaviour and
carries a `> **Known deviation:**` blockquote naming the file, the line and what
happens today. Never silently spec the bug; never silently spec the fix.

Format, the five patterns, the ID rules and the deviation convention live in
[TEMPLATE.ears.md](TEMPLATE.ears.md). Defects are tracked in
[docs/agent/BUGS.md](../agent/BUGS.md); testing conventions and the mutation-probe
results in [docs/agent/TESTING.md](../agent/TESTING.md).

## The set

| Spec                                                                           | IDs       | Reqs | Deviations | Covers                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | --------- | ---: | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [arcade-arena.ears.md](arcade-arena.ears.md)                                   | `REQ-AA-` |   42 |          4 | Flame Clash Arena: overlay lifecycle and document restore, archetype opponents, grounded combat stats and schools, clash staging, voxel territory scoring, multi-round simulation, choreography, champion-card export, and the seven agent-facing tools. |
| [arcade-beats.ears.md](arcade-beats.ears.md)                                   | `REQ-AB-` |   35 |          3 | Audio-reactive Arcade mode: the bundled track catalogue, the four `arcade_*` Beats tools, the `ctx.audio` facade and `canEnable` authorization, and the enable/disable lifecycle of reactivity around a session.                                         |
| [arcade-director.ears.md](arcade-director.ears.md)                             | `REQ-AD-` |   36 |          2 | Evolutionary Art Director: session and modal lifecycle, candidate normalisation and repair, Like/Dislike/tag capture, the persisted taste store and its cross-session profile, Breed Selected and Mutate Best.                                           |
| [documentation-panel-and-seo.ears.md](documentation-panel-and-seo.ears.md)     | `REQ-DS-` |   40 |          3 | The Documentation modal (catalog search, live previews, TeX and shader rendering, copy actions), the Settings/Help modal, and the crawlability contract of every published origin — `robots.txt`, `X-Robots-Tag`, `sitemap.xml`, `llms.txt`.             |
| [recorder-replay-export.ears.md](recorder-replay-export.ears.md)               | `REQ-RR-` |   48 |          1 | The `.steps.json` session lifecycle: what recording captures and refuses, session validation bounds, replay determinism and side-state restore, follow-cam preparation, and the four export paths including motion blur.                                 |
| [timeline-and-audio-modulation.ears.md](timeline-and-audio-modulation.ears.md) | `REQ-TA-` |   38 |          3 | Tracks and keyframes, value resolution and easing, loop synthesis, `applyTracksToFlame`, auto-keyframing, transport, audio feature extraction and mapping evaluation, and the wiring editor.                                                             |
| [touch-and-tablet-layout.ears.md](touch-and-tablet-layout.ears.md)             | `REQ-TL-` |   39 |          3 | Phone/tablet/desktop classification and the manual override, which chrome mounts in each band, the breakpoints and which stylesheet owns them, the touch HUD/rail/inspector surfaces, and the horizontal drag helper.                                    |

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
   `WheelZoomCamera3D.tsx`, `utils/createPinchHandler.ts`. This owns a confirmed
   **high** defect that no spec records: 3D pinch-zoom computes
   `event.distance / prevDistance` with none of the finiteness guards its 2D twin
   received, so two coincident touches produce a NaN orbit radius that passes
   schema validation and is persisted. A defect of record with no owning
   requirement is the worst state in the set; fix that first.
2. **MainWorkspace decomposition and the workspace-hook contract** —
   `MainWorkspace.tsx` (6,655 lines changed here) and `hooks/useWorkspace*`. Owns
   the orphaned `sidebarScrollRef` / `sidebarRef` defect, and is the seam through
   which two _other_ recorded deviations shipped (REQ-RR-011's raw-timeline
   wiring, REQ-TA-021's widened keyframe short-circuit). Nothing states which hook
   owns which signal, or what the command context guarantees per seat.
3. **The command registry and the flame command vocabulary** —
   `commands/registry.ts`, `commands/builtins/flame*` (~2,900 lines changed).
   Four specs use "a registered command" as their unit of truth (REQ-RR-001,
   REQ-RR-014, REQ-TL-023, REQ-AB-024) while the registry's own contract — id
   grammar, preflight, `commandDepth`, `preservesFinishedSession`, argument
   validation — is specified nowhere.
4. **The `@chaos-master/core` extraction boundary** — owns the confirmed
   **medium** "five modules copied instead of re-exported" defect. Only the easing
   twin is covered today, by REQ-TA-013; `record.ts`, `schemaUtil.ts` and the
   `flam3PaletteParser` subset are unspecified, as is the low finding that core
   pulls TypeGPU into the Worker's import graph.
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
deletes the deviation blockquote — that deletion is the receipt, and it is the
one review signal that distinguishes a repair from a regression. When a
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
authorization the requirement depended on. Two guards in this set actively pin
defective behaviour (`tasteStore.test.ts:36` pins the colliding record id;
`arcadeBeats.test.ts:60` pins the fabricated track name), so repairing those
requirements _must_ edit the assertion — the suite will not tell you the fix was
needed. Finally, file-and-line citations drift: when one no longer lands where it
says, that is a prompt to re-read the code and re-check the requirement, not a
reason to strip citations out.
