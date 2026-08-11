# Shorts Production Playbook

> Companion to `channel-content-plan.md`. This is the "what do I actually do
> tomorrow" document: per-format shot lists, exact settings, overlay text specs,
> and a two-hour batch session that produces a week of Shorts.

---

## 0. The thing that changes everything: most Shorts are exports, not screen recordings

The app exports **9:16 MP4 at up to 4K, with audio muxed in**
(`utils/exportDimensions.ts`, `utils/audioExport.ts`). So for most formats you
are not filming a screen at all — you are rendering a finished vertical video
and cutting it in an editor.

| Format                    | How it's captured                                                     |
| ------------------------- | --------------------------------------------------------------------- |
| Beat-synced loops (A4)    | **Export.** 9:16 audio-synced MP4, straight out of the app.           |
| Variation of the Day (A1) | **Export ×2.** Base flame, then with the variation. Cut between them. |
| Guess the Variation (A2)  | **Export ×1** + editor captions.                                      |
| Fractal vs. Reality (A5)  | **Export ×1** + a photo in the editor.                                |
| Steal This Fractal (A6)   | **Export ×1.**                                                        |
| Sonification clips (A3)   | **Screen capture** — nothing exports sonification audio yet (see §6). |
| "Watch me build" clips    | **Screen capture.**                                                   |

This means: **no OBS needed for four of the six formats.** Set that up later,
only for the two that need it.

---

## 1. Variation of the Day — the backbone

### The scripts are already written

`src/flame/variations/docs/content*.ts` documents **381 variations, 229 of them
with a LaTeX formula**, each with a plain-language summary drafted from the maths
the GPU actually runs. Example, verbatim from the repo:

> **`bilinearVar`** — "Swaps the x and y coordinates and scales by the weight,
> reflecting the point across the diagonal line y equals x."
> `V = w \cdot (y,\ x)`

That is the entire Short. Name, formula, one sentence. **You are not writing
content, you are reading it out of your own codebase**, which is why this format
can run daily for two years without a planning session.

### Shot list (per episode, ~4 minutes of work)

1. Load a **base flame** — keep the _same_ base flame for a whole week so the
   variation is the only thing that changes. Viewers learn to read the diff.
2. Export the base: **9:16, 1K, 3 seconds.** (1K is plenty for a Short; 4K
   is wasted upload time.)
3. Add the variation, weight ~0.5. Let it settle.
4. Export again, same settings.
5. In the editor: base for 1.5 s → hard cut → variation for 4 s → hold.

### Overlay text

```
top:     bilinear                    ← mono, large
under:   V = w · (y, x)              ← the formula, smaller
bottom:  "reflects every point across y = x"
corner:  lumenapeiron.com            ← every single video, always
```

Keep the layout **identical every episode.** Sameness is the point — it makes
the series recognisable in a feed and makes batching trivial.

### First two weeks — pick visually legible ones

Don't start with `acosechVar`. Start with variations whose effect you can _see_
and _name_ in one cut:

| Day | Variation       | Why it reads well                                    |
| --- | --------------- | ---------------------------------------------------- |
| 1   | `bilinear`      | Simple mirror — the clearest possible first episode. |
| 2   | `swirl`         | Everyone recognises a swirl.                         |
| 3   | `horseshoe`     | Classic flam3, dramatic shape change.                |
| 4   | `spherical`     | The inversion look that says "fractal flame".        |
| 5   | `bubble`        | Soft, round, obviously different.                    |
| 6   | `curl`          | Visible directional twist.                           |
| 7   | `disc2`         | Radial, striking.                                    |
| 8   | `cardioid`      | A named curve people know.                           |
| 9   | `cannabisCurve` | Recognisable silhouette, will get comments.          |
| 10  | `chrysanthemum` | Beautiful, and the name sells it.                    |
| 11  | `boxfold`       | Sharp geometric break — contrast to the curvy ones.  |
| 12  | `dragon`        | Named after something people know.                   |
| 13  | `cell`          | Grid structure, very different from the rest.        |
| 14  | `butterflyFay`  | Pretty, and a good week-two payoff.                  |

