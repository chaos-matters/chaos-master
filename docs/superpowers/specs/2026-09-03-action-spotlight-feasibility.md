# Showing the human path for an AI action — feasibility

**Question.** In Teach mode the AI runs `sonification.setConfig`. A person doing the
same thing clicks **Audio → Sonification…**, then moves one select. Can the overlay
show that path — spotlight the Audio menu, then the Sonification item, then the
control that actually changed — while the AI drives?

**Answer.** Yes, and most of it already exists. The follow-cam built for replay is
exactly this feature; it has simply never been pointed at a live session. Landing the
useful 80% is small. The literal "mock the two clicks" choreography is a second,
larger step, and it needs UI changes the replay path never needed.

---

## What is already built

Replay already spotlights the control behind each step, and every piece is
command-driven rather than markup-driven, so none of it is replay-specific by nature:

| Piece                                  | Where                                                                | What it does                                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `focusHintFor(commandId, args)`        | `packages/app/src/recorder/focus.ts:130`                             | Maps a command to a semantic hint — `param:<path>`, `ui:<tourTarget>`, `focus:<id>`. Never a selector or a rectangle, so it survives markup changes and window sizes. |
| `deriveReplayFocusPreparation(action)` | `packages/app/src/recorder/focusPreparation.ts:371`                  | Turns a hint into the UI state that must exist _first_: reveal the sidebar, expand the owning transform, switch the affine tab, show the sonification panel.          |
| `prepareReplayFocus`                   | `packages/app/src/MainWorkspace.tsx:4464`                            | Applies that state. Owns every signal it touches.                                                                                                                     |
| `ReplaySpotlight`                      | `packages/app/src/components/SessionRecorder/ReplaySpotlight.tsx:66` | SVG-mask scrim that keeps the canvas and the target lit, dims the chrome, tracks the rect, captions the step.                                                         |
| 108 `data-tour-target` anchors         | across `src/components`                                              | The vocabulary `ui:` hints resolve against.                                                                                                                           |

The hints for the exact case asked about are already written:

```
sonification.setConfig  →  param:sonification.<changedKey>   (falls back to ui:sonification-panel)
sonification.setEnabled →  param:sonification.enabled
audio.*                 →  ui:audio-panel
sidebar.open / .close   →  ui:sidebar
```

So the app can already answer "which control does this command belong to" for a live
command. Nothing asks it.

---

## The gaps

**1. Nothing computes a hint on the live path.** `execute_command` now has
`preflight.args` — the same normalized args the recorder logs, which is what
`focusHintFor` expects. One call at that site produces the hint.

**2. The handler is not reachable from the pilot.** `prepareReplayFocus` is defined in
`MainWorkspace` and handed down to the recorder dock as `onPrepareAction`. The pilot
would need the same handler through the WebMCP context or a module-level signal, the
way the other pilot state is carried.

**3. Z-order.** The pilot shield sits at `z-index: 10010`; the spotlight scrim at
`300`. As-is the spotlight paints _under_ the lock and is invisible. Either the
spotlight moves above the shield, or the shield splits into a scrim and a separate
pointer-catcher with the spotlight between them.

**4. There is no beat.** Replay has a transport; the pilot does not. Today a command
applies its preparation and executes in the same tick, so there is nothing to watch.
A live spotlight needs a short dwell before the command lands — the existing
`LAYOUT_SETTLE_MS` (400) and `TAIL_MS` (900) are the right order of magnitude.

**5. Nothing describes the click path.** This is the real cost of the literal version.
The preparation jumps straight to the end state — `revealSonificationPanel()` sets
four signals at once (`MainWorkspace.tsx:1126`). To _show_ Audio → Sonification:

- `PullUpMenu` keeps `open` as a private signal with no external control
  (`packages/app/src/components/PullUpMenu/PullUpMenu.tsx:27`). It needs an optional
  controlled-open prop, and while forced open it must skip its outside-press close —
  a press on the shield currently reaches `document` and would shut it.
- The Audio trigger carries no anchor. `Genetics` has `data-tour-target="genetics-menu"`;
  Audio has none.
- `PullUpMenuItem` has no anchor field at all (`label`, `title`, `onClick`), so the
  Sonification row cannot be addressed.
- Something has to state the route. A per-preparation table — "the sonification panel
  is reached through `ui:audio-menu` then `ui:audio-menu-sonification`" — is the
  smallest honest form. It is authored data, not derived: no code today knows that
  the panel lives behind that menu.

---

## Recommended shape

**Phase 1 — live follow-cam.** Reuse hint + preparation + spotlight on the pilot path.
The spotlight lands on the destination control (the Sonification panel's model select),
with the panel revealed the way it is today. Fixes gaps 1-4; no new UI vocabulary.
This alone answers the question a viewer actually has — _what did it just touch?_ —
and it makes the live view and the replay view agree, which is the same property the
step labels just gained.

**Phase 2 — the mock click path.** Add the anchors, the controlled-open prop, and the
route table, for the handful of destinations that are genuinely menu-driven: Audio →
Audio Reactive / Sonification, Genetics → Breed / Evolve / Simulator / Ancestry / Diff.
Everything else is one hop and needs nothing. Each hop gets a dwell and a caption
("the AI opened this from Audio → Sonification").

**Phase 3 — optional.** A travelling cursor glyph between hops. Pure decoration; only
worth it if the video calls for it.

Phase 1 is worth doing on its own merits and does not commit us to Phase 2.

---

## Risks

- **A mock menu that cannot be clicked.** The lock exists to refuse input; a menu that
  looks open and live invites a click that does nothing. The caption has to say the AI
  opened it, and the dwell has to be short enough that it reads as narration.
- **Choreography must not author commands.** The preparation path is already careful
  here — see `preserveSonificationOutput: true` at `MainWorkspace.tsx:4510`, which
  exists so revealing a control cannot author a sonification-disable. Any new reveal
  path inherits that rule, and the recorder's suppression seam is how it is enforced.
- **Divergence.** If the live spotlight and the replay spotlight resolve differently,
  the two views disagree again — the exact bug the step labels just fixed. Both should
  call `focusHintFor` on the same normalized args, and a test should assert they agree.
- **Wall-clock, not budget.** Dwells lengthen a lesson without costing steps. A
  five-step lesson gains roughly 5-8 seconds in Phase 1, more in Phase 2.
