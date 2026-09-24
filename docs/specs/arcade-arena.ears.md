# Arcade Arena mode — EARS requirements

**Version:** 0.9.11 (`packages/app/package.json`) — the version whose shipped behaviour this describes
**Date:** 2026-09-10
**Scope:** The Flame Clash Arena: entering and leaving the arena overlay, opponent
generation and reroll, grounded combat-stat derivation, the clash/scoring/simulation
pipeline including ties and degenerate inputs, the 3D/2D fight choreography and
spectator presentation, win determination, champion-card export, and the seven
agent-facing WebMCP tools that drive all of it. It deliberately does **not** cover the
other five Arcade modes (Teach, Cinema, Duel, Beats, Art Director), the Arcade pilot's
step budget and command guard (`arcade/guard.ts`, `arcade/pilot.ts`), the timeline
engine itself beyond the tracks the arena writes into it, or `VariationPreview` /
`LoadFlameModal` internals — the arena only consumes those.

**Source:**

- `packages/app/src/hooks/useWorkspaceArena.ts` — arena signals, Player 1 seeding on entry, sidebar/timeline save-and-restore
- `packages/app/src/components/WorkspaceModalsHost/WorkspaceModalsHost.tsx:96-104` (`showArena`) — the mount gate for the overlay
- `packages/app/src/components/ArenaOverlay.tsx` — the HUD, fighter slots, spectator pacing, results, champion-card export
- `packages/app/src/components/ArenaOverlay.module.css` — full-screen immersion, `isClashing`, shake and shockwave presentation
- `packages/app/src/MainWorkspace.tsx:3155-3286` (`initialStartClash`) — the arena facade on the command context, `selectFighter`, and the placeholder `startClash`
- `packages/app/src/commands/types.ts:56-135` — `ArenaFighterStats` and the optional `arena` facade shape
- `packages/app/src/flame/stats.ts` — grounded stats, school classification, deterministic combat resolution
- `packages/app/src/flame/symmetry.ts` — `applySymmetryToFlame`, behind the C1–C8 pills
- `packages/app/src/flame/flameClashChoreography.ts` — the four-phase kinetic keyframe choreography
- `packages/app/src/webmcp/tools/arenaArchetypes.ts` — the six archetypes, the four stances, `generateArchetypeOpponent`
- `packages/app/src/webmcp/tools/createClashFlame.ts` — 2D/3D staging of two fighters into one descriptor
- `packages/app/src/webmcp/tools/scoreClashRound.ts` — offscreen voxel territory scoring
- `packages/app/src/webmcp/tools/simulateClash.ts` — multi-round simulation, narrative events, overall winner
- `packages/app/src/webmcp/tools/animateClash.ts` — staging the clash flame and its tracks into the timeline
- `packages/app/src/webmcp/tools/openArena.ts`, `arenaStartClash.ts`, `arenaGetStats.ts`, `arenaCommentate.ts` — the agent surface
- `packages/app/src/webmcp/tools/index.ts:45-136` (`listCommands`) — tool registration and read/write ordering
- `packages/app/src/components/Arcade/ArcadeModePanel.tsx:420-497` (`arena`) and `packages/app/src/arcade/topics.ts:478-490` (`arenaPromptCard`) — the Arcade hub's Arena panel and prompt card

**Tests:**

