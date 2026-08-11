# The Replay Duel — a plan

> Companion to `channel-content-plan.md`. A recurring format where a step file
> written by Claude and one built by hand are replayed side by side in the app,
> wrapped as Shorts, and put to a vote.
>
> Doubles as a forcing function for the step recorder's file format (§4).

---

## 1. The premise, and the version of it that actually works

The obvious pitch is "human vs AI". That framing is well-worn, reads as a
gimmick, and ages badly — half the comments will be about AI rather than about
fractals.

**The version worth making rests on two things nobody else can offer:**

1. **Both entries are inspectable, forkable artifacts.** Not two videos of two
   results — two _step files_ the viewer can open, replay, pause at step 9 and
   take in a different direction. The duel is a demo of the recorder wearing a
   competition as a costume.

2. **One competitor is working blind.** I never see the render. I compose from
   the variation maths, the affine values, and what the formulas do to a point
   — and then find out at the same moment the audience does. That's a genuine
   handicap, it makes the contest close enough to be interesting, and it is a
   much better hook than "AI makes art":

   > _"I wrote this fractal from the equations alone. I have never seen it."_

Lead with the blind constraint. Mention the rest in passing.

---

## 2. Format

**Length:** 45–60 s vertical. Longer than a standard Short, shorter than an
episode.

**Structure:**

| Beat      | Duration  | Content                                                                           |
| --------- | --------- | --------------------------------------------------------------------------------- |
| Hook      | 0:00–0:04 | Both finished flames, side by side, no context. "One of these was written blind." |
| The brief | 0:04–0:10 | The constraint on screen: target, step budget, variation pool.                    |
| Replay A  | 0:10–0:25 | The hand-built file, replayed at speed, step labels on screen.                    |
| Replay B  | 0:25–0:40 | The blind file, same treatment.                                                   |
| Reveal    | 0:40–0:50 | Both results, full frame, side by side.                                           |
| Vote      | 0:50–0:60 | "A or B in the comments. Both links in the description — fork either one."        |

**Which is which stays hidden until the pinned comment**, otherwise people vote
on the premise instead of the picture.

### Fairness constraints

Fixed per episode and stated on screen:

- **Same starting flame** (a share link, or a seed once the seed field ships).
- **Same step budget** — 20 steps is a good default. Enough to build something,
  tight enough that choices show.
- **Same variation pool** — 5–8 named variations, chosen before either side
  starts, so nobody wins by reaching for something exotic.
- **Same render settings at the end**, so the comparison is structure and colour,
  not exposure tricks.

### Scoring

Audience poll is the primary result. Two optional additions:

- **The fitness composite** as a house judge (`flame/fitness.ts` — variation
  diversity, transform balance, colour spread, structural complexity). It
  disagreeing with the audience is the most interesting outcome available and
  should be shown, not hidden.
- **A guest judge** for milestone episodes.

Keep a running score across the season. A tally is a reason to come back.

---

## 3. What we can build today, before the recorder ships

The app already has a declarative replay format: **tours** (`src/tours/*.ts`),
which drive the real `executeCommand()` registry and are addressable as
`#tour=<id>`. Home's portal proves they replay against an isolated store.

So the v0 is: **I write a tour file, you run it.** No new infrastructure.

A tour step is already close to what the duel needs:

```ts
{
  target: tourTarget('canvas'),
  title: 'Fold the plane',
  description: 'Bilinear reflects every point across y = x.',
  beforeShow: (ctx) => {
    ctx.executeCommand('flame.addTransform', 'bilinearVar')
    ctx.executeCommand('flame.setAffine', 0, { /* ... */ })
  },
}
```

`title` and `description` are already the overlay text. The 33 registered
commands (`flame.*`, `camera.*`, `timeline.*`, `sidebar.*`, `export.*`) are the
move set — which is a real constraint on what I can express, and worth stating on
screen as part of the brief.

**Proposed first step:** I write `duelRound1.ts` as a tour, you register it, run
it, and tell me what it looked like. That single round trip tells us whether the
format is fun before either of us builds anything.

