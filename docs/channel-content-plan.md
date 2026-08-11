# Lumen Apeiron — Channel & Blog Content Plan

> Brainstorm / strategy document — August 2026, against app v0.9.9 plus the
> step recorder currently in flight.
>
> Everything marked **Shipped** works today. **In flight** means landing soon
> and safe to plan around. **Needs building** carries an effort estimate, so no
> series is planned on a feature that does not exist.

---

## 1. What we actually have to film

Before ideas, an inventory of the content surface. Some of it is obvious; the
five levers after the table are what this plan is really built on.

**Obvious levers — all shipped**

| Capability                                                                                            | Content value                                                              |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Real-time WebGPU 2D/3D flame editor                                                                   | The whole show. No install, no render wait for previews.                   |
| 140+ variations, parametric synth variations                                                          | An episode-per-variation engine that cannot run dry.                       |
| Randomizer + Mutation Lab + dice                                                                      | Instant "what does chaos give me" beats.                                   |
| Genetics: breed, 5 crossover modes, Evolution Chamber, Population Simulator, Ancestry Tree, Diff view | The most novel, most legible feature we own.                               |
| Audio-reactive: mic or file → any parameter, node-graph wiring, audio-synced MP4 export               | Ready-made social video.                                                   |
| Sonification: flame structure → live audio (orchestral / ambient / percussive)                        | The "wait, what?" hook — and a music production line (§5).                 |
| Timeline: keyframes, curve editor, track-changes diamond                                              | Animating is watchable as a performance.                                   |
| Math Mode (LaTeX → WGSL) + WGSL editor + share-variation                                              | Maths content that a non-programmer can follow.                            |
| .flame XML import (flam3 / Apophysis)                                                                 | 20 years of community archives, openable on camera.                        |
| Benchmark Studio at `/benchmarks`, shareable result card                                              | Dev-audience content with a built-in viral loop.                           |
| Export: 1K/2K/**4K**, aspect `1:1 / 16:9 / **9:16** / 4:3`                                            | Vertical Shorts at 4K are supported _today_ (`utils/exportDimensions.ts`). |

**The five levers the plan leans on**

1. **The step recorder — the channel's spine.** _(In flight.)_ Once a session
   can be recorded and replayed, every video stops being a video and becomes a
   _playable object_: the viewer replays our exact build in their own browser,
   pauses it, forks it at step 14, and keeps going. That is the thing to go full
   blast on. §7 covers what to build around it so the recordings are watchable
   as well as replayable.

2. **The video _is_ the file.** `utils/flameInMp4.ts` embeds the full flame
   descriptor (and animation envelope) inside the exported MP4, exactly like
   `flameInPng.ts` does for stills. Every video we post is a _droppable asset_ —
   the viewer drags our MP4 back into the app and gets our exact flame. Combined
   with the recorder, the video carries both the destination and the route.

3. **Tours already prove the replay model works.** `src/tours/*` are declarative
   step lists calling the real `executeCommand()` registry, addressable as
   `#tour=<id>`, and Home's "Made here" portal replays one against an isolated
   store. Authored tours are the hand-made version of what the recorder will
   automate — usable today for teaching episodes, and the format the recorder's
   output should be able to slot into.

4. **The Home gallery is a prize.** `gallery_items` in D1 is a content table,
   not a code deploy (`migrations/0001_gallery_content.sql`). Featuring a
   viewer's flame on lumenapeiron.com is a real reward we can hand out weekly at
   zero engineering cost. That is the flywheel's payoff.

5. **We already compute an objective beauty score.** `flame/fitness.ts` scores
   variation diversity, transform balance, colour spread and structural
   complexity into a 0–1 composite. It is currently only wired into the
   Population Simulator — but it is the referee that every "beat my fractal"
   format needs.

---

## 2. The shape of the channel

### The budget decides the format, so do that arithmetic first

At 20–60 minutes a day, the weekly budget is **2.3 to 7 hours**. Against that:

| Unit                                                                    | Realistic cost, end to end |
| ----------------------------------------------------------------------- | -------------------------- |
| One long-form episode (record, edit, thumbnail, description, blog post) | 3–5 h                      |
| One batch of 5 Shorts                                                   | ~2 h                       |
| One ambient loop render (set up once, re-render cheaply)                | ~30 min                    |

A weekly long-form **plus** a Shorts batch is 5–7 hours — the very top of the
range, every day, with no slack for a bad week. So:

> **Start with Shorts only, for the first month.** Fastest feedback loop, builds
> the archive every other series references, cheapest failure, and it does not
> depend on the recorder landing. Add long-form once the recorder ships and your
> own workflow is efficient.

### Don't do daily long-form. It will kill the channel in three weeks.

Daily cadence is right; daily _challenges_ are not. Seven build-and-narrate
videos a week is a full-time job that burns out around week four and leaves a
channel of tired 400-view videos. Split by tier instead:

| Tier                      | Cadence                             | Length   | Effort per unit | Purpose                                       |
| ------------------------- | ----------------------------------- | -------- | --------------- | --------------------------------------------- |
| **A — Shorts / vertical** | 4–6 / week (batched in one session) | 15–45 s  | ~10 min         | Reach. Discovery. Algorithm food.             |
| **B — Flagship series**   | 1 / week _(from month 2)_           | 8–20 min | 3–5 h           | Identity. Retention. Subscribers.             |
| **C — Ambient / passive** | continuous                          | 1–24 h   | ~0 marginal     | Watch-time, plus BesideCue inventory (§5).    |
| **D — Blog post**         | 1 / week, paired to B               | —        | 45 min          | SEO, permanent home for links and recordings. |

Tier A is where "daily" lives. Record ten Shorts in one two-hour sitting on a
Sunday, schedule them out.

### The flywheel

```
Video ends with a share link — and, once the recorder ships, a replay link
   → viewer opens the exact flame (or the exact build) in the browser
   → viewer replays it, forks it mid-way, remixes, exports, submits
   → best submission features in next week's video
   → and is written into gallery_items — now on the product's homepage
   → that person tells everyone they know
```

Every Tier B episode ends with a link and a prompt. That is not a
call-to-action bolted on; it is the format. One hard rule: **use full
`?flame=` links in descriptions and blog posts, never the short `?s=` ones** —
short links are KV-evicted after 60 days and would rot the entire back
catalogue. §8 covers how recordings get the same permanence.

---

## 3. Tier B — the flagship series

Five series in rotation, starting month 2. Rotation beats a single format: it
gives the channel range without asking the audience to learn something new every
week.

### B1. "Make It Look Like \_\_\_"

**The spine of the channel.** The audience names a target — a jellyfish, a
cathedral window, a phoenix, the aurora, a chrysanthemum, a nautilus. Build a
flame that looks like it in 20 minutes.

- **Format:** cold open on the finished frame (always), then rewind to a blank
  canvas. Rules on screen: 20 min, no randomizer for the primary structure,
  must name every variation used.
- **Why it works:** anyone can judge the result in half a second without
  knowing what an IFS is. That legibility is what makes it shareable.
- **Ending:** share link + replay link, plus "your turn — best attempt is in
  next week's video and on the homepage."
- **Status:** Shipped. Gets substantially better with the recorder.

### B2. "Same Seed"

Two artists get the _identical_ starting flame — one share link — and 15
minutes. No talking, split screen, timer, simultaneous reveal.

- **The payoff nobody else can do:** at the end, **breed the two results** and
  play through the children. "Our fractals had a baby." Five crossover modes
  gives a natural five-shot ending montage from the same two parents.
- **Guest version:** a musician, a mathematician, a 3D artist, a complete
  beginner. The beginner episodes will outperform the expert ones.
- **Status:** Shipped. A user-facing seed field (§9) makes it literal and lets
  viewers reproduce the start exactly.

### B3. "Chaos Duel"

Your "beat my fractal" idea, made concrete. Best of three, escalating
constraints:

1. Round 1 — 5 minutes, free build.
2. Round 2 — 3 transforms maximum.
3. Round 3 — your opponent chooses your variations before you start.

- **Judging must be announced before the round** or the comments will just
  argue and there is no clean way to end an episode. Two parts: an audience
  poll, plus a house judge — the `fitness.ts` composite, once surfaced. The
  house judge disagreeing with the audience is good television.
- **Ending:** breed the two finalists. The duel produces a child.
- **Status:** Shipped except the fitness card. Run on audience vote until then.

### B4. "Bloodline" — the fractal family tree

**The strongest serialized idea available, and it needs nothing built.**

Season arc. Episode 1 starts from a single dice roll. Every episode the
reigning flame is bred with something — a community submission, a 2004
Apophysis import, a randomizer roll, last week's duel loser. The audience votes
which of the five children survives.

- The Pedigree view is the recap graphic at the top of every episode — the
  story so far, drawn by the app itself.
- **By episode 20 the family tree is a genuinely beautiful object.** A poster,
  a print, a Ko-fi reward, and a standalone viral post.
- Serialization turns viewers into an audience. Ancestry snapshots are
  immutable (0.9.7), so the lineage will not rot underneath the season.
- **Status:** Shipped, 100%.

### B5. "One Line"

Your maths-and-shader idea, made accessible by Math Mode. Write **one line** of
LaTeX — `\theta = \theta + r \cdot 0.5` — and see what fractal it makes.
Escalate across the season: one line, two lines, "chat writes the equation and I
have to render whatever they give me", then a function from a 1982 paper.

- Ship every episode's variation via the share-variation modal, and write the
  maths up properly in the paired blog post.
- **Honest expectation:** the lowest-viewed series and the highest-value one. It
  recruits contributors, supporters, and the people who file good bug reports.
  Judge it on comments, not views.
- **Status:** Shipped.

---

## 4. Tier A — Shorts, the daily engine

Six formats. All batchable, all vertical — `9:16` export is native.

**A1. "Variation of the Day."** One of the 140+ variations per Short: the
name, the formula, the same base flame before and after. **This alone is
two-plus years of daily content that requires no ideas.** Start here — it builds
the archive, teaches the vocabulary the other series depend on, and becomes the
reference playlist people link to.

**A2. "Guess the Variation."** A flame, three names, a three-second timer,
reveal. Comment-bait by construction, and it teaches.

**A3. "What does this sound like?"** A striking flame, Sonification on, 20
seconds of audio. Three models = three answers per flame.

**A4. Beat-synced loops.** Audio-reactive wiring + a track + `9:16` MP4 export.
**The single highest-probability viral format we have** — no personality, no
talking, no face, and it works identically on Shorts, TikTok and Reels.
Everything else here is a bet; this one is the base rate.

**A5. "Fractal vs. Reality."** Split screen: a photograph of a nautilus, a fern,
lightning, a galaxy — beside a flame built to match. Nature-meets-maths reliably
over-performs, and the Barnsley fern is the proof.

**A6. "Steal This Fractal."** Post something beautiful, give the link, invite
remixes. Zero production cost, feeds the flywheel directly.

---

## 5. Tier C — ambient, and the music production line

This tier is the highest value-per-minute-of-effort work available, and with
BesideCue in the picture it stops being just content and becomes **product
inventory**.

### C1. "The Chamber" — live

The Population Simulator running continuously, sonification as the soundtrack,
chat voting on the selection strategy. Near-zero marginal cost per hour, and
genuinely hypnotic: autonomous evolution means something is always about to
happen.

### C2. Fractal ambient — the production line

Sonification's **Ambient Drone** model plus a slow-moving flame produces
generative ambient music that never repeats. That single asset serves three
destinations:

| Destination   | Form                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| YouTube       | 1–3 hour loops — the study-beats slot, and the largest passive watch-time in this plan. One render, earning for years. |
| **BesideCue** | The "relaxing music" option in the replacement menu.                                                                   |
| Blog          | The flame, the wiring, the share link — "make your own version of this track."                                         |

**The one gap:** there is no sonification audio capture today. `audioExport.ts`
muxes a _source_ track into an animation export, but nothing records what
sonification _generates_. Two ways out, and the second is better:

- **Capture to WAV/MP3** — a small feature (`OfflineAudioContext` or a tap on
  the output node), and it unblocks conventional uploads immediately.
- **Embed the live generator** — BesideCue plays the fractal itself, generating
  audio in the browser, endless and never repeating. That is a far better
  product story than a static MP3, and it needs no export at all. It does need
  a headless/embeddable sonification mode, which is a bigger piece of work — but
  Home's portal already proves the app can run a flame in isolation without
  mounting the workspace (`components/Home/portalScript.ts`), so the pattern
  exists.

Start with capture-to-file for the channel; treat the embed as the BesideCue
integration proper.

### C3. Fractal challenges as BesideCue inventory

BesideCue's menu already wants a "mini game / fun challenge" slot, and a scoped
Lumen Apeiron challenge fits it exactly. But **a BesideCue challenge is a
different shape from a channel challenge**, and designing them the same way
would fail:

|         | Channel challenge           | BesideCue challenge                 |
| ------- | --------------------------- | ----------------------------------- |
| Length  | 5–20 min                    | 3–5 min, completable in one sitting |
| Stakes  | Competitive, scored, public | None. No failure state.             |
| Feeling | Tension                     | Calm, absorbing, a clean exit       |
| Output  | Something to post           | Something you keep — one nice image |

This is what makes the **`?challenge=<slug>` URL param** (§9) more than a
content convenience: it is the integration point between the two apps. A
BesideCue user taps "do a fractal challenge instead of the habit" → deep-links
into a scoped, timed, self-contained challenge → finishes with an image they
keep → back to BesideCue. Every challenge authored for the channel becomes
inventory, and every BesideCue user is a potential Lumen Apeiron user.

### C4. MercuryPitch — the lighter bridge

Sonification maps structure to pitch, scale and stereo position, which is
genuinely adjacent to ear training. Worth one experimental crossover video
("can you hear the interval in this fractal?") before committing to anything
structural — the honest position is that this is a cross-promotion opportunity
between two of your own apps, not yet a product feature. Don't over-invest in
the bridge until the experiment says the connection lands with people who
aren't already invested in both.

### C5. "24 hours of evolution in 3 minutes"

Time-lapse the Chamber. One render, three outputs: standalone upload, Short,
blog post.

---

## 6. Your ideas — challenged and sharpened

### "What can I create in X minutes"

**Strong, but weak as a series spine.** Time alone is not tension — the viewer
cannot tell whether ten minutes was generous or brutal, because they do not know
the tool yet. A timer only becomes dramatic once the audience has a feel for the
work.

Two fixes:

1. **Pair time with a constraint that has a visible failure state.** "20 minutes
   _and only three transforms_" is legible; "20 minutes" is not.
2. **Concentrate the ladder into one video, don't spread it over five.** Your
   increasing/decreasing pressure idea is much better as a single **"The
   Descent"** episode: the same prompt at 10 min → 5 → 2 → 1 → 15 seconds, in
   one sitting. The comedy is in the collapse, the arc is self-contained, and
   you get five artifacts and five thumbnail options out of one recording
   session. Five separate videos have no arc; one descent has a story.

### "What can I wire up to animate nicely in X minutes"

_(Corrected — this is about authoring the motion, not waiting on a render.)_

**This is a better format than the still-image speedrun, and for a specific
reason: the failure state is unmistakable.** A rushed still is merely
underwhelming; a rushed animation _jitters, mushes, or barely moves_, and every
viewer can see it. That legibility is exactly what the still-image version
lacks.

Two variants, both live:

- **Keyframe wiring.** Track-changes diamond on, drag handles, step frames,
  shape the curves. The fractal follows your pointer live (0.9.6 fixed the
  drag-freeze), so the authoring itself is the watchable part.
- **Audio wiring.** Open the node graph against a track you have never heard and
  wire bands → parameters against the clock. Presets and Randomize are on the
  panel, so there is a visible choice each time between rolling for it and
  earning it — good tension.

**On rendering:** a low-quality preview render is fine live and costs you
little. High-quality exports never belong in the stream — kick them off and cut
to the finished output. If a wait must be on screen at all, it should be a
deliberate joke, not dead air.

Ladder the pressure the same way as The Descent: 10 → 5 → 2 minutes.

### "Beat my fractal" / the duel

**The most viral of your ideas and the vaguest.** It fails without a judging
rule stated up front — otherwise the comment section becomes an argument about
what "better" means, and you have no way to end an episode cleanly. Fixes are in
B3: announce the rule before the round, audience poll now and the fitness
composite later, and **end every duel by breeding the two finalists**. That
ending is what makes it ours rather than a generic versus format.

### Making music with fractals — "until X happens"

Sonification and audio-reactive flames are both real and both shipped, so this
is a genuine content pillar rather than a stretch. Three formats, in order of
how ready they are:

1. **"Sculpting by Ear"** — _your challenge, and the best of the three._
   Recorder on, sonification on, and edit the flame until it sounds **good /
   smooth / relaxing**. You are tuning a fractal _by ear_ — the picture is a
   side effect. Nothing else in this space does that, the recorder makes the
   whole session replayable, and the goal ("relaxing") is one a viewer can judge
   without knowing anything about IFS maths. It also directly produces C2's
   ambient inventory: a good session _is_ a track.
2. **"The Feedback Loop"** — sonification drives the speakers, mic input drives
   the audio-reactive wiring, so the flame modulates the sound that is
   modulating the flame. Let it run and see where it settles. Live mic on the
   site was fixed in 0.9.9, so this works today. Route through a virtual audio
   cable (BlackHole / VB-Cable) for a clean loop; the open-room mic version is
   lo-fi and prone to squeal, which is either a problem or the bit.
3. **Musician collaborations** — "send me your track, I'll make you a fractal
   video" is a trade both sides win, produces Tier A content indefinitely, and
   is the most obvious commercial path this tool has (visualisers, album loops,
   live visuals).

**"Until X happens" needs a concrete X.** "Until it sounds relaxing enough that
I'd put it in BesideCue" is a video with a real finish line — and the finish
line ships as a product asset. "Until it sounds nice" is not.

### Create a shape or idea with a fractal system

**Your strongest idea — make it the spine.** It is the only one on your list
that a person who has never heard of an IFS can judge instantly, which is
exactly what carries a video past the people who already care. Everything else
serves the audience you have; this one recruits. That is B1.

### Maths challenges with custom shader code

**Right format, wrong expectations if planned for reach.** Narrow — a fraction
of B1's views. Keep it (B5), because it builds the core: contributors,
supporters, variation authors. Don't schedule it as though it will grow the
channel, and lead with Math Mode rather than WGSL so a non-programmer can
follow.

### One you did not mention, and should skip: deep-zoom videos

The Mandelbrot-zoom genre is the most viral fractal content on the internet, and
**it does not transfer to IFS flames.** A flame's detail comes from point
density, so zooming in means fewer points land in view and the image degrades
into noise — density estimation softens this, it does not solve it. If you want
the zoom aesthetic, get it from camera moves _across_ a flame and from
morph/blend transitions, not from magnification.

---

## 7. The step recorder — and the one feature to build around it

The recorder is in flight, so this section is about what it unlocks and what it
still needs to be _watchable_ rather than merely _replayable_.

### What it unlocks

- **Every video becomes a playable object.** The viewer replays our build in
  their own browser, pauses at any step, forks it, and keeps going. Passive
  watching converts to active use inside one click — the single biggest lever
  the channel has on actual app adoption.
- **Teaching gets cheap.** Right now a teaching episode means hand-authoring a
  tour in TypeScript. With the recorder, you build the thing once and the
  recording _is_ the tutorial.
- **Retakes stop being expensive.** A recorded session can be replayed and
  re-captured at 4K after a UI change, without re-performing it.
- **Challenge submissions become verifiable.** "Here is my 5-minute build" with
  the steps attached is a genuinely new kind of community artifact.

### What it still needs: recorder-aware camera work

**This is the feature that decides whether the videos are followable.** The
number one killer of tool-channel retention is a dense UI at full size while
something small changes in a corner. Nobody can see which slider moved.

So: **when the recorder is ON, the view follows the interaction.**

- The control being changed gets zoomed or spotlit — a slider drag, a handle
  move, a value scrub, a panel opening.
- Ease in and out rather than cutting, so the viewer keeps their bearings.
- Name the action on screen while it happens; `executeCommand` already logs
  `[cmd:execute]` in dev, so the label is available where edits flow through the
  registry.
- Return to full canvas for the result — the payoff of every step is the
  picture, and it should be shown whole.
- **Make it a mode, not a behaviour.** Nobody wants their editor viewport
  lurching around during normal work. It is a "recording mode" toggle that ships
  with the recorder.
- **Make the follow-cam data part of the recording, not the capture.** If the
  zoom decisions are stored alongside the steps, replay gets the same
  cinematography as the video — the viewer's replay is _directed_, not just
  re-executed. That is what separates this from a screen recording, and it is
  worth designing in from the start rather than bolting on.

Spec this **after** the pilot in §12, not before: two weeks of actually filming
will tell you exactly which interactions are unreadable, and that list is a far
better spec than a guess.

### Authored tours in the meantime

Tours already work and are addressable as `#tour=<id>`. Use them for the
foundational teaching videos now, and treat their step model as the target the
recorder's output should be able to slot into — same replay surface, one
hand-written and one captured.

---

## 8. The artifact pipeline — recordings, links, gallery, blog

Every episode should leave behind a permanent, linkable object. Today those
pieces exist but are not joined up, and the failure mode is predictable: six
months of videos whose links have rotted and whose builds live only in the
video file.

**What exists**

- `?flame=` share links — self-contained, never expire. Also `?s=` short links —
  KV, 60-day TTL.
- PNG and MP4 exports with the flame descriptor embedded.
- `gallery_items` in D1 — flame + animation JSON, poster in R2, sections, sort
  order, publish flag. Written by the `gallery-admin` script.
- `#tour=<id>` replay links for hand-authored tours.

**What's missing**

1. **A durable link for a recording.** A recording needs to be as shareable and
   as permanent as a flame — a URL that opens the replay, not a file the viewer
   has to import. Whatever the recorder's storage format is, decide early
   whether the payload rides in the URL (like `?flame=`, permanent but bulky) or
   in a row (compact, but now it can be deleted). **For channel content it must
   be the permanent kind** — a video from 2026 that replays in 2029 is the whole
   promise, and a KV TTL would silently break the back catalogue exactly the way
   `?s=` links would.
2. **Recordings in the gallery.** `gallery_items` holds `flame` and `animation`.
   A `recording` column, or a sibling table keyed the same way, would let a
   featured community build be _replayed_ from Home, not just loaded. That turns
   the gallery from a wall of results into a library of methods.
3. **A blog that can embed all three.** The landing site has two pages and no
   blog. Each post wants: the finished still, the replay embed, the share link,
   the variation source where relevant, and credits. An Astro content collection
   plus a small embed component covers it.
4. **One episode → one slug.** Pick a slug per episode
   (`make-it-look-like-jellyfish`) and use it everywhere: the gallery row, the
   blog post, the `?challenge=` param, the video description, the BesideCue
   inventory entry. Retrofitting consistent identifiers later is miserable;
   deciding it now is free.

**The rule to adopt from episode one:** nothing is published until its artifacts
are saved. It takes ten minutes at the time and is unrecoverable later.

---

## 9. What to build first

Ranked by effort against payoff, with the recording work now leading.

| Change                                                 | Effort    | Why it matters                                                                                                                                                       |
| ------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recorder-aware camera / recording mode** (§7)        | Medium    | Decides whether the videos are followable at all. Spec it from the pilot, not from a guess.                                                                          |
| **Durable recording links + gallery/blog wiring** (§8) | Medium    | Without it the back catalogue rots. Cheapest to decide before the recorder ships, not after.                                                                         |
| **Seed field in the randomizer UI**                    | Small     | `createSeededRandomSource` already exists for benchmark flames and just isn't exposed. Makes "Same Seed" literal and lets viewers reproduce an episode exactly.      |
| **A blog on the landing site**                         | Small     | Two pages today, no blog. An Astro content collection is an afternoon, and it's where links, maths and credits live permanently.                                     |
| **Sonification audio capture**                         | Small     | Unblocks the ambient production line (C2) for conventional uploads.                                                                                                  |
| **Fitness score as a shareable card**                  | Small–med | The composite and its four sub-scores already compute; Benchmark Studio proves we can render a result card. Gives challenges a referee and viewers a number to beat. |
| **`?challenge=<slug>` URL param**                      | Medium    | Content convenience _and_ the BesideCue integration point (C3).                                                                                                      |
| **Community submission path**                          | Medium    | `gallery_items` is admin-write. A submit form plus moderation queue turns every video into a submission driver.                                                      |
| **Ping-pong loop**                                     | Small     | Already on the roadmap. Seamless loops are the whole game on Shorts — raises the ceiling on our highest-reach format.                                                |
| **Embeddable/headless sonification**                   | Large     | The proper BesideCue music integration. Home's portal proves the isolation pattern exists.                                                                           |
| **Motion blur**                                        | Large     | Fast animation reads as steppy. Worth it eventually; not worth delaying the channel for.                                                                             |

---

## 10. What is most likely to travel

1. **Beat-synced vertical loops (A4).** Highest base rate, lowest variance, no
   personality required. Abstract audio-reactive visuals are a proven format; we
   happen to have a better generator than most.
2. **"Our fractals had a baby" (B2/B3 endings).** Breeding is novel _and_
   emotionally legible — two properties that rarely co-occur. Nobody else in
   this space has it in a browser.
3. **"Make It Look Like \_\_\_" with a recognisable target (B1).** Travels because
   the judgement is instant. Pick targets people already have feelings about.
4. **"Sculpting by Ear" and The Feedback Loop.** Editing a fractal by ear is a
   premise people have not seen. High ceiling, and it doubles as production for
   the ambient line.
5. **The 20-generation family tree image (B4 finale).** A single artifact
   carrying a whole season's story, and it posts perfectly to Reddit and Twitter
   with no video at all.

**Will not travel, do anyway:** One Line, benchmarks, devlogs. These build the
contributor core and the funding base described in
`docs/community-and-funding-strategy.md`. Measure them on comments and Ko-fi,
never on views.

---

## 11. Production notes specific to this app

- **Cold open on the finished frame. Always.** Nobody watches a build without
  first knowing it pays off.
- **Hide the sidebar for reveals** (`sidebar.close` is a command; the tours
  already do this). Full-canvas moments should be full canvas.
- **Until recording mode ships, zoom manually in the edit** onto whatever panel
  is in use. Never show the whole app while talking about one slider — and log
  every time you have to do this, because that log is the recording-mode spec.
- **Cut every high-quality render and export.** Low-quality previews are fine
  live; the 4K job is a post-production cut.
- **Failure is content.** Blobs, NaN blow-ups, black screens and mush are funny
  and honest. "I tried to make a phoenix and got a stain" is a better video than
  a flawless build.
- **Credit everyone**, especially in archive episodes. The Apophysis and flam3
  community made the parameters we are opening, and it is a twenty-year-old
  scene with long memories. Getting this right buys goodwill no production value
  can.

---

## 12. Where to start

Your instinct was: finalize the app for recording, then try a few videos, then
adjust. **Invert the first two steps.** Filming before finalizing is what tells
you _what_ to finalize — otherwise you will build a follow-cam that zooms on the
wrong things, and find out six videos later. The recorder is landing on its own
schedule anyway, so the pilot runs in parallel with it rather than behind it.

### Phase 0 — this week (~2 hours, no app work)

Everything here is a decision, not a feature:

- Channel name, handle, and where the blog will live.
- Recording setup: capture tool, resolution (record at 4K if the machine allows,
  so vertical crops stay sharp), mic, whether you're on camera at all.
- Add the Discord invite, YouTube and socials to the **landing page** and the
  **GitHub README** — the app already has the invite in the Help modal
  (`/discord` → `DISCORD_INVITE_URL`), but the two front doors don't.
- Pick the episode-slug convention (§8.4) before the first artifact exists.

### Phase 1 — weeks 1–2, the pilot (~30 min/day, nothing published)

Five Shorts and one long-form take, using only what ships today. The goal is not
content; the goal is **discovering your own friction.**

Keep a running list while you work, in three columns: _what was unreadable on
screen_, _what I fumbled or had to redo_, _what took longer than it should_. That
list is the entire spec for Phase 2 — and it is the reason not to build first.

Exit criterion: you can produce one Short end-to-end in under 15 minutes.

### Phase 2 — spec and build from the pilot (~1 week)

The recorder lands around here. Take the pilot's list and build only the top
three items — near-certainly recording mode's follow-cam (§7), the durable
recording link (§8), and whichever small thing cost you the most time. Resist
building the rest; the backlog in §9 will still be there.

### Phase 3 — weeks 3–6, publish on a schedule

- **Shorts only, 4–5 per week**, batched in one sitting. "Variation of the Day"
  is the backbone — it is the cheapest to make and the most durable.
- **One ambient loop in week 3** (C2). It is a render, not a performance, and it
  is the one asset that also serves BesideCue.
- **Blog post once a week**, even a short one, so the artifact pipeline gets
  exercised before there is a back catalogue to fix.
- No long-form yet. The budget doesn't hold both, and Shorts give faster signal.

### Phase 4 — week 7, the review

At ~20 posts there is finally something to read. What is actually signal at this
volume:

- **Retention curve shape on Shorts** — where people drop is the only reliable
  early signal. A drop at 0:03 is a hook problem; a drop at 0:12 is a pacing
  problem.
- **Saves and shares**, not views. A format that gets saved is a format worth
  serialising.
- **Comments that ask questions.** That means the format is teaching, which is
  what converts viewers into users.
- **Video → app → flame-loaded.** GA4 with conversion-funnel events shipped in
  0.9.8 — instrument this path deliberately, because it is the only number that
  says whether the channel is doing anything for the product.
- **Not subscribers.** Below ~20 posts that number is noise.

Then decide what to add: long-form if the workflow is comfortable and one format
is clearly outperforming; more Shorts variety if nothing has separated yet.

### Standing rule for the whole plan

Don't build a feature for a format you haven't filmed yet. Every item in §9
should be able to point at a specific moment in a specific recording where its
absence hurt.

---

## 13. Housekeeping

The Discord invite **is** in the app — the Help modal's icon row links to
`/discord`, which the Worker redirects to `DISCORD_INVITE_URL`. What's missing
is the two places a new viewer actually lands: **the landing page and the GitHub
README**, neither of which mentions Discord, YouTube or any social link.

Add them alongside the existing Ko-fi and Sponsors badges before episode one. A
video that sends people to a homepage with nowhere to go leaks its entire
audience.
