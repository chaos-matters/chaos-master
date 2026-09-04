# WebMCP in Lumen Apeiron

Lumen Apeiron registers tools on `document.modelContext` (WebMCP) so an agent
in ChatGPT's desktop browser, or in Chrome 149+ with
`chrome://flags/#enable-webmcp-testing`, can drive the fractal flame editor:
read the flame, execute editor commands, and run the Arcade modes. Every write
goes through the app's command registry, so the semantic session recorder
captures the agent's work as a replayable `.steps.json`.

The agent is blind and mathematically precise; the human sees and cannot
program. The Arcade is built on that asymmetry: the agent composes the maths,
the human watches it happen and keeps the recording.

## Prior work vs hackathon work (WebMCP Challenge, submission period Aug 25 to Sep 3, 2026)

| Area                                                                                                                  | Status    | Where                                                                                                      | Evidence                           |
| --------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Command registry, 82 editor commands, hardened replay validation                                                      | Prior     | `packages/app/src/commands/`                                                                               | commits before 2026-08-25          |
| Semantic session recorder, timed replay, follow-cam, video export, PNG-embedded steps                                 | Prior     | `packages/app/src/recorder/`, `utils/sessionsDB.ts`                                                        | commits before 2026-08-25          |
| Timeline, audio wiring, sonification, genetics, 3D, custom WGSL variations, share links, tours                        | Prior     | `packages/app/src/flame/`, `utils/timeline.ts`                                                             | commits before 2026-08-25          |
| WebMCP foundation and the first 22 tools (`get_flame` through `animate_clash`)                                        | Hackathon | `packages/app/src/webmcp/`                                                                                 | first commit `ff6dff0`, 2026-09-01 |
| Arena and Art Director overlays                                                                                       | Hackathon | `components/ArenaOverlay.tsx`, `components/DirectorOverlay.tsx`                                            | same log                           |
| Lumen Arcade: hub, pilot lock, guard, Teach and Cinema tools, `lesson.note` (the 83rd command), recorder/arcade seams | Hackathon | `packages/app/src/arcade/`, `components/Arcade/`, `webmcp/tools/arcade*.ts`, `commands/builtins/lesson.ts` | first commit `6907ec8`, 2026-09-02 |

Verify with:

```bash
git log --format='%h %ad %s' --date=iso --since=2026-08-25 \
  -- packages/app/src/webmcp packages/app/src/arcade packages/app/src/components/Arcade
```

## Tool catalog

33 tools are registered (`packages/app/src/webmcp/tools/index.ts`). Every
description is at most 500 characters and every result is kept under about
1.5 KB of JSON. The table below lists 32: `arcade_end_duel` is registered
but does nothing except refuse, so it is described where that refusal is
explained rather than offered here as a capability.

| Tool                                                                                                      | Kind  | Purpose                                                                           |
| --------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------- |
| `get_flame`, `get_flame_detail`                                                                           | read  | Compact and paginated views of the active flame                                   |
| `list_commands`                                                                                           | read  | Command ids, labels, descriptions, prefix index                                   |
| `get_undo_state`, `diff_flames`                                                                           | read  | History depth; structural diff between two flames                                 |
| `execute_command`                                                                                         | write | Run any registered command (validated, guarded while the Arcade drives, recorded) |
| `set_flame`, `randomize_flame`, `mutate_flame`, `undo`, `redo`, `create_share_link`, `load_share_link`    | mixed | Document-level tools                                                              |
| `score_flame`, `score_clash_round`, `simulate_clash`, `create_clash_flame`, `animate_clash`, `open_arena` | mixed | Arena (roadmap: the scoring heuristics still need grounding)                      |
| `breed_flames`, `create_custom_variation`, `open_art_director`                                            | mixed | Genetics and Director (roadmap: the taste loop)                                   |
| `arcade_status`                                                                                           | read  | Pilot phase, steps, budget, lock, recorder, last narration, duel clock            |
| `arcade_start_lesson`, `arcade_narrate`, `arcade_end_lesson`                                              | write | Teach mode                                                                        |
| `arcade_start_cinema`, `arcade_get_animatable_paths`, `arcade_set_keyframes`, `arcade_end_cinema`         | mixed | Cinema mode                                                                       |
| `arcade_start_duel`, `arcade_duel_ready`                                                                  | write | Duel mode: opens the split screen; the clock ends it and saves both takes         |

## How an agent write reaches the document

