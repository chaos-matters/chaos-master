# Home tab — onboarding, gallery, and the marketing frontline

Status: **implemented through the hybrid Home gallery and community rail**.
Original author decisions captured 2026-07-29; reconciled 2026-08-21.

The original phased design below is retained as the decision record. The live
implementation now includes the Home shell, visibility-gated live plates,
motion and capability sections, the Made Here tour portal, curated collections,
and an approved Discord-community rail. See
`docs/plans/home-community-showcase-plan.md` for the submission, moderation, and
rollout design.

## Why

Two problems, one surface.

**Onboarding.** The welcome screen is the only introduction the app has, it is
shown once, and there is no way back to it — `resetWelcomeDismissal()` exists in
`packages/app/src/utils/welcomeDismissed.ts` with zero callers. A new user who
dismisses it never sees an explanation of what the app does again. Nothing in
the app shows what is possible before you are already staring at an editor.

**Marketing.** The GitHub README is stale and does not position the product:
no clear statement of what it is, who it is for, or what the first sixty
seconds look like. It has no compelling visual. Every asset it needs — hero
stills, animated loops, a recording of a flame being built — is a by-product of
building Home properly, so the two should be sequenced together rather than
solved twice.

Home is a scrollable, art-directed surface inside the app that shows the work
first: what the renderer produces, what moves, how it is made, and what you can
explore next.

## Decisions already made

| Question              | Decision                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Placement             | A tab in the app shell. The welcome screen keeps its current job for now; Home may retire it later.                                    |
| Live vs poster        | Hybrid — one live hero, everything else ships a poster and upgrades to live when scrolled into view or hovered, unmounting off-screen. |
| "Watch it being made" | Live app-in-app, scripted by the existing tour system (not a recording).                                                               |
| Art direction         | Gallery/museum as the starting spine — deliberately held loosely, see below.                                                           |

The tab choice is the low-risk one: Home can be built and shipped incrementally
without touching first-run, benchmark entry, `?flame=` deep links, or the tour
system's assumptions. It also immediately fixes "no way back to the intro".

## Sections, in scroll order

1. **Hero** — one always-live flame, large. Product statement in a single line
   and one primary action into the workspace.
2. **The flames** — the gallery proper. Large plates, poster-until-in-view,
   small precise captions (name, 2D/3D, dominant variations, "Open in
   workspace →").
3. **In motion** — animated 2D/3D pieces. One or two auto-play briefly on
   arrival and then settle; the rest animate on hover. The restraint matters:
   everything moving at once reads as a screensaver, not a gallery.
4. **Made here** — the live app-in-app portal showing a flame being built.
5. **Explore** — capability cards (animation system, randomiser/generation,
   mutation & genetics, audio-reactive, sonification). Each opens a _curated
   flame chosen to demonstrate that capability_, ready to play with, not a
   docs page.
6. **Footer** — mirroring the landing site's footer links.

## Technical spine

**Reuse `packages/landing`, do not reinvent.** The landing already renders live
GPU flames using the app's real renderer (`Root` / `AutoCanvas` / `Camera2D` /
`Flam3`) and has solved the hard parts:

- device-tiered `pointCountPerBatch` (1e5 mobile / 1e6 desktop),
- `IntersectionObserver` mount/unmount so off-screen flames release their GPU
  context and concurrent contexts stay bounded,
- high-res poster fallback shown when WebGPU is unavailable or the device is
  lost — "live by default, poster on failure",
- a headed-Playwright capture harness (`packages/landing/scripts/capture-posters.mjs`)
  that renders posters from the real renderer.

Home should lift this architecture wholesale. The landing's own backlog
(mouse/scroll flame interactivity, Studio technical-demo port) overlaps and
should be reconciled rather than duplicated.

**Two repo constraints that will bite otherwise:**

- Read `.agents/skills/gallery_preview_layout` _before_ touching any
  gallery/preview layout: padding-bottom rather than aspect-ratio, a min-height
  floor, `scrollbar-gutter`, and visibility-gated mounting. Verify on both
  engines plus Nightly and measure real positions.
- Anything rendered through a `Portal` (or otherwise outside the app `Root`)
  must re-provide **both** `<Root>` and `<ComputeGate>` — `AutoCanvas` and the
  preview components depend on both. `LoadFlameModal` is the reference.

**The app-in-app portal** is the one genuinely new piece. It needs its own
`Root`, careful teardown, and a scripted driver built on the existing tour
definitions (`appTour`, `flameCreationTour`, `example1CreationTour`). Being
live rather than recorded means it never goes stale as the UI changes and it
doubles as a real tour — but it is also the heaviest and most fragile section,
which is why it is sequenced last.

