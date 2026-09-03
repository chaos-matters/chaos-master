# Teach replay pacing — investigation and plan

## The finding

A Teach replay does not show the lesson. It shows the edits, at machine speed,
and hides every sentence that explains them.

`gapBefore(index)` (`packages/app/src/recorder/player.ts:290`) is the delay
_before applying_ `index`, so it is the **dwell on step `index - 1`**. The
recorded gap is therefore charged to the step that comes _before_ the pause,
not the one the pause produced. For an agent take that inverts everything: the
agent thinks for fifteen seconds, then writes a sentence, then edits in a
burst — so the fifteen seconds are spent holding the _previous burst's last
edit_, and the sentence is replaced a millisecond later.

Measured on the user's real lesson
(`Lesson_Variations_Variations_Three_Families_From_Blank.steps.json`, 30
actions, 7 min 06 s recorded, 7.32 s replayed at speed 1):

| step                                                            | dwell      |
| --------------------------------------------------------------- | ---------- |
| `camera.zoomTo`                                                 | 1200 ms    |
| **`lesson.note` "A variation is the nonlinear function…"**      | **3.2 ms** |
| `flame.addTransform sphericalVar`                               | 18 ms      |
| `flame.setVariationWeight 1`                                    | 1200 ms    |
| **`lesson.note` "Spherical alone collapses to a point…"**       | **1.3 ms** |
| …                                                               | …          |
| **`lesson.note` "To close: three transforms, three families…"** | **0 ms**   |

**Six narration sentences share 10.3 milliseconds of screen time.** All 7.3
seconds of the replay is six editing steps sitting at the 1200 ms clamp. The
whole teaching content of a teaching feature is invisible.

The burst the user noticed — `pdjVar` plus four parameters plus a weight in
25.8 ms — is the same disease seen from the other side. It is real (six
separate recorded actions, not one command) and it matters, but it is the
second problem, not the first.

**Why stepping works.** `seek()` (`player.ts:349`) applies actions with no
timer at all, so every step gets the viewer's own dwell, the spotlight's 400 ms
settle completes, and each target is lit. The user's observation is exactly
right and is the diagnostic: focus resolution is fine. Only the clock is wrong.

**Why the spotlight misses during a burst.** `ReplaySpotlight` sets
`settleUntil = now + LAYOUT_SETTLE_MS` (400 ms) and re-measures through
`requestAnimationFrame`. With 1-17 ms gaps no frame ever renders between steps,
so the ring is measured once from a layout that has not settled, and the
browser paints at most once across the whole burst. A `lesson.note` carries no
focus hint at all (`focus.ts` falls through to `default:`), so a narration step
draws no ring — which would be fine if it were on screen long enough to read.

## Constraints any fix must respect

Verified, not assumed. Several sank the obvious first attempts.

1. **Two schedulers duplicate the formula.** `player.ts:290-297` and
   `createReplayVideoSchedule` (`replayVideo.ts:391-399`) implement it
   independently. Worse, `replayInterfaceVideo.ts:324` pre-validates the
   two-minute encoder budget from the _schedule_ and then screen-records the
   _live player_, so if the two drift the capture overruns its own budget.
   **Any change must land in one shared function.**
2. **`holdMs` is authored data.** It wins over the recorded gap and is
   deliberately unclamped (`player.ts:281-289`), it is editable per step in
   `SessionReplayPanel`, and `MAX_ACTION_HOLD_MS` is 600 000. Machine-stamping
   it destroys "clear the field to get recorded pacing back".
3. **Companion commands share a timestamp on purpose**
   (`replayVideo.ts:402-404`). A blanket floor pulls the two halves of one
   atomic gesture apart.
4. **`MAX_REPLAY_VIDEO_DURATION_MS` is 120 000.** Lengthening replays can make
   a session unexportable, with an error that would blame the user for pacing
   they did not author.
5. **The floor must not be divided by playback speed.** It exists to clear
   fixed wall-clock DOM constants — `LAYOUT_SETTLE_MS` 400 and the 420 ms ring
   transition — and neither scales with speed. Worse, the ceiling is applied
   _after_ the division, so a speed-scaled floor of 600 would equal the 1200 ms
   ceiling at 0.5x and turn every step into a metronome.
6. **Narration has two recording modes.** With `narrationAsStep` off there are
   no `lesson.note` actions at all; the sentence rides as `note` on the next
   step. A fix that only matches `lesson.note` silently misses that mode.

## The plan

### Step 1 — one owner for the cadence (pure refactor)

Export `stepGapMs(previous, next, speed)` from `player.ts` holding the entire
rule, call it from `gapBefore`, and replace the duplicated expression in
`createReplayVideoSchedule`. **No numbers change.** Both suites must stay green
with zero edited expectations — that is the proof the extraction is pure, and
it is what makes steps 2 and 3 a one-line change in one place instead of a
two-place change that can drift.

### Step 2 — pay the pause to the step that earned it

