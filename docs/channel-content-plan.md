# Lumen Apeiron — Channel & Blog Content Plan

> Brainstorm / strategy document — August 2026, against app v0.9.9.
>
> Everything marked **Shipped** works in the app today. Everything marked
> **Needs building** is called out with an effort estimate, so no series is
> planned on a feature that does not exist.

---

## 1. What we actually have to film

Before ideas, an honest inventory of the content surface. Some of these are
obvious; the last four are the ones the plan is really built on.

**Obvious levers (shipped)**

| Capability                                                                                            | Content value                                                              |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Real-time WebGPU 2D/3D flame editor                                                                   | The whole show. No install, no render wait for previews.                   |
| 140+ variations, parametric synth variations                                                          | An episode-per-variation engine that cannot run dry.                       |
| Randomizer + Mutation Lab + dice                                                                      | Instant "what does chaos give me" beats.                                   |
| Genetics: breed, 5 crossover modes, Evolution Chamber, Population Simulator, Ancestry Tree, Diff view | The most novel, most legible feature we own.                               |
| Audio-reactive: mic or file → any parameter, node-graph wiring, audio-synced MP4 export               | Ready-made social video.                                                   |
| Sonification: flame structure → live audio (orchestral / ambient / percussive)                        | The "wait, what?" hook.                                                    |
| Timeline: keyframes, curve editor, track-changes diamond                                              | Animating is watchable as a performance.                                   |
| Math Mode (LaTeX → WGSL) + WGSL editor + share-variation                                              | Maths content that a non-programmer can follow.                            |
| .flame XML import (flam3 / Apophysis)                                                                 | 20 years of community archives, openable on camera.                        |
| Benchmark Studio at `/benchmarks`, shareable result card                                              | Dev-audience content with a built-in viral loop.                           |
| Export: 1K/2K/**4K**, aspect `1:1 / 16:9 / **9:16** / 4:3`                                            | Vertical Shorts at 4K are supported _today_ (`utils/exportDimensions.ts`). |

**The four non-obvious levers — the plan leans on these**

1. **The video _is_ the file.** `utils/flameInMp4.ts` embeds the full flame
   descriptor (and animation envelope) inside the exported MP4, exactly like
   `flameInPng.ts` does for stills. Every video we post is a _droppable asset_ —
   the viewer drags our MP4 back into the app and gets our exact flame. No other
   fractal channel can offer that. It should be stated in every description.

2. **Tours are executable video scripts.** `src/tours/*` are declarative step
   lists that call the real `executeCommand()` registry against the real app
   (`commands/builtins`, 33 commands today). A tour is a _reproducible take_:
   perfectly paced, no mouse fumbling, and re-recordable at 4K whenever the UI
   changes. And they are addressable — `#tour=<id>` — so the viewer replays our
   exact steps inside the app while watching. This is the real answer to
   "recording and replaying of steps" (see §7 for the caveat).

3. **The Home gallery is a prize.** `gallery_items` in D1 is a content table,
   not a code deploy (`migrations/0001_gallery_content.sql`). Featuring a
   viewer's flame on lumenapeiron.com is a real reward we can hand out weekly at
   zero engineering cost. That is the flywheel's payoff.

4. **We already compute an objective beauty score.** `flame/fitness.ts` scores
   variation diversity, transform balance, colour spread and structural
   complexity into a 0–1 composite. It is currently only wired into the
   Population Simulator — but it is the referee that every "beat my fractal"
   format needs.

---

## 2. The shape of the channel

### Don't do daily long-form. It will kill the channel in three weeks.

Daily cadence is right; daily _challenges_ are not. A 15-minute
build-and-narrate video is 3–5 hours of work end to end. Seven of those a week
is a full-time job that burns out around week four, and the result is a channel
of tired 400-view videos.

Split the cadence by tier instead:

| Tier                      | Cadence                             | Length   | Effort per unit | Purpose                                                        |
| ------------------------- | ----------------------------------- | -------- | --------------- | -------------------------------------------------------------- |
| **A — Shorts / vertical** | 4–6 / week (batched in one session) | 15–45 s  | ~10 min         | Reach. Discovery. Algorithm food.                              |
| **B — Flagship series**   | 1 / week                            | 8–20 min | 3–5 h           | Identity. Retention. Subscribers.                              |
| **C — Ambient / passive** | continuous                          | 1–24 h   | ~0 marginal     | Watch-time. Sleep/study/lofi audience.                         |
| **D — Blog post**         | 1 / week, paired to B               | —        | 45 min          | SEO, permanent home for share links, the thing Google indexes. |

Tier A is where "daily" lives. Record ten Shorts in one two-hour sitting on a
Sunday, schedule them out. Tier B is the show people subscribe for.

### The flywheel

```
Video ends with a share link (?flame= or ?s=)
   → viewer opens the exact flame in the browser, no install
   → viewer remixes it, exports, submits
   → best submission is featured in next week's video
   → and written into gallery_items → it is now on the product's homepage
   → that person tells everyone they know
```

Every Tier B episode must end with a link and a prompt. This is not a
call-to-action bolted on; it is the format. The share-link system
(`utils/shareLink.ts` — `?flame=` never expires, `?s=` short links expire at 60
days) already makes it frictionless — **use `?flame=` links in video
descriptions and blog posts, never `?s=`**, since short links are KV-evicted
after 60 days and would rot every back-catalogue video.

---

## 3. Tier B — the flagship series

Five series, rotating. Rotation beats a single format: it gives the channel
range without asking the audience to learn something new every week.

### B1. "Make It Look Like \_\_\_"

**The spine of the channel.** Audience names a target — a jellyfish, a
cathedral window, a phoenix, the aurora, a chrysanthemum, a nautilus. Build a
flame that looks like it in 20 minutes.

- **Format:** cold open on the finished frame (always), then rewind to a blank
  canvas. Rules on screen: 20 min, no randomizer for the primary structure,
  must name every variation used.
- **Why it works:** anyone can judge the result in half a second without
  knowing what an IFS is. That legibility is what makes it shareable — the
  entire "draw X but with constraints" genre works on this principle.
- **Ending:** share link, plus "your turn — best attempt is in next week's
  video and on the homepage."
- **Status:** Shipped, 100%.

### B2. "Same Seed"

Two artists get the _identical_ starting flame — one share link — and 15
minutes. No talking, split screen, timer. Reveal simultaneously.

- **The payoff nobody else can do:** at the end, **breed the two results** and
  play through the children in the Breed Gallery. "Our fractals had a baby."
  Five crossover modes = five different offspring from the same two parents,
  which is a natural five-shot ending montage.
- **Guest version:** invite a musician, a mathematician, a 3D artist, a
  complete beginner. The beginner episodes will outperform the expert ones.
- **Status:** Shipped. A user-facing seed field (§8.1) would make it cleaner
  and let viewers reproduce the starting point exactly, but share links already
  do the job.

### B3. "Chaos Duel"

Your "beat my fractal" idea, made concrete. Best of three, escalating
constraints:

1. Round 1 — 5 minutes, free build.
2. Round 2 — 3 transforms maximum.
3. Round 3 — your opponent chooses your variations before you start.

- **Judging must be announced before the round or the comments will just
  argue.** Two-part score: audience poll (YouTube community post / Shorts poll)
  plus a "house judge" — the `fitness.ts` composite, if we surface it (§8.3).
  The house judge disagreeing with the audience is _good television_.
- **Ending:** breed the two finalists. The duel produces a child.
- **Status:** Shipped except the fitness card. Run it on audience vote alone
  until then.

### B4. "Bloodline" — the fractal family tree

**The strongest serialized idea available, and it is fully shipped.**

Season arc. Episode 1 starts from a single dice roll. Every episode, the
reigning flame is bred with something — a community submission, a 2004
Apophysis import, a randomizer roll, last week's duel loser. The audience votes
which of the five children survives to the next episode.

- The Ancestry / Pedigree view is the recap graphic at the top of every
  episode — the story so far, drawn by the app itself.
- **By episode 20 the family tree is a genuinely beautiful object.** That is a
  poster, a print, a Ko-fi reward, and a standalone viral post ("this fractal
  has 20 generations of ancestors, here's its family tree").
- Serialization is what turns viewers into an audience. This is the series that
  makes people come back on a schedule.
- **Status:** Shipped, 100%. Ancestry snapshots are immutable (0.9.7 fix), so
  the lineage will not rot underneath the season.

### B5. "One Line"

Your maths-and-shader idea, made accessible by Math Mode. Write **one line** of
LaTeX — `\theta = \theta + r \cdot 0.5` — and see what fractal it makes.

- Escalate through the season: single line → two lines → "chat writes the
  equation and I have to render whatever they give me" → "here is a function
  from a 1982 paper, let's see it".
- Ship every episode's variation via the share-variation modal, and write the
  actual maths up in the paired blog post. This is the series that earns the
  respect of the creative-coding crowd.
- **Honest expectation:** this will be the lowest-viewed series and the
  highest-value one. It recruits contributors, Ko-fi supporters, and the people
  who file good bug reports. Don't judge it on views; judge it on comments.
- **Status:** Shipped (Math Mode, WGSL editor, custom-variation sharing).

---

## 4. Tier A — Shorts, the daily engine

Six formats, all batchable, all vertical (`9:16` export is native).

**A1. "Variation of the Day."** One of the 140+ variations per Short: the
name, the formula, and the same base flame before/after. This alone is
**two-plus years of daily content** that requires no ideas. Start here — it
builds the archive, teaches the vocabulary the other series depend on, and
becomes the reference playlist people link to.

**A2. "Guess the Variation."** Show a flame, three names, three-second timer,
reveal. Comment-bait by construction, and it teaches. Cheap to produce in bulk.

**A3. "What does this sound like?"** Show a striking flame, hit Sonification,
20 seconds of audio. Three models = three answers per flame. The novelty does
the work.

**A4. Beat-synced loops.** Audio-reactive wiring + a track + `9:16` MP4 export.
**This is the single highest-probability viral format we have** — it needs no
personality, no talking, no face, and it works identically on Shorts, TikTok
and Reels. Everything else on this list is a bet; this one is the base rate.

**A5. "Fractal vs. Reality."** Split screen: photograph of a nautilus, a fern,
lightning, a galaxy — and a flame built to match it. Nature-meets-maths content
reliably over-performs, and the Barnsley fern is the canonical proof that it
works.

**A6. "Steal This Fractal."** Post a beautiful flame, give the link, invite
remixes. Zero production cost, directly feeds the flywheel.

---

## 5. Tier C — ambient and passive

**C1. "The Chamber — live."** The Population Simulator running continuously,
sonification as the soundtrack, chat voting on the selection strategy. Near-zero
marginal cost per hour of content, and it is genuinely hypnotic. Autonomous
evolution is a strong stream premise: something is always about to happen.

**C2. Long loops.** One to three hours of audio-reactive flames against ambient
music. This is the lofi-study-beats slot, and it is where the largest passive
watch-time in this entire plan lives. One good render, uploaded once, earns for
years.

**C3. "24 hours of evolution in 3 minutes."** Time-lapse the Chamber. Good
standalone upload, good Short, good blog post.

---

## 6. Your six ideas — challenged and sharpened

You asked me to push back. Here is where each one is strong, and where it
breaks.

### "What can I create in X minutes"

**Strong, but weak as a series spine.** Time alone is not tension — the viewer
cannot tell whether ten minutes was generous or brutal, because they do not
know the tool yet. A timer is only dramatic once the audience has a feel for
the work.

Two fixes:

1. **Pair time with a constraint that has a visible failure state.** "20 minutes
   _and only three transforms_" is legible; "20 minutes" is not. That is why B1
   carries rules on screen.
2. **Concentrate the ladder into one video, don't spread it over five.** Your
   increasing/decreasing pressure idea is much better as a single **"The
   Descent"** episode: same prompt at 10 min → 5 → 2 → 1 → 15 seconds, in one
   sitting. The comedy is in the collapse, the arc is self-contained, and you
   get five artifacts and five thumbnail options out of one recording session.
   Five separate "X minutes" videos have no arc; one descent has a story.

### "What can I animate in X minutes"

**Weaker than it looks, for a mechanical reason: rendering is not instant.**
Offscreen animation export takes real wall-clock time, and dead air watching a
progress bar is the fastest way to lose a viewer. Never show the export running
unless the wait itself is the joke.

The version that does work: **the track-changes diamond turns animating into a
performance.** Turn the diamond on, drag handles, step frames, repeat — the
fractal follows your pointer live (0.9.6 fixed the drag-freeze). Film _that_,
cut to the finished render. Call it "60-Second Animation" and keep it in Tier A.

### "Beat my fractal / fractal duel"

**The most viral of your ideas and the vaguest.** It fails without a judging
rule stated up front — otherwise the comment section becomes an argument about
what "better" means, and you have no way to end an episode cleanly.

Fixes are in B3: announce the rule before the round, use an audience poll now
and the `fitness.ts` composite later, and **end every duel by breeding the two
finalists**. The breeding ending is what makes it ours instead of a generic
versus format.

### "Making music with fractals, until X happens"

**Set expectations honestly: sonification is a fascinating texture, not a
banger.** A flame's structure mapped to pitch and timbre produces something
compelling and strange, not something you would put on a playlist. Framing it
as "what does this shape sound like" is true and interesting. Framing it as
"making music" invites a comparison it will lose.

Two upgrades:

1. **"The Feedback Loop"** — the video I would make first. Sonification drives
   the speakers, the mic input drives the audio-reactive wiring, so the flame
   modulates the sound that is modulating the flame. Let it run and see where it
   settles. Live mic on the site was fixed in 0.9.9, so this works today.
   Practical note: route through a virtual audio cable (BlackHole / VB-Cable)
   for a clean loop; the open-room mic version is lo-fi and prone to squeal,
   which is either a problem or the bit, depending on your mood.
2. **Collaborate with a musician for anything that needs to be actually
   musical.** "Send me your track, I'll make you a fractal video" is a free
   trade both sides win, it produces Tier A content indefinitely, and it is the
   most obvious commercial path this tool has (visualisers, album loops, live
   visuals).

"Until X happens" is a good open-ended framing, but it needs a concrete X.
"Until the Population Simulator makes something I would frame" is a video.
"Until it sounds nice" is not.

### "Create a shape or idea with a fractal system"

**This is your strongest idea, and it should be the spine — that is B1.** It is
the only one on your list that a person who has never heard of an IFS can judge
instantly, which is exactly what makes a video travel beyond the people who
already care. Everything else is for the audience you already have; this is the
one that recruits.

### "Maths challenges with custom shader code"

**Correct format, wrong expectations if you plan it for reach.** It is narrow —
it will pull a fraction of B1's views. Keep it (B5, "One Line"), because it
builds the _core_: contributors, supporters, people who will write variations.
Just do not schedule it as though it will grow the channel, and lead with Math
Mode rather than WGSL so a non-programmer can follow along.

### One you did not mention, and should skip: deep-zoom videos

The Mandelbrot-zoom genre is the most viral fractal content on the internet,
and **it does not transfer to IFS flames.** A flame's detail comes from point
density, so zooming in means fewer points land in view and the image degrades
into noise — density estimation softens this, it does not solve it. Plan around
it. If you want the zoom aesthetic, get it from _camera moves across_ a flame
and from morph/blend transitions, not from magnification.

---

## 7. "Recording and replaying of steps" — what is actually possible

You listed this as a content pillar, and it deserves a precise answer, because
there are three different things behind that phrase and they have very different
costs.

**Today (shipped):**

- **Tours** are a declarative, replayable command script — `beforeShow` hooks
  calling `executeCommand('flame.addTransform', …)` against the real app. They
  are shareable as `#tour=<id>` and they are already used in production twice:
  the Spotlight tour and the Home "Made here" portal, which replays a real tour
  against an isolated store (`components/Home/portalScript.ts`).
- So: **hand-author a tour, record it, publish the link.** The video is the
  narration; the tour is the replay. The viewer follows our exact steps in their
  own browser, at their own pace, in the live app. That is a better deliverable
  than a screen recording, and it costs one TypeScript file per episode.

**What does not exist: recording a _user session_ automatically.** A true
"record what I did and replay it" feature needs every mutation to flow through
the command registry, and today only 33 commands exist while most of the UI
writes to the store directly (`executeCommand` has essentially two call sites
outside tours: the shortcut manager and MainWorkspace). Building it means
routing edits through commands — a medium-sized refactor, but one with real
product value beyond content: undo already has unified history, and a command
log would give us session replay, shareable "recipes", and automated tutorial
authoring. Worth a plan doc of its own; not worth blocking the channel on.

**Recommendation:** start with authored tours per teaching episode. If the
format proves out over a season, propose the session recorder as a v1.1 feature
with the channel as its first customer.

---

## 8. Small app changes that would disproportionately improve the content

Ranked by effort-to-payoff. None of these are blockers; all of them make the
videos better.

1. **Seed field in the randomizer UI** — _small._ The seeded source already
   exists (`createSeededRandomSource` in `flame/randomize.ts`) and is used for
   deterministic benchmark flames; it is just not exposed. Exposing it makes
   "Same Seed" literal, lets every viewer reproduce an episode exactly, and
   turns a seed into a shareable object ("today's seed is 40817").

2. **A blog on the landing site** — _small._ `packages/landing/src/pages` has
   exactly two pages today; there is no blog. An Astro content collection is an
   afternoon. Every episode needs a permanent home for its share links, its
   maths, and its credits — YouTube descriptions are not indexable in the way we
   need, and this is where the SEO actually accrues.

3. **Surface the fitness score as a shareable card** — _small–medium._
   `fitness.ts` already computes the composite and its four sub-scores; the
   Benchmark Studio already proves we can render a shareable result card. This
   gives every challenge an impartial referee and gives every viewer a number to
   beat.

4. **Community submission path** — _medium._ `gallery_items` is admin-write via
   the `gallery-admin` script. A "submit your flame" form plus a moderation
   queue turns every video into a submission driver, and "your flame is on the
   homepage" is a prize that costs us nothing.

5. **`?challenge=<slug>` URL param** — _medium._ Loads the starting flame, shows
   the rules, runs a timer overlay. Turns the channel's format into a product
   feature, and makes the challenge playable by someone who found it from a link
   rather than the video.

6. **Ping-pong loop** — _small, already on the roadmap._ Seamless loops are the
   whole game on Shorts/TikTok. The loop toggle exists; ping-pong does not. This
   directly raises the ceiling on our highest-reach format (A4).

7. **On-screen command overlay ("recording mode")** — _small._ `executeCommand`
   already logs `[cmd:execute]` in dev. A toggleable overlay naming the action
   that just fired makes dense-UI footage readable without a voiceover.

8. **Motion blur** — _large, on the roadmap._ Fast animation currently reads as
   steppy. Worth it eventually for polish; not worth delaying the channel for.

---

## 9. What is most likely to travel — ranked, with reasoning

1. **Beat-synced vertical loops (A4).** Highest base rate, lowest variance, no
   personality required. Abstract audio-reactive visuals are a proven format;
   we just happen to have a better generator than most.
2. **"Our fractals had a baby" (B2/B3 endings).** Breeding is novel _and_
   emotionally legible — two properties that rarely co-occur. Nobody else in
   this space has it in a browser.
3. **"Make It Look Like \_\_\_" with a recognisable target (B1).** Travels because
   the judgement is instant. Pick targets people already have feelings about.
4. **The Feedback Loop.** Pure "what am I watching" novelty. One-shot rather
   than a series, but a strong one-shot.
5. **The 20-generation family tree image (B4 season finale).** A single
   artifact that carries the whole season's story, and posts perfectly to
   Reddit and Twitter without any video at all.

**Will not travel, do anyway:** One Line, benchmarks, devlogs. These build the
contributor core and the funding base described in
`docs/community-and-funding-strategy.md`. Measure them on comments and Ko-fi,
never on views.

---

## 10. Production notes specific to this app

The failure mode for tool channels is always the same: a dense unfamiliar UI on
screen at 1080p, and the viewer leaves at 0:20. Specific mitigations here:

- **Cold open on the finished frame. Always.** Nobody watches a build without
  first knowing it pays off.
- **Hide the sidebar for reveals** (`sidebar.close` is a command; the tours
  already do this). Full-canvas moments should be full canvas.
- **Zoom the recording on the panel being used.** Never show the whole app while
  talking about one slider.
- **Cut every render and export.** They are dead air. The one exception is when
  the wait is the joke.
- **Show the keystrokes**, or add the command overlay (§8.7).
- **Use the tours for anything explanatory** — a scripted take is better paced
  than a live one, and re-recordable when the UI changes.
- **Failure is content.** Blobs, NaN blow-ups, black screens and mush are funny
  and honest, and "I tried to make a phoenix and got a stain" is a better video
  than a flawless build. Keep the bad takes.
- **Credit everyone.** Especially in Flame Archaeology episodes — the Apophysis
  and flam3 community made the parameters we are opening, and this is a
  20-year-old scene with long memories. Getting this right buys goodwill that no
  amount of production value will.

---

## 11. First eight weeks — a concrete schedule

Assumes one long-form recording session and one Shorts batch per week.

| Week | Tier B (long)                                                                                                                                | Tier A (batch of 5)                          | Blog                                  | Notes                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| 1    | **"What is a fractal flame?"** — record the `flame-creation` tour: skip-iters at 1, raw chaos, structure emerges. Publish the `#tour=` link. | Variation of the Day ×5                      | "Start here" + every link             | Foundation episode; everything later references it. |
| 2    | **B1** — Make It Look Like: _a jellyfish_                                                                                                    | Beat-synced loops ×3, Guess the Variation ×2 | B1 write-up + share link              | First submission call.                              |
| 3    | **B5** — One Line: `\theta = \theta + r`                                                                                                     | Variation of the Day ×5                      | The maths, properly                   | Recruits the dev audience early.                    |
| 4    | **B2** — Same Seed vs. a total beginner                                                                                                      | Fractal vs. Reality ×2, sonification ×3      | Both flames + the five children       | Beginner guests outperform experts.                 |
| 5    | **B4 — Bloodline, ep. 1.** One dice roll. Vote opens.                                                                                        | Steal This Fractal ×5                        | The lineage page (updated all season) | Season starts; set the voting cadence.              |
| 6    | **"The Descent"** — same prompt at 10/5/2/1 min and 15 s                                                                                     | Beat-synced loops ×5                         | All five artifacts                    | Your time-pressure idea, concentrated.              |
| 7    | **B3** — Chaos Duel #1, ending in a breed                                                                                                    | Guess the Variation ×5                       | Poll results + the child              | Announce judging rules on screen.                   |
| 8    | **The Feedback Loop** — sonification ↔ mic ↔ flame                                                                                           | Variation of the Day ×5                      | How the routing works                 | The novelty swing.                                  |

Start **C2 (long ambient loops)** in week 1 and let it accumulate quietly in the
background — it costs one render and it earns for years.

---

## 12. Housekeeping

There is a project Discord — the share modal posts flames to it through the
Worker's `/api/share-discord` webhook — but **no invite link, YouTube link or
social link appears anywhere in the app, the landing site or the README.**
Flames can be sent to a room nobody watching a video can find their way into.

Before episode one ships, those links need a home in: the Help modal, the About
panel, the landing footer, and the README badges row — alongside the existing
Ko-fi and GitHub Sponsors badges. A video that sends people to a homepage with
nowhere to go leaks its entire audience.