All fourteen are confirmed present in the docs archive (checked against
`content*.ts`). Note the registry literal carries a `Var` suffix — `swirlVar`,
`bilinearVar` — while the UI label drops it; use the bare name on screen.

### Worth building: a caption generator

A ~40-line script — `scripts/shorts-card.ts` — that takes a variation id and
prints the overlay block (name, `tex`, summary) ready to paste into the editor.
The data is already structured; this just saves you opening the source every
day. Half an hour to write, saves two minutes an episode forever.

---

## 2. Beat-synced loops — the highest-reach format

### The one thing to get right

There are six wiring presets, and they are **not equivalent**:

| Preset        | What it does                                          | Use for social?                      |
| ------------- | ----------------------------------------------------- | ------------------------------------ |
| **Pulse**     | Bass drives colour intensity, beats sweep the palette | Colour only — the shape doesn't move |
| **Bloom**     | Loudness opens brightness, highs lift saturation      | Colour only                          |
| **Drift**     | Mids breathe the zoom, palette rotates                | Mild motion                          |
| **Structure** | Bands re-weight _this flame's_ transforms             | **Yes — the shape itself moves**     |
| **Morph**     | Bands drive _this flame's_ variation weights          | **Yes — geometry warps**             |
| **Swarm**     | Bands scale transform affines                         | **Yes — form scatters and gathers**  |

**Lead with Morph or Swarm.** Pulse and Bloom only change colour and exposure,
which reads as "a flashing picture" rather than "a dancing fractal" — that's the
difference between a scroll-past and a rewatch.

### Shot list (~12 minutes per loop)

1. **Pick the flame first, the track second.** A flame with clear separated
   structure moves better than a dense blob. The 56 built-in examples are the
   fastest source.
2. Open the Audio panel, load the track, wait for analysis (the progress bar is
   honest as of 0.9.9 — it reflects the real analysis pass).
3. Apply **Morph**, then hit Randomize once or twice if it feels flat. The three
   flame-driven presets are built from the loaded flame, so they behave
   differently on every flame — rolling is legitimate, not lazy.
4. **Tune attack/release.** Defaults are 40 ms attack / 220 ms release. Shorter
   release strobes; longer release smears. For a loop, err long — around 250–350
   ms — so it breathes rather than flickers.
5. Scrub to a **musically loopable 15–30 s section** — one that starts and ends
   on the same beat. There is no ping-pong loop yet, so the loop point is your
   responsibility; pick a bar boundary.
6. Preview live. If the motion is subtle, raise sensitivity before touching
   anything else.
7. **Export: 9:16, 2K, audio-synced MP4.**

### On music

Three sources, in order of preference:

1. **Your own fractal ambient** (plan §5 C2) — no licensing, and the video is
   scored by the tool it's about. Needs sonification capture (§6).
2. **A collaborating musician** — "send me a track, I'll make you a video" is a
   trade both sides win, and it produces content indefinitely.
3. Platform-native audio libraries. Note the catch: **a track that's licensed on
   TikTok is not licensed on YouTube**, so a single export using platform audio
   cannot be cross-posted. If you want one file on three platforms, the audio has
   to be yours or licensed for all three.

---

## 3. Guess the Variation

~5 minutes per episode, and it doubles as the quiz half of the A1 archive.

1. Export a flame built with **one** distinctive variation. 9:16, 1K, 5 s.
2. Editor: three names on screen, one correct. Pull the two decoys from the docs
   archive — choose ones that are _plausible_, not absurd. Two curvy siblings and
   the answer is a better quiz than the answer plus two geometrics.
3. Three-second countdown. Reveal the answer with its one-line summary.
4. **Pin the first comment with the answer explained.** That's where the
   engagement lives, and it converts a guess into a lesson.

Batch these five at a time from the same base flame — the setup cost is paid
once.

---

## 4. Fractal vs. Reality

The highest ceiling of the cheap formats, and the slowest, so do one a week, not
one a day.

1. Choose the reference first: nautilus, fern, lightning, a spiral galaxy, a
   peacock feather, frost on glass.
2. Build toward it. Budget 20–30 minutes — this is the one Short worth real
   effort.