## Phases

Each phase is shippable on its own.

- **Phase 0 — Curate.** Choose the flame set: gallery pieces, the animated
  ones, and one per capability card. Capture posters. Everything downstream
  depends on this and it is the part only the author can decide.
- **Phase 1 — Shell, posters only.** The tab, scroll container, section nav,
  footer. No live GPU work at all. This is where art direction gets settled
  against real images, cheaply.
  - **1a — pick the structure.** `home-tab-wireframes.html` in this folder is a
    self-contained greybox tool: 17 layout options across the six sections
    (shell, hero, gallery, in motion, explore, made here), each with its
    trade-off written down, and an assembled preview that stacks the current
    picks in scroll order so the page rhythm is visible. Open it in a browser,
    choose one per section, and the combination at the bottom is the brief for
    1b. Deliberately styling-free — no type, colour or motion decisions are
    encoded in it.
  - **1b — style the chosen structure.** Only once a combination is agreed.
- **Phase 2 — Hybrid live.** Hero goes live; gallery plates upgrade
  poster→live on in-view/hover with off-screen unmount.
- **Phase 3 — In motion.** The animated section, with the auto-play restraint
  described above.
- **Phase 4 — Explore.** Capability cards wired to their curated flames.
- **Phase 5 — Made here.** The live scripted app-in-app portal.
  - **Decided:** scripted by `example1CreationTour` — it rebuilds First Light,
    the hero flame, so the portal shows the flame at the top of the page being
    made.
  - **Configurable, as content.** Tours are code, so D1 stores only the tour
    _id_: a `home_config` key-value table (migration 0003) with
    `portal_tour_id`, served via `GET /api/gallery/config` and resolved
    client-side through the existing `getTour(id)` registry in App.tsx,
    falling back to `example1-creation` when unset or unknown. Swapping the
    portal to any registered tour is then a row write, no deploy — and a
    `gallery-admin config` subcommand (allowlisted keys) is the hook the
    launch console's future "portal settings" control calls, same as every
    other gallery mutation.
- **Phase 6 — Optional.** Retire the welcome screen once Home has earned it.

Phase 1 being poster-only is deliberate insurance: if the layout, pacing, or
type treatment do not work, that is discovered before any GPU budget is spent
on them.

## Art direction

Gallery/museum is the starting spine — flames treated as artworks, generous
negative space, editorial typography, chrome that recedes, each piece given
room and a precise caption.

It is explicitly **not settled**. The stated goal is "sleek minimal text
amazingly integrated between the flames" with real scroll choreography, which
is a more editorial, more composed thing than a plain grid of plates. Phase 1
should produce two or three scroll/type treatments against real posters and the
choice made from something that can actually be looked at, rather than argued
about in the abstract.

Reference points worth pulling from: the app's existing floating-overlay
material (translucent tinted surface, hairline border, backdrop blur — see
`.hover-preview-badge` and the toast region in `App.module.css`) already
establishes a visual language that Home should feel continuous with.

## Risks

- **Concurrent WebGPU contexts.** The known failure mode: rapid allocation of
  buffers and multiple simultaneous previews fragment the Vulkan pool on
  wgpu/Firefox and OOM. `useElementSize` carries a long comment about exactly
  this. Bounded concurrency and off-screen unmount are not optimisations here,
  they are correctness.
- **The portal section** competing with the rest of the page for GPU time.
- **Poster staleness** — posters must be regenerable in CI or they will drift
  from what the renderer actually produces.
- **Scope creep into the landing site.** Home and the landing page share
  content and intent; decide deliberately what is duplicated and what is
  shared code.

## README / marketing, folded in

After Phase 2 the assets exist. The README rewrite then becomes mostly
assembly:

- frontline still or GIF lifted from Home's hero,
- the auto-guided flame-creation recording as the "watch it work" section,
- capability cards as the feature list, near-verbatim,
- plus the parts the README is actually missing: what this is, who it is for,
  what you can do in the first sixty seconds, and where to click.

Doing this once, after Home's assets exist, avoids producing the same visuals
twice.

## Open questions

- Which flames? (Phase 0 — blocks everything.)
- Is Home the default tab on load, or the workspace?
- Does the animated section need audio, given autoplay policies?
- Does the "reopen welcome screen" control land in Home, or in settings
  independently and sooner? (It is a one-button change today — the helper
  already exists and is unused.)