- `packages/app/src/flame/stats.test.ts` — `classifySchool`, `getSchoolMultiplier`, one grounded-stats smoke case, one deterministic 3-round combat case
- `packages/app/src/webmcp/tools/arenaArchetypes.test.ts` — archetype inventory, registry-key pinning, stance multipliers, seeded determinism
- `packages/app/src/webmcp/tools/createClashFlame.test.ts` — 2D and 3D staging, prefixing, power split, missing input
- `packages/app/src/webmcp/tools/simulateClash.test.ts` — round shape, stances, missing input, `determineOverallWinner`, narrative events, probability rebalance
- `packages/app/src/webmcp/tools/arenaCombat.test.ts` — `arena_get_stats`, `arena_commentate`, `arena_start_clash` across all six archetypes, one `simulate_clash` shape check
- `packages/app/src/webmcp/tools/flameToolsModular.test.ts:127-158` (`openArena`) — `open_arena` and `score_clash_round` execution contracts
- `packages/app/src/webmcp/webmcp.test.ts:353-541` — `open_arena`, `create_clash_flame` and `score_clash_round` through the bridge, including score determinism
- `packages/app/src/components/ArenaOverlay.test.tsx` — HUD render, stance selection, C1–C8 symmetry pills, reroll, results trophy card
- `packages/app/src/flame/symmetry.test.ts` — `applySymmetryToFlame` fold counts and replacement
- `packages/app/src/flame/flameClashChoreography.test.ts` — 2D and 3D track _shape_ only (see the Coverage gaps section)
- `packages/app/src/components/Arcade/ArcadeModePanel.test.tsx:74-104` "renders arena mode with stances, archetypes, and launch button" — the Arena launch panel and its prompt card
- _Gap:_ `tests/arcade.spec.ts` exercises Teach and Cinema only; **no end-to-end test ever opens the arena**, and neither `useWorkspaceArena.ts` nor `animateClash.ts` has any unit test. The unguarded requirement IDs are listed under [Coverage gaps](#coverage-gaps).

---

## Requirements

### REQ-AA-001 — Entering the arena seeds Player 1 from the live editor flame

**When** the arena is opened, the workspace shall deep-clone the current editor flame
into the Player 1 slot together with its `calculateFlameStats` type and metrics and its
`calculateGroundedStats` school and power level, naming the fighter from
`metadata.name` and falling back to `"Cyan Guardian"`.

_(`useWorkspaceArena.ts:63-77` (`openFlameClashUI`); the same seeding runs whether entry came from the
Arcade hub's Launch Clash Arena button, the `open_arena` tool, or the effect at
`useWorkspaceArena.ts:121-125` (`openFlameClashUI`) that reacts to `showArena` flipping true.)_

### REQ-AA-002 — An empty opponent slot is filled with a mutated nemesis

**If** the Player 2 slot is still empty when the arena opens, **then** the workspace
shall derive an opponent by mutating the player's flame at strength `0.45` over 2–6
transforms and 1–3 variations with smart affine, variation and colour mutation, and
shall store it as `"Crimson Nemesis"` with its own stats and grounded stats.

_(`useWorkspaceArena.ts:79-110` (`arenaP2Stats`))_

### REQ-AA-003 — The arena takes over the screen and gives it back

**While** the arena is open, the workspace shall hide the sidebar and the timeline
panel, and **when** the arena closes it shall restore both to the visibility they had
immediately before entry.

_(`useWorkspaceArena.ts:40-59` (`preArenaSidebar`) — the effect is `defer: true`, so mounting the workspace
with the arena closed does not clobber the user's panel state; the overlay itself is
mounted only under `Show when={props.showArena()}` inside a `Suspense`,
`WorkspaceModalsHost.tsx:96-104`.)_

### REQ-AA-004 — Fighter previews render inside the arena's own compute gate

The arena overlay shall wrap its entire tree in a `ComputeGate` of
`COMPUTE_GATE_CAPACITY`, so that the two fighter previews and the winner preview
cannot starve the workspace renderer of GPU submissions.

_(`ArenaOverlay.tsx:712` (`ComputeGate`), `:836` (`ComputeGate`); the gallery picker re-provides its own `Root`
because the modal is portalled outside the app root, `:373-381` (`content`).)_

### REQ-AA-005 — A fighterless opponent slot is rerolled to an archetype on mount

**When** the arena overlay mounts and the Player 2 slot has no flame, the overlay shall
run the reroll path to install a procedurally generated archetype opponent.

_(`ArenaOverlay.tsx:497-501` (`player2Stats`))_

### REQ-AA-006 — Leaving the arena restores the player's own document

**When** the arena closes — via the close button, `Escape`, or unmount — the overlay
shall cancel every pending interval and timeout and, **if** a clash was staged into the
document, shall pause the timeline, silently replace the flame with the snapshot taken
before the clash, reload the previous tracks, restore the previous duration and
animation-enabled flag, and reset the playhead to frame 0.

_(`ArenaOverlay.tsx:271-283` (`clearAllTimers`), `:295-304` (`captureWorkspace`),
`:291-313` (`restoreWorkspace`), `:504-507` (`onCleanup`), `:509-514` (`handleClose`).
Capture and restore both read the context at `DEFAULT_SEAT` rather than the ambient
seat, so a duel's rival seat can never receive the restored document.)_

### REQ-AA-007 — Six archetypes derive an opponent from the player's flame

**Where** an archetype is named, `generateArchetypeOpponent` shall mutate a clone of the
supplied base flame using only that archetype's `allowedVariations` pool and its
`mutationStrength`, then stamp the archetype's `name` and `paletteHue` onto the result
and return it with both `calculateFlameStats` metrics and `calculateGroundedStats`.
**Where** no archetype is named, it shall choose one by `|seed| % 6`.

_(`arenaArchetypes.ts:131-248` (`ARENA_ARCHETYPES`) (the six recipes), `:278-333` (`generateArchetypeOpponent`))_

### REQ-AA-008 — Opponent generation is reproducible from its seed

**Where** a seed is supplied, two calls to `generateArchetypeOpponent` with the same
base flame, archetype and seed shall produce identical flames; the default seed is
`Math.floor(Math.random() * 100000)`, so an unseeded call is deliberately fresh.

_(`arenaArchetypes.ts:340` (`seed`), `:350-371` (`mutateFlameSeeded`))_

### REQ-AA-009 — Archetype pools name only live registry variations

Every entry in every archetype's `allowedVariations` shall be a key that exists in
`transformVariations` or `transformVariations3D` — the `…Var` / `…3D` registry names,
never a bare Apophysis name — so that no generated opponent carries a variation the
shader compiler will silently drop and then persist to Recents.

_(`arenaArchetypes.ts:118-129` (`Variation`) documents the rule; the type cannot enforce it, so
`arenaArchetypes.test.ts:81` "only lists variation names that exist in the live registries" pins the pools against the registries.)_

### REQ-AA-010 — Reroll clears the previous match

**When** the opponent is rerolled — by the Reroll Opponent button, the `R` key, or the
Next Challenger button on the results card — the overlay shall cancel all timers,
restore the pre-clash document, return the game state to `idle`, clear the winner,
rounds, battle log, cached simulation and event banner, and only then write the new
fighter into the Player 2 slot.

_(`ArenaOverlay.tsx:315-346` (`handleRerollOpponent`))_

### REQ-AA-011 — Fighter setup is inert while a clash is running

**While** the game state is `clashing`, the stance buttons, symmetry pills, Reroll
Opponent, Sync Active and both From Gallery buttons shall be disabled, and the sync,
gallery and symmetry handlers shall additionally return early if invoked.

_(`ArenaOverlay.tsx:375` (`openGalleryForFighter`), `:424` (`handleSyncActiveFlame`),
`:453` (`handleApplySymmetry`), and the `disabled` bindings in
`ArenaOverlay/ArenaFighterCard.tsx`, all fed by `:229` (`isClashing`): the symmetry pills at
`:153` (`isClashing`), the stances at `:194` (`isClashing`), Reroll Opponent at `:373` (`isClashing`), Sync Active at
`:384` (`isClashing`) and From Gallery at `:395` (`isClashing`). Both fighter cards are this one
component, mounted at `ArenaOverlay.tsx:737` (`ArenaFighterCard`) and `:799` (`ArenaFighterCard`).)_

### REQ-AA-012 — Either fighter slot can be re-seeded from the editor or the gallery

**When** Sync Active is pressed, the overlay shall copy the current editor flame into
Player 1; **when** From Gallery is pressed for a slot, it shall open `LoadFlameModal` in
`gallery` mode and, on a non-`CANCEL` result, write the chosen flame into that slot.
Either path shall recompute both stat sets, bump that slot's preview version, and reset
winner, rounds, battle log, cached simulation and game state.

_(`ArenaOverlay.tsx:351-398` (`openGalleryForFighter`) (gallery; `CANCEL` and a null result both leave the slot
untouched), `:400-427` (`handleSyncActiveFlame`) (sync))_

### REQ-AA-013 — Symmetry pills set and toggle rotational order

**When** a C1–C8 pill is pressed on a fighter card, the overlay shall apply that many
folds of rotational symmetry to that fighter's flame — pressing the pill that is already
active shall reset the flame to C1 instead — and shall recompute the fighter's stats,
grounded stats and power level from the rewritten flame.

_(`ArenaOverlay.tsx:429-460` (`handleApplySymmetry`), pill wiring at
`ArenaOverlay/ArenaFighterCard.tsx:143-163` (`onApplySymmetry`), one card per fighter;
`applySymmetryToFlame` deletes every existing `_sym__` transform before adding
`folds - 1` new ones, `symmetry.ts:18-27` (`_sym__`).)_

### REQ-AA-014 — Grounded stats are derived from flame structure, not invented

`calculateGroundedStats` shall derive, from the flame alone: the Moran similarity
dimension by bisecting `Σ rᵢ^D = 1` over the per-transform contraction ratios; stability
as `1 - min(0.95, meanSpectralNorm * 0.7)` clamped to `[0.05, 0.98]`; normalised Shannon
entropy of the transform probabilities; nonlinearity as `nonlinearShare * 0.7` plus a
variation-family bonus capped at `0.3`; and shall then map those onto HP, ATK, DEF, crit
chance and power level through `COMBAT_COEFFICIENTS`, with beauty taken as
`round(fitness.composite * 100)`.

_(`stats.ts:96-110` (`COMBAT_COEFFICIENTS`) (the coefficients), `:274-296` (`solveMoranDimension`), `:332-498` (`calculateGroundedStats`))_

### REQ-AA-015 — A transformless flame gets the fallback stat block

**If** a flame has no transforms, **then** `calculateGroundedStats` shall return the
fixed block `{ dimension 1.0, stability 0.8, entropy 0.5, nonlinearity 0.3,
symmetryOrder 1, beauty 50, school 'Order', hp/maxHp 180, atk 45, def 40, critChance
0.15, powerLevel 500 }` rather than dividing by zero.

_(`stats.ts:338-354` (`transforms`))_

### REQ-AA-016 — Explicit symmetry transforms outrank angle detection

**If** the flame carries visible `_sym__`-prefixed transforms, **then** the symmetry
order shall be `min(8, count + 1)`; otherwise it shall be inferred from the spread of
pre-affine rotation angles, returning the largest `k ∈ {8,6,5,4,3,2}` whose `2π/k`
spacing matches within `0.18` rad, and falling back to 2 when symmetry-family variations
are present and 1 when they are not.

_(`stats.ts:301-327` (`detectRotationalSymmetryOrder`), `:440-446` (`symTransformCount`))_

### REQ-AA-017 — Only visible transforms contribute to grounded stats

`calculateGroundedStats` shall treat a transform whose `visible` field is absent as
visible, so that an agent-supplied descriptor scores the same as the identical flame
after schema validation.

> **Known deviation:** `packages/app/src/flame/stats.ts:368` (`visible`) — the loop reads
> `if (!t.visible) continue`, so every transform of an unvalidated agent-supplied flame
> is skipped and the fighter falls through to the REQ-AA-015 fallback block. The
> schema materialises `visible: true` (`packages/core/src/schema/flameSchema.ts:236`)
> only for flames that have been through `v.parse`, which `arena_get_stats`,
> `simulate_clash` and `create_clash_flame` never do for a caller-supplied `flame`.
> The sibling helper `calculateStructuralSymmetry` in `webmcp/tools/scoreFlame.ts` uses
> `(t.visible ?? true)`, so the two disagree on the same input. Tracked in
> [docs/agent/BUGS.md](../agent/BUGS.md).

### REQ-AA-018 — Schools classify a flame and decide the matchup multiplier

`classifySchool` shall accumulate absolute variation weight into Order, Crystal, Vortex,
Void, Tide and Arcane buckets — a transform carrying any custom WGSL variation adds a
flat `3.0` to Arcane, an unrecognised variation contributes half weight to Order, and a
flame with no transforms or no positive bucket is `Order` — and `getSchoolMultiplier`
shall return `1.25` on the advantage cycle Vortex > Order > Void > Crystal > Tide >
Vortex, `0.8` against it, a flat `1.1` when the attacker is Arcane, and `1.0` otherwise.

_(`stats.ts:72-94` (`SCHOOL_ADVANTAGE`), `:204-248` (`classifySchool`); the fighter cards show `+25%` style advantage badges from
the same function, `ArenaOverlay.tsx:186-199` (`p1Advantage`), passed to the cards at `:741` (`p1Advantage`)
and `:803` (`p2Advantage`) and rendered at `ArenaOverlay/ArenaFighterCard.tsx:313-316` (`advantage`).)_

### REQ-AA-019 — The clash flame stages both fighters under prefixed keys

**When** `create_clash_flame` runs, it shall emit one merged descriptor whose transform
keys are `p1_<originalId>_<index>` and `p2_<originalId>_<index>`, with each transform's
probability renormalised to `(prob / sumProb) * 2 * split` where `split` is that
fighter's share of the two power levels — so that downstream attribution by key prefix
is total and the two teams' total probability reflects their relative power.

_(`createClashFlame.ts:103-129` (`calculatePowerSplit`), `:142-184` (`populate3DTransforms`); `powerA`/`powerB`
override the computed power levels when supplied.)_

### REQ-AA-020 — 3D staging tints and frames the volume; 2D is the default

**Where** `dimensions` is 3, `create_clash_flame` shall upgrade every 2D affine to a 3D
one, offset the two fighters to `±separation` along the chosen axis (default `x`,
default separation `2.2`), tint each side's transform colours towards `tintA`/`tintB`
with a small per-index spread, and emit an orbital `camera3D` at
`radius = max(3.0, separation * 3)` with auto-exposure enabled. **Where** `dimensions`
is omitted or 2, it shall translate post-affine `c`/`f` by `∓distance` (default `2.0`),
apply no tint, and halve the tighter of the two source zooms.

_(`createClashFlame.ts:15-102` (`upgradeAffineTo3D`), `:186-306` (`build3DClashFlame`), defaults at `:351-354` — note `tint`
defaults to `'override'` in 3D and `'none'` in 2D.)_

### REQ-AA-021 — Both fighter flames are required

**If** either `flameA` or `flameB` is missing, **then** `create_clash_flame` and
`simulate_clash` shall each return `{ error: 'Both flameA and flameB must be
provided.' }` without touching the workspace.

_(`createClashFlame.ts:347-349` (`raw`), `simulateClash.ts:194-196` (`raw`))_

### REQ-AA-022 — Round scoring is deterministic and symmetric between the teams

`score_clash_round` shall iterate each team's transforms from a fixed start point
(`[-1,0,0]` for `p1_`, `[1,0,0]` for `p2_`) using two `mulberry32` generators seeded with
the _same_ seed, discard the first 21 iterations as burn-in, and accumulate the rest into
voxels quantised at half-unit resolution and clamped to `±8` on each axis — so that two
calls with the same clash flame and seed return byte-identical ownership numbers and
neither team is advantaged by generator order.

_(`scoreClashRound.ts:175-215` (`toVoxelKey`), `:385-406` (`rngA`); determinism is asserted at
`webmcp.test.ts:508-541` "score_clash_round".)_

### REQ-AA-023 — Territory ownership blends space with probability, and a verdict needs a margin

`score_clash_round` shall award an uncontested voxel to its sole occupant, split a
shared voxel `0.7 / 0.3` toward whichever side's symmetry-weighted density exceeds the
other's by more than 2× and count it fully contested otherwise, combine the resulting
spatial shares with the teams' probability shares at `0.6 / 0.4`, scale both by
`1 - contested`, round to three decimals, and declare a verdict of `A` or `B` only where
the ownership gap exceeds `0.01` — otherwise `draw`.

_(`scoreClashRound.ts:240-311` (`evaluateSpatialOwnership`); the symmetry weight is `1 + min(0.3, symStrength * 0.05)`
where `symStrength` counts that team's `_sym__` or symmetry-family transforms,
`:217-238` (`calculateTeamSymmetryStrength`).)_

### REQ-AA-024 — Degenerate scoring inputs resolve to a draw, not a crash

**If** the clash flame is missing or has no `transforms`, **then** `score_clash_round`
shall return `{ error: 'Invalid or missing clashFlame descriptor.' }`; **if** the
transform map is empty, it shall return an even `0.5 / 0.5` draw with zero density; and
**if** the two teams' total probabilities are exactly equal, it shall split the
uncontested share evenly and therefore return `draw` regardless of which team occupied
more space.

_(`scoreClashRound.ts:348-361` (`clashFlame`), `:285-291` (`sumProbA`). The third branch is reached routinely:
REQ-AA-019 normalises each team's probability to `2 × split`, so two fighters of equal
power always draw every round.)_

### REQ-AA-025 — Rounds escalate: the winner's transforms gain probability

**When** a round is decided, `simulate_clash` shall scale the winning side's transform
probabilities by `1.15` and the losing side's by `0.7` — or by `0.85` where the loser's
stance-adjusted symmetry score exceeds 5 — in the staged flame carried into the next
round, and shall leave probabilities untouched on a draw. Each round is scored against a
fresh deep clone of that staged flame with seed `seed + round * 1013`.

_(`simulateClash.ts:126-154` (`applyRoundProbabilityRebalance`), `:238-274` (`rounds`))_

### REQ-AA-026 — Narrative events are detected in a fixed precedence

**When** a round is scored, `simulate_clash` shall label it with the first matching
event: `Entangled` when contested exceeds `0.35`; `Nova` when the winner's energy
intensity exceeds 8 and its ownership exceeds `0.65`; `Symmetry Lock` when the winner's
symmetry score exceeds 6 while its power level is below the loser's; `Chaos Cascade`
when, from round 2 onward, the winner's chaos level exceeds 7 and it lost the previous
round; `Collapse` when either ownership falls below `0.15`; otherwise `null`.

_(`simulateClash.ts:55-124` (`isNovaEvent`))_

### REQ-AA-027 — Territory decides the match, and the HP log is made to agree

**When** all rounds are simulated, `simulate_clash` shall set the overall winner from
the round tally alone — more round wins, ties are `draw` — and shall pass that verdict to
`resolveClashCombat` as `territoryWinner`, so the HP battle log narrates the same victor
the territory scoring chose even where remaining HP would have said otherwise.

_(`simulateClash.ts:156-163` (`determineOverallWinner`), `:346-371` (`simulateRounds`); `stats.ts:620-636` (`draw`) applies the override before
its own HP comparison.)_

### REQ-AA-028 — Combat resolution is deterministic, stanced, and never zero-damage

`resolveClashCombat` shall run its rounds off a single `mulberry32(seed)` stream, apply
the stance modifiers (`balanced 1.0/1.0/1.0`, `resonance 1.25/0.95/1.0`, `bastion
0.9/1.3/0.85`, `entropy 1.1/0.85/1.35` for ATK/DEF/crit), compute damage as
`ATK × stanceAtk × schoolMultiplier × critMultiplier − DEF × stanceDef × 0.4` with a
±15% fluctuation and a floor of 12, and — absent a `territoryWinner` — break the match
by remaining HP, then round wins, then beauty, then `draw`.

_(`stats.ts:503-648` (`resolveClashCombat`); an unknown stance falls back to `balanced`, `:542-543`.)_

### REQ-AA-029 — Agent-supplied simulation parameters are bounded

`parseSimulateClashInput` shall clamp `rounds`, `separation` and the sample budget to
sane ranges before the synchronous simulation runs, so that a single agent tool call
cannot block the main thread indefinitely.

> **Known deviation:** `packages/app/src/webmcp/tools/simulateClash.ts:178-210` (`parseSimulateClashInput`) — the
> parse seam introduced by the Phase 9 decomposition applies defaults but no bounds:
> `rounds: raw.rounds ?? 3` and `separation: raw.separation ?? 2.2` are passed through
> unvalidated, and `simulate_clash` runs `rounds` synchronous 25 000-iteration scoring
> passes on the UI thread. `simulate_clash({ flameA, flameB, rounds: 100000 })` freezes
> the tab. Tracked in [docs/agent/BUGS.md](../agent/BUGS.md).

### REQ-AA-030 — `animate_clash` stages the round-1 flame and keyframes the timeline

**When** `animate_clash` runs, it shall load round 1's staged clash flame through the
`flame.load` command labelled `"Animate Clash"`, generate the choreography tracks for
that flame, write them through the `timeline.loadTimeline` command where the context
exposes an edit seam and through the raw `setTracks` setter where it does not, then set
the duration to the choreography's total frames, reset the playhead to 0 and enable
animation. **If** no simulation is supplied and either flame is missing, **then** it
shall return an error instead.

_(`animateClash.ts:36-111` (`execute`); the command path exists so the edit is recorded rather than
silently mutating state, `:92-100` (`base`).)_

### REQ-AA-031 — The choreography is a four-phase kinetic loop with an impact flash

`generateClashKeyframeTracks` shall emit, per round of `framesPerRound` (default 30)
frames, a stage-at-perimeter keyframe at the round start, a dash keyframe at 55% of the
round (the impact frame), a recoil-or-drive-through keyframe `max(2, 15%)` frames later,
and a regroup keyframe at the round end — with the final round resolving to a winner
surge instead of a regroup — and shall spike `exposure` to `2.5 ×` its base value on
every impact frame, decaying back to base by the round end. In 3D it drives
`postAffine.d/h/l` and an orbital camera; in 2D it drives `postAffine.c/f` and the 2D
camera.

_(`flameClashChoreography.ts:26-34` (`Generates`) (the phase contract), `:39-62` (`calculateClashPhases`), `:530-613` (`generateClashRenderSettingTracks`),
`:628-700` (`generateClashKeyframeTracks`))_

### REQ-AA-032 — Spectator pacing is one round per second with synchronised impact VFX

**While** the game state is `clashing`, the overlay shall advance one round per second,
publishing that round's commentary and event banner, and shall — 350 ms into each round
— fire a 300 ms screen shake, a 600 ms shockwave ring and an 850 ms floating combat
label whose text and colour follow the round winner, all through timers registered so
they are cancelled together on close. The modal shall additionally carry the
`isClashing` presentation class for that whole period.

_(`ArenaOverlay.tsx:560-608`, `:274-284` (`registerTimeout`), `:715` (`isClashing`) (the class list);
the VFX callback re-checks `gameState() !== 'clashing'` before firing, `:604` (`gameState`).)_

### REQ-AA-033 — Space, R and Escape drive the arena, and Skip fast-forwards it

**When** a key is pressed outside an input, textarea or contenteditable element, the
overlay shall treat `Space` as clash-or-skip depending on the game state, `R` as reroll
while idle or in results, and `Escape` as close. **When** Skip to Results is pressed
during a clash, it shall jump the round index to the last round and finish the match
from the already-computed simulation without re-running it.

_(`ArenaOverlay.tsx:676-695` (`onMount`) (the handler and its input guard, removed on cleanup),
`:663-669` (`handleSkipClash`, which returns early if there is no cached simulation))_

### REQ-AA-034 — Win determination, streak, and the battle log

**When** the rounds finish, the overlay shall pause the timeline, map the simulation
winner `A → Player 1`, `B → Player 2`, `draw → no winner`, enter the `results` state,
publish the simulation's battle log behind a collapsible panel, and update the win
streak: incremented on a Player 1 win, reset to zero on a Player 2 win, and **left
unchanged on a draw**.

_(`ArenaOverlay.tsx:610-644` (`finishSimulation`), log panel at
`ArenaOverlay/ArenaResultsView.tsx:210-235` (`BattleLogDrawer`))_

### REQ-AA-035 — Load Victor hands a fighter to the editor and keeps it

**When** Load (on either card) or Load Victor is pressed, the overlay shall clear the
`wasClashStaged` flag before closing, so that the arena's restore path does not undo the
load, and the workspace facade shall write a deep clone of that fighter's flame into the
document under the label `Arena: <name>` and surface a confirmation toast.

_(`ArenaOverlay.tsx:674-684` (`loadFighter`), `MainWorkspace.tsx:3257-3267` (`selectFighter`))_

### REQ-AA-036 — Champion-card export composes a 540×780 PNG from the winner's preview

**When** Download Card is pressed with a decided winner, the overlay shall obtain the
victor's artwork — preferring the converged snapshot behind `--background` on the winner
or fighter card, falling back to `canvas.toBlob`, and tolerating neither being available
— draw the 540×780 champion card with school colour, streak pill, power badge, HP/ATK/
DEF/CRIT tiles, the five grounded metric bars and the stance footer, and trigger a
download named `champion-<slugified-name>.png`. The busy flag shall be cleared whether
the export succeeds or throws.

<!-- cite-check: pinned a5c2f26f -->

> **Fixed deviation** (#90, `b940415b`; this note describes the code at `a5c2f26f`): `packages/app/src/components/ArenaOverlay.tsx:104-170` —
> `getVictorImage` returns promises that resolve only on the image's `load` or `error`
> event, with no timeout. A snapshot URL that never settles (a revoked blob, a stalled
> decode) leaves the `await` at `:578` pending forever, so `finally` never runs and the
> button stays stuck reading "Exporting…" for the life of the overlay. Tracked in
> [docs/agent/BUGS.md](../agent/BUGS.md).

<!-- cite-check: live -->

### REQ-AA-037 — A drawn match exports nothing

**If** the match ended in a draw, **then** pressing Download Card shall not produce a
file — `handleExportCard` returns before doing any work.

_(`ArenaOverlay.tsx:223-225` (`handleExportCard`). Note the button itself is not gated on a winner the way
Load Victor is (`ArenaOverlay/ArenaResultsView.tsx:192-201` (`onExportCard`) vs `:180-190` (`winner`)), so on a draw the control is enabled and
silently does nothing.)_

### REQ-AA-038 — `open_arena` degrades where there is no arena

**If** `open_arena` runs in a context with no workspace, **then** it shall return
`{ error: 'No workspace context' }`; **if** the workspace exists but exposes no `arena`
facade — the Home portal, the replay renderer, tests — **then** it shall return a
readable error telling the caller to open the editor, rather than throwing on an
undefined member.

_(`openArena.ts:108-119` (`execute`))_

### REQ-AA-039 — `open_arena` resolves fighter flames through a fallback chain

**When** `open_arena` runs, it shall resolve each fighter's flame from, in order, the
explicit `playerNFlame` argument, a `flame` on the supplied stats object, a `flame`
nested under `stats`, and finally the workspace flame — where Player 1 takes a clone of
the workspace flame and Player 2 takes a mutated variant of it — shall name unnamed
fighters `"Player 1"` / `"Player 2"`, shall open the HUD, and **where** `autoStart` is
set and the HUD has published a `startClash`, shall additionally kick off the animated
clash and say so in its result.

_(`openArena.ts:7-73` (`resolveStatsObject`), `:131-164` (`currentFlame`))_

### REQ-AA-040 — `arena_get_stats` scores a flame with or without a workspace

**Where** a `flame` argument is supplied, `arena_get_stats` shall score it and return the
grounded stats plus a one-line summary without requiring a workspace context; **where**
it is omitted, it shall score the current workspace flame; and **if** neither is
available, **then** it shall return an error. The tool shall be annotated
`readOnlyHint`, as shall `simulate_clash`, `score_clash_round` and `create_clash_flame`.

_(`arenaGetStats.ts:30-56` (`annotations`); annotations at `simulateClash.ts:334-336` (`annotations`),
`scoreClashRound.ts:336-338` (`annotations`), `createClashFlame.ts:427-429` (`annotations`))_

### REQ-AA-041 — `arena_commentate` writes into the live HUD

**When** `arena_commentate` runs against a workspace whose arena facade is present, it
shall push the supplied text into the commentary box and, **where** an `event` label is
given, into the high-priority event banner, echoing both back to the caller. **If** the
workspace or the arena facade is absent, **then** it shall return an error.

_(`arenaCommentate.ts:27-47` (`execute`); the overlay mirrors HUD state into its own local signals so
commentary survives a facade that implements only some setters, `ArenaOverlay.tsx:155-170` (`commentary`).)_

### REQ-AA-042 — `arena_start_clash` honours the stance, archetype and round count it accepts

**When** `arena_start_clash` runs, it shall apply the requested stance, replace Player 2
with the requested archetype's generated fighter, open the HUD if it is closed, await the
HUD's `startClash` and return its combat result — contesting the requested number of
rounds. **If** the flame editor has no active flame, or the HUD has not yet published a
`startClash`, **then** it shall return an error rather than hanging.

> **Known deviation:** `packages/app/src/webmcp/tools/arenaStartClash.ts:92-95` (`result`) forwards
> `rounds: raw.rounds ?? 3` and `packages/app/src/commands/types.ts:130-133` carries it,
> but the only implementation reads `opts?.stance` alone
> (`packages/app/src/components/ArenaOverlay.tsx:486-495`) and `runSimulation` hard-codes
> `rounds: 3` (`ArenaOverlay.tsx:547`) and `framesPerRound: 30` (`:569` (`framesPerRound`)). A
> `rounds: 5` request returns a three-round result and a 90-frame timeline with no
> indication the parameter was dropped, so agent narration about rounds 4 and 5 is
> fabricated. Tracked in [docs/agent/BUGS.md](../agent/BUGS.md).

_(Entry from outside the overlay goes through the workspace's placeholder `startClash`,
which opens the HUD and polls every 50 ms for the real implementation, giving up with
`{ error: 'Arena clash startup timed out.' }` after 4 s — `MainWorkspace.tsx:3155-3179` (`initialStartClash`).)_

---

## Coverage gaps

Requirements below have **no test that would go red if the behaviour broke**. Naming a
file in the `Tests:` block is not the same as being guarded, so these are listed by ID.

**No test at all** — the module has no test file, or no test touches this path:

- REQ-AA-001, REQ-AA-002, REQ-AA-003 — `hooks/useWorkspaceArena.ts` has no test file. Entry seeding, the nemesis fallback and the sidebar/timeline save-restore are all unguarded.
- REQ-AA-005, REQ-AA-006 — `ArenaOverlay.test.tsx` always mounts with a Player 2 already set and never asserts on capture/restore. The document-restore path — the one that can leave a staged clash in the user's flame — has zero coverage.
- REQ-AA-011 — no test asserts the `disabled` state of any control during a clash.
- REQ-AA-015, REQ-AA-016 (angle-detection branch), REQ-AA-017 — no test feeds `calculateGroundedStats` a transformless flame, an angle-symmetric flame, or a flame with `visible` absent.
- REQ-AA-024 (equal-probability and empty-transform branches) — only the missing-descriptor branch is covered (`flameToolsModular.test.ts:178` "handles missing clashFlame gracefully").
- REQ-AA-026 — `simulateClash.test.ts:138-174` "detects narrative events across diverse clash scenarios" exercises `Entangled` and `Collapse` only; `Nova`, `Symmetry Lock` and `Chaos Cascade` are unreached.
- REQ-AA-027 — nothing asserts that `territoryWinner` overrides the HP comparison.
- REQ-AA-028 (tie-break chain) — `stats.test.ts:149` "deterministically resolves 3 rounds with battle log" checks one deterministic 3-round run; the HP → round-wins → beauty → draw ladder is untested.
- REQ-AA-029, REQ-AA-036, REQ-AA-037, REQ-AA-042 (`rounds`) — the four known deviations. None has a failing test standing behind it.
- REQ-AA-030 — `webmcp/tools/animateClash.ts` has no test file.
- REQ-AA-032, REQ-AA-033 — spectator pacing, the VFX timers and the keyboard handler are untested; the `ArenaOverlay.test.tsx:257` "immediately presents the Center Winner Trophy Card upon results state" results test drives `startClash` directly.
- REQ-AA-035 — neither `loadFighter` nor the workspace's `selectFighter` is exercised.
- REQ-AA-039 (`autoStart`) — `webmcp.test.ts:353` (`open_arena`) covers the stats/flame fallbacks but never sets `autoStart`.

**Covered in shape only** — a test names the code but would survive the requirement being
violated:

- REQ-AA-031 — `flameClashChoreography.test.ts:124` "generates 3D combat tracks with orbital camera, transform translation, and exposure flashes" and `:182` "generates 2D combat tracks with 2D camera zoom, X/Y translation, and camera tilt" assert only that track paths are present; no test reads a single keyframe value off a `postAffine.d/c/h/l` track, so any of the twelve sign ternaries in `computeFighterXPosition` could be flipped and the suite would stay green. This is recorded as a test-gap finding in [docs/agent/BUGS.md](../agent/BUGS.md).
- REQ-AA-010 — `ArenaOverlay.test.tsx:228` "rerolling opponent updates opponent stats and triggers new archetype" asserts only that the rerolled opponent has a name and a flame; the state reset (rounds, battle log, cached simulation, restore) is not checked.
- REQ-AA-012 — `ArenaOverlay.test.tsx:216` "renders Sync Active and From Gallery action buttons" asserts the buttons render, not what they do.
- REQ-AA-034 — `ArenaOverlay.test.tsx:257` "immediately presents the Center Winner Trophy Card upon results state" asserts the trophy card renders; the winner mapping, the streak rules and the draw-leaves-streak branch are not asserted.
- REQ-AA-023 — `simulateClash.test.ts:86` "runs multi-round simulation and produces round outcomes" checks ownership sums to 1 and `webmcp.test.ts:508` "score_clash_round" checks determinism; the `0.7/0.3` contested split, the symmetry weighting and the `0.01` verdict margin have no direct assertion.

**End-to-end:** `tests/arcade.spec.ts` covers Teach and Cinema. No Playwright test opens
the arena, so nothing verifies that the overlay renders on a real GPU, that a clash plays
back through the timeline, or that closing the arena leaves the user's document intact.