3. Export 9:16, 2K.
4. Editor: photo on top half, fractal on bottom, or a wipe between them.
5. Credit the photograph properly, including licence. Use CC-licensed or your own
   photos only.

---

## 5. Steal This Fractal

The cheapest thing on this list and the only one that directly feeds the
flywheel.

1. Export any flame you like. 9:16, 2K, 8 s of slow camera drift.
2. Caption: "this one's yours — link in bio."
3. Description carries the **full `?flame=` link** — never the short `?s=` one,
   which expires after 60 days and would rot the post.

---

## 6. Sonification clips — and the one blocker

Nothing in the app captures what sonification _generates_
(`audioExport.ts` only muxes a _source_ track into an animation export). So
until that ships, these need **system-audio screen capture**:

- OBS, capturing the browser window plus desktop audio.
- Record 9:16 by sizing the browser window to a vertical aspect, or record 16:9
  and crop in the edit — cropping loses resolution, so prefer the window resize.
- Three models (orchestral / ambient / percussive) × three scales
  (pentatonic major / pentatonic minor / chromatic) = nine takes per flame with
  no extra setup. That's a week of A3 from one session.

This is the one place a small feature — capture sonification to WAV — would
remove a whole tool from your pipeline. Worth building early for that reason
alone, separate from the ambient production line it also unblocks.

---

## 7. Overlay text: the house style

Decide this once and never think about it again.

| Element         | Spec                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Typeface        | One mono for data (names, formulas, values), one sans for prose. Two faces total.                           |
| Safe area       | Keep everything **inside the middle 80% vertically** — platform UI eats the top and bottom of a 9:16 frame. |
| Constraint line | Pinned top-left when there's a rule or a clock: `20:00 · 3 transforms`                                      |
| Action label    | Bottom-left, appears as it happens: `+ spherical · w 0.4`                                                   |
| Watermark       | `lumenapeiron.com` bottom-right, every video, small, always.                                                |
| Colour          | White text with a subtle dark scrim. Never coloured text over a flame — the flame is already saturated.     |

When recording mode ships (plan §7), the action labels come out of the app for
free and this becomes half-automatic.

---

## 8. The two-hour batch session

One sitting per week produces five to seven Shorts.

| Time      | What                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:10 | Open the app, pick the week's base flame, open the editor project template.                                                                                                 |
| 0:10–0:50 | **Capture only. No editing.** Run every export back to back: 5× Variation of the Day (10 exports), 1 beat-synced loop, 1 quiz flame. Dump everything into one dated folder. |
| 0:50–1:35 | **Edit only.** Duplicate last week's editor project, swap the clips, swap the text. The template is the whole trick.                                                        |
| 1:35–1:50 | Export all, name by convention (§9).                                                                                                                                        |
| 1:50–2:00 | Upload and schedule (see `distribution-playbook.md`).                                                                                                                       |

Two rules that make this work: **never edit while capturing** (context switching
is what turns two hours into four), and **build the editor template once** — the
first session takes three hours because you're making the template; every one
after is two.

---

## 9. File naming

Pick this now; retrofitting is miserable.

```
2026-08-12_a1_variation-of-the-day_bilinear_9x16.mp4
2026-08-12_a4_beat-loop_morph_ember-drift_9x16.mp4
YYYY-MM-DD_<format-id>_<series-slug>_<subject>_<aspect>.mp4
```

The `<subject>` is the **episode slug** from plan §8 — the same string used for
the gallery row, the blog post, the `?challenge=` param and the video
description. One slug, everywhere.

---

## 10. Tomorrow's session, concretely

If you want to post something within 24 hours, this is the shortest path:

1. Pick one base flame from the built-in examples.
2. Export it at 9:16 / 1K / 3 s.
3. Add `bilinear` at weight 0.5, export again.
4. Cut the two together with the overlay block from §1.
5. Add any track you have the rights to, or leave it silent.
6. Post to YouTube first — it's the account that already exists.

That's a 20-minute round trip, and it exercises the entire pipeline end to end
before you've committed to anything. The whole point of Phase 1 is finding out
where it snags; do it once cheaply rather than planning it perfectly.