1. `preflightReplayCommand(id, args)` validates the arguments against the
   command's canonical replay signature, with a JSON size/depth budget applied
   first (`packages/app/src/commands/registry.ts`).
2. While an Arcade session is driving, `guardCommand` applies the mode's
   allow-list, refuses `export.*` and `history.*`, forbids raising the quality
   preset above the one active at the start, and locks point count, dimensions
   and resolution (`packages/app/src/arcade/guard.ts`).
3. `executeCommand(id, ctx, ...args)` dispatches live, which means
   `normalizeArgs` canonicalises entity ids and seeds, `beforeCommand` hands a
   paused replay back to the user, and `recordCommandExecution` logs the step.
4. `arcade_end_lesson` / `arcade_end_cinema` (or the Stop button) stop the
   recorder and store the take in the IndexedDB session library. A duel ends
   differently — see below — but ends the same way, through `finishDuel`, which
   stops both streams in one call and stores two takes.

No tool writes `ctx.setFlameDescriptor` or `ctx.timeline.setTracks` directly.

## The Arcade

`https://lumenapeiron.com/arcade` (the worker sends `/arcade` to the SPA as
`#arcade`; `#arcade=teach|cinema|duel|beats` deep-links a panel).

- **Teach** — pick one of seven topics (`variations`, `affine`, `color`,
  `camera`, `genetics`, `sonification`, `render`). The agent gets a brief with
  the goal, the allowed commands and their exact argument shapes, and a step
  budget. It narrates through
  `arcade_narrate` (a real `lesson.note` command, so the sentence replays as a
  caption between the edits it describes) and builds the example with
  `execute_command`. The recording is saved as `Lesson: <Topic> — <title>`.
- **Cinema** — describe a move; the agent reads `arcade_get_animatable_paths`,
  sends tracks to `arcade_set_keyframes` (validated against that catalog and
  applied as one undoable `timeline.loadTimeline`), and playback starts. Saved
  as `Animation: <title>`.
- **Duel** — you and the agent edit your own flames side by side against one
  clock. `arcade_start_duel` opens the split screen, gives the agent its own
  seat (a real flame with its own history and recorder stream), and points the
  whole tool surface at it: `get_flame` and `execute_command` act on the
  agent's flame while your half stays yours, keyboard and all. Only `flame.*`
  and `camera.*` are allowed. **The agent cannot end a duel**: the clock ends
  it, and you can end it early. That is the time pressure, and it is why
  `arcade_end_duel` still exists only to refuse — a chat already in flight will
  keep calling the name it was told about, and a missing tool gives it nothing
  to correct against. The agent calls `arcade_duel_ready` to name its flame,
  which costs no steps and changes nothing else, and may keep polishing
  afterwards. Whoever ends it, `finishDuel` saves each side as its own take
  (`Duel: <title> — your flame` / `— the agent's flame`) and shows the verdict. 2D
  and still flames for now.

  **The result card is a PNG.** Both flames keep rendering behind it, and its
  Download button hands over the card itself with the winning flame written
  into a `FlameJson` chunk — drop that file back on the app and it loads the
  winner, exactly as a PNG exported from the editor does.

  **Running one without an agent.** The Duel panel in the hub carries a "Start
  without the agent" button under `pnpm dev` (and behind `VITE_SOLO_DUEL=1` for a
  preview build). It opens the same split screen with nobody in the other seat:
  no pilot, so no seat lock, no step budget and no narration rail; the tool
  bridge stays pointed at your own flame; and neither side is recorded, so an
  inspection leaves no takes in your library. Everything else — the clock, the
  dial, the chips, the score sheet, the End button — behaves as it does in a
  real duel, because both entry points go through the same `beginDuel`. It is
  there so the interface can be worked on without a model round trip between
  every change.

  The viewer's half carries its own editing surface: three chips on the top
  edge — Variations, Shape, Colour — each opening into a strip across that half
  only, and a toggle that steps the stage aside so the real sidebar comes
  through on the same store with the same undo. Every one of those controls
  dispatches a registered command through the player's `CommandContext`, so a
  duel take replays exactly like a Teach take and neither the guard nor the
  recorder gained a surface. Shape shows scale, rotation, shear and offset
  rather than the six matrix coefficients (`arcade/affineControls.ts`).

- **Beats**, **Arena**, **Director** are on the hub as roadmap cards.