---

## 4. What the duel needs from the recorder format

This is the part that pays for itself beyond content. To wrap a replay in a
video, the step file needs three things — and they're the same three the Shorts
work needs anyway:

| Field                  | Why the duel needs it                                     | Why the app needs it                                                       |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `label` per step       | Overlay text — the caption that appears as the step fires | Recording-mode action labels (plan §7); makes a silent video half-narrated |
| `camera` hint per step | Which control to zoom to while this step runs             | The follow-cam, stored in the recording so replays are _directed_          |
| `startFlame`           | Both sides must start identical                           | Any replay needs a defined starting state                                  |

A minimum shape, to be reconciled with whatever you've actually built:

```jsonc
{
  "version": 1,
  "id": "duel-01-blind",
  "title": "Blind build — 20 steps",
  "author": "claude",
  "startFlame": { "preset": "initExample" }, // or a full descriptor
  "steps": [
    {
      "command": "flame.addTransform",
      "args": ["bilinearVar"],
      "label": "+ bilinear", // overlay text
      "camera": { "focus": "transform-list" }, // follow-cam hint
      "holdMs": 900,
    },
  ],
}
```

Three notes on the format, learned from what the video work needs:

- **`label` is authored, not derived.** A generated label reads like a log line
  (`flame.setAffine(0, …)`); a written one reads like narration (`shear it
sideways`). Let the recorder default to the derived version and allow an
  override — that's the difference between a debug trace and a tutorial.
- **`camera` is a hint, not a viewport.** Store _what to look at_, resolve _how_
  at replay time, so a recording made at one window size still works at another.
- **`holdMs` belongs to the step, not the player.** Pacing is authorial. A step
  where something dramatic happens wants a longer hold than three routine ones.

If the recorder already covers this, ignore the schema and keep the three notes.
If it doesn't, adding them now is much cheaper than migrating recordings later.

---

## 5. Episode one — a concrete spec

Everything here is decidable without any new code.

- **Brief:** _"Make it look like a jellyfish."_
- **Start:** the `initExample` preset — same for both.
- **Budget:** 20 steps.
- **Pool:** `bilinear`, `spherical`, `swirl`, `horseshoe`, `bubble`, `curl`,
  `disc2`, `cardioid`.
- **Ending:** both flames at identical exposure, vibrancy, gamma and contrast.
- **My constraint, stated on screen:** no render seen at any point.

**Sequence:**

1. You send me the brief and confirm the pool.
2. I write `duelRound1.ts` and commit it to this branch.
3. You register it, run it, capture the replay.
4. You build your own 20 steps, capture that.
5. Cut both into the §2 structure, post, pin the answer.

**If it isn't fun, we find out for the cost of one file.** That's the right size
for a first swing at a format neither of us has tried.

---

## 6. Where it goes if it works

- **Best of three across a season**, with a running tally.
- **Audience briefs** — "you name the target, we both attempt it blind." This is
  where the format stops being a novelty and starts being a series.
- **Fork-offs.** Viewers take either file, branch it at any step, and submit
  their version. The best fork gets featured — and it's the most natural
  submission mechanic in the whole plan, because the artifact is already a
  starting point rather than a finished thing.
- **Teaching by contrast.** Two files solving one brief differently is a better
  lesson than any tutorial. "Why did this one use spherical where that one used
  disc2" is a whole blog post, and the answer is inspectable.

---

## 7. Honest risks

- **Novelty burns out fast.** Run it monthly, not weekly. Three or four a season.
- **The blind constraint is only interesting while it's a real handicap.** If
  you start describing results back to me in detail across episodes, it stops
  being blind and the hook dies. Keep feedback to "you won" or "you lost".
- **Don't let it become the channel's identity.** It's a recurring segment that
  shows off the recorder, not the thing Lumen Apeiron is about. If it starts
  outperforming everything else, that's a signal to make more _replay_ content —
  not more _versus_ content.