The narration fix, and the one that matters most. It slots into the existing
`previous.holdMs` branch, because it is the same idea: pacing belongs to the
step being held.

In `stepGapMs`, when the previous step carries a sentence — either
`previous.id === 'lesson.note'` or `previous.note !== undefined`, covering both
recording modes — and no authored `holdMs` overrides it, return a reading time
instead of the recorded delta:

```
clamp(NARRATION_MIN_HOLD_MS, words * MS_PER_WORD, NARRATION_MAX_HOLD_MS)
```

Suggested: 1200 / 250 (240 wpm) / **4000**. Full reading time for these
sentences is 8.5-12 s each; six of those would eat 60 s of a 120 s video
budget. 4000 ms shows the sentence, and the viewer can pause or step for the
rest. Divide by speed, as the authored-hold branch already does.

Effect on the real lesson: narration goes from 10.3 ms total to ~24 s.

### Step 3 — a floor under the edit bursts

`MIN_STEP_GAP_MS = 500`, **not** divided by speed (constraint 5), applied only
when `previous` and `next` do not share an identical timestamp (constraint 3),
and only from index 1 — flooring index 0 delays the first step after Play,
reads as a hang, and causes most of the test churn for no benefit.

500 ms clears `LAYOUT_SETTLE_MS` (400) with enough margin for one paint, so the
spotlight's settle loop completes and every burst step gets a ring. Higher
values squeeze against the 1200 ms ceiling and erase what rhythm the recording
has.

Effect: the 25.8 ms `pdjVar` burst becomes ~3 s; the whole lesson lands around
35 s — inside the video budget with room to spare.

**Add a guard**: when the resulting schedule exceeds
`MAX_REPLAY_VIDEO_DURATION_MS`, the export error must name the pacing as the
cause and point at the speed control, not read as the user's fault.

### Step 4 — the hint pill (independent, small)

The hint sits at the viewport bottom edge, where a host browser's own floating
Stop control covers it.

Note what the investigation turned up: **the timeline is hidden by default in a
Teach lesson**, so the app's bottom chrome is just the ~50 px view-controls
strip — the case a measured-height solution treats as an edge case is actually
the reported one. That kills the elaborate route. Two candidates:

- **Preferred, zero JS**: CSS anchor positioning. Give `.bottom-bar` an
  `anchor-name` and anchor `.hint` above it inside `@supports`, with today's
  rule as the fallback. The app is already Chrome-only (WebGPU), so support is
  not the usual objection.
- **Fallback**: a fixed offset that clears the strip and the `ProgressBar`
  band. Simpler, slightly wrong when the timeline is dragged tall.

Avoid the `ResizeObserver` + root-custom-property route: it needs an
`agentDriving()` gate that **the in-flight seats branch has already changed**,
and git would merge it cleanly and wrong.

Check against: the Cinema end card, the 320 px step rail, the version pills,
and the 3D orientation gizmo (80x80, bottom-right, in exactly the band the pill
moves into — they collide below ~560 px wide).

### Step 5 — what the driving agent asked for

From the agent's own notes after this lesson, both real:

- **It could not re-read its brief.** A second `arcade_start_lesson` returns
  "already active". Fix: add `goal` to `arcade_status` (already free, zero-arg,
  `readOnlyHint`). Measured cost: 178 → ~420 chars. Do **not** put
  `allowedCommands` there — that is the 882-char half that caused the
  truncation.
- **The brief arrived truncated** at `flame.setVariationParams [transfo…`, so
  it recovered the argument shape from the app bundle. The truncation happens
  in the client, outside this repo, and the brief cannot be made to fit — so
  the fix is a **recovery channel**, not a smaller brief: expose
  `commandArgHint(id)` from `commandHints.ts` and return it from
  `list_commands`, which is already free, read-only and prefix-filtered.
  `list_commands {prefix: 'flame.setVariationParams'}` then re-serves exactly
  the line that was lost.
- Free and worth taking while there: `toMcpResult` pretty-prints every result
  (`registerWebMcp.ts:39`). Dropping `null, 2` cuts the brief 10 % and makes
  the in-repo budget assertions measure the string that actually goes over the
  wire, which they do not today.
- **Flagged, not solved**: a second truncation exists on the Cinema path.

## Order and cost

|     |                            |                            |
| --- | -------------------------- | -------------------------- |
| 1   | one owner for the cadence  | small, no behaviour change |
| 2   | narration reading hold     | small, **highest value**   |
| 3   | burst floor + budget guard | small                      |
| 4   | hint pill                  | small                      |
| 5   | agent brief recovery       | small                      |

Steps 1-3 are one file and one test file. They are what stands between a Teach
replay and something worth recording a video of.

## Deferred

The live action spotlight
(`docs/superpowers/specs/2026-09-03-action-spotlight-feasibility.md`). Tonight's
finding sharpens it: a live spotlight that retargets six times in 25 ms is a
strobe, so **pacing is a prerequisite for that feature**, not an orthogonal
nicety. Corrections to that document are listed in its own file.