While a whole-screen mode runs, the editor is locked behind a full-screen
shield: the
banner shows the step counter and elapsed time, the right rail shows every
step and narration line as it lands, keyboard shortcuts are disabled, and the
recorder dock is hidden. Stop (or Escape twice) ends the take and still saves
it. A Duel locks only the agent's seat (`lock: 'seat'`), so the viewer keeps
their keyboard and their control strip while the clock runs, and the agent's
narration and step counter render in the duel's own HUD instead.

### Prompt cards

The hub gives you the exact text to paste into the agent chat; the Teach card
is per topic, the Cinema card embeds your description and the Duel card embeds
your clock. They are generated by `teachPromptCard` / `cinemaPromptCard` /
`duelPromptCard` in `packages/app/src/arcade/topics.ts`.

## Try it

1. Open `https://lumenapeiron.com/arcade` in ChatGPT's desktop browser, or in
   Chrome with the flag above (the Model Context Tool Inspector extension lists
   the tools and calls them by hand). WebGPU is required. The worker sends
   `/arcade` to the app as `#arcade`, so the link is safe to share.
2. Already in the editor? The **Arcade** pill in the bottom-right corner, next
   to Lab and Docs, opens the hub over the workspace without a reload, so a
   lesson starts on the flame you were looking at. "Back to editor" (or Escape)
   returns to it.
3. Pick Teach, choose a topic, copy the prompt, paste it into the agent chat.
4. Replay the lesson from the end card; export a video from the recorder dock.
5. Developers: without a WebMCP browser, `registerWebMcp` installs a mock on
   `window.webmcp`, so `await window.webmcp.execute(name, input)` calls any
   tool from the console or from Playwright.

```bash
pnpm --filter chaos-master exec vitest run src/webmcp src/arcade
pnpm test:e2e -- tests/arcade.spec.ts
```

## Limits

- WebGPU is required to render; Chrome 149+ with the flag is the reference
  surface. WebGPU inside ChatGPT's in-app browser is unconfirmed.
- Tool descriptions are at most 500 characters; results are kept under about
  1.5 KB of JSON.
- Step budgets: 30 for `variations` and `affine`, 25 for `color`, 20 for
  `camera`, 40 for Cinema. Narration counts as a step.
- The agent can never raise render quality, point count, dimensions or
  resolution, and exports and history are closed while it drives.
- `timeline.play` is wall-clock transport: it is deliberately not replayable,
  so `execute_command` refuses it and `arcade_set_keyframes` starts playback
  itself. Scrub with `timeline.setCurrentFrame`.
- A page reload during a session ends it and loses the recorder's in-memory
  take: it was never saved, so nothing appears in the library.
- Cinema playback is started by `arcade_set_keyframes` itself and is
  deliberately suppressed for the recorder, so it is not part of the saved
  session. A replay applies the keyframes; you press Play.
- Sessions are stored per browser in IndexedDB (capped at 100).

## What the agent cannot reach yet

Audited 2026-09-03 against the registry: all 87 registered commands carry an
explicit replay policy, so anything the agent can execute, a session file can
reproduce. The gaps are elsewhere.

- **Undo and redo run live but do not replay.** `history.undo` / `history.redo`
  are `replayable: false` on purpose — a log replays the writes, and replaying
  a takeback of a write that never happened in this run is meaningless. An
  agent that undoes mid-lesson therefore records a session whose replay
  diverges from what the viewer watched. Prefer setting the value back.
- **Playback is wall-clock, not a step.** `timeline.play` is neither
  recordable nor replayable; `arcade_set_keyframes` starts playback itself and
  a replay leaves the Play button to the viewer.
- **3D framing has no first-class commands.** The 2D camera has
  `camera.center/panTo/panBy/zoomTo/zoomBy/frame`; the 3D camera is reachable
  only as `flame.setRenderSetting` on `camera3D.*`, which records and replays
  correctly but reads as a raw settings write in a lesson and has no follow-cam
  anchor of its own.
- **Custom variations are a tool, not a command.** `create_custom_variation`
  compiles user WGSL through the same validator the editor uses, but there is
  no registered command behind it, so a lesson that authors a variation cannot
  replay that step.
- **Pointer-only surfaces stay pointer-only.** Direct canvas drag, pinch and
  orbit write through `flame.setRenderSetting`, so they record; there is no
  agent-facing equivalent of "drag from here to there" beyond `camera.panBy`.

`docs/recorder-coverage.md` is the inventory for the recorder side, including
the surfaces that still write anonymously.
