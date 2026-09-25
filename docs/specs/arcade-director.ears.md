# Arcade Director mode — EARS requirements

**Version:** 0.9.11 (`packages/app/package.json`) — the version whose shipped behaviour this describes
**Date:** 2026-09-10
**Scope:** The Evolutionary Art Director: how a session opens, how a generation
of candidate flames is produced, how the user's Like/Dislike/tag reactions are
captured and persisted, how the cross-session taste profile is aggregated from
those records, and how the next generation is bred or mutated from a rated one.
It deliberately does **not** cover the genetics of `breedFlames` /
`mutateFlame` themselves (crossover modes, affine perturbation — those are
`packages/app/src/flame/breedFlame.ts` and `flame/randomize.ts`), the fitness
and stats formulas the taste features quote (`flame/fitness.ts`,
`webmcp/tools/scoreFlame.ts`), the `VariationPreview` render path, or the other
Arcade modes.

**Source:**

- `packages/app/src/arcade/tasteStore.ts` — feature extraction, the persisted rating store, taste-profile aggregation
- `packages/app/src/webmcp/tools/arcadeDirector.ts` — `director_propose`, `open_art_director`, `director_get_feedback`, `director_get_taste_profile`, and candidate normalisation
- `packages/app/src/components/DirectorOverlay.tsx` — the modal: rating capture, tag chips, Breed Selected, Mutate Best, Load Candidate
- `packages/app/src/hooks/useWorkspaceArtDirector.tsx` — session signals, seeding, modal lifecycle, `selectCandidate`
- `packages/app/src/commands/types.ts:31-54` (`DirectorCandidate`), `:104-110` (`director`) — `DirectorCandidate`, `DirectorState`, the optional `director` member of `CommandContext`
- `packages/app/src/arcade/topics.ts:364-394` — `DIRECTOR_PRESETS` and `directorPromptCard`
- `packages/app/src/components/Arcade/ArcadeModePanel.tsx:378-419` (`director`) — the Director tab and its "Launch Art Director Overlay" button
- `packages/app/src/webmcp/tools/index.ts:99-100` (`directorGetFeedback`), `:131-132` (`directorPropose`) — registration order
- `packages/app/src/webmcp/tools/openArtDirector.ts` — a one-line re-export barrel with no importers; behaviourally inert

**Tests:**

- `packages/app/src/webmcp/tools/arcadeDirector.test.ts` — the four tools against a mock `CommandContext`: refusal without context, propose, the alias, feedback read-back, profile read-back
- `packages/app/src/arcade/tasteStore.test.ts` — feature extraction shape, record update-in-place, empty vs populated profile (runs under `happy-dom`, so the real `localStorage` round-trip is exercised)
- `packages/app/src/arcade/topics.test.ts:191-206` "director" — the Director presets and the prompt card's tool names
- `packages/app/src/flame/breedFlame.test.ts:59,257` — `breedFlames` honours `count` and returns `[]` rather than throwing on mismatched dimensions, which is what REQ-AD-033 rests on
- `packages/app/src/webmcp/tools/toolCount.test.ts` — every registered tool is named in the `docs/webmcp.md` table
- _Gap:_ `DirectorOverlay.tsx` and `useWorkspaceArtDirector.tsx` have **no test file at all**. Every requirement covering the modal, the session lifecycle and the evolve buttons (REQ-AD-003, 004, 005, 011, 012, 013, 014, 015, 032, 033, 034, 035, 036) is unguarded.
- `tests/webmcp.ci.spec.ts` — runs in PR CI (the `chromium-ci` project) since #93, which replaced the stale `tests/webmcp.spec.ts`. `tests/webmcp.ci.spec.ts:14` "registers webmcp on window and opens Art Director overlay on executeTool" opens the modal through `open_art_director`, checks the generation and fitness labels, clicks a Like reaction and loads a candidate; `:74` "opens Art Director from toolbar Genetics menu and populates candidates" opens it from the toolbar with four candidates and closes it. Neither asserts a stored rating, a tag, or a breed or mutate result.
- Full list of unguarded IDs in [Coverage gaps](#coverage-gaps).

---

## Requirements

### REQ-AD-001 — The Director tool surface is four tools, two of them read-only

**Where** the WebMCP bridge is present, the app shall register
`director_propose`, `open_art_director`, `director_get_feedback` and
`director_get_taste_profile`, with the two `director_get_*` tools carrying
`annotations.readOnlyHint` and ordered into the read half of the registration
array ahead of every write tool.

_(`webmcp/tools/index.ts:99-100` (`directorGetFeedback`) read half, `:131-132` (`directorPropose`) write half;
`arcadeDirector.ts:179-181` (`annotations`), `:244-246` (`annotations`))_

### REQ-AD-002 — The Arcade panel hands the agent the whole loop, not just a goal

**Where** the Arcade panel is showing Director mode, it shall offer the four
`DIRECTOR_PRESETS` as one-click aesthetic goals, a free-text goal field, and a
prompt card that names `director_get_taste_profile`, `director_propose` and
`director_get_feedback` in that order, so the agent reads the historical profile
before proposing and reads feedback before evolving.

_(`arcade/topics.ts:364-394` (`DIRECTOR_PRESETS`); `Arcade/ArcadeModePanel.tsx:378-419` (`director`). The panel's
"Launch Art Director Overlay" button calls `ctx?.director?.setOpen(true)` and
nothing else — it opens the modal on whatever generation already exists, or on a
seeded one per REQ-AD-005.)_

### REQ-AD-003 — One modal per open request

The Director shall mount at most one modal at a time: `openArtDirectorUI` shall
return immediately while a modal is already mounted, and shall clear both the
re-entrancy latch and the `open` signal when the modal settles — whether it was
dismissed by the close button, by Load Candidate, or by the modal host.

_(`useWorkspaceArtDirector.tsx:58-62` (`isDirectorModalOpen`) the latch, `:112-116` (`respond`) the overlay's
`respond`, `:120-123` the `finally`. Note the state itself survives a close: the
candidates and generation stay in the signal, so reopening resumes the same
generation rather than reseeding.)_

### REQ-AD-004 — Raising the open signal is what mounts the modal

**When** the `director.open` signal transitions to true while no modal is
mounted, the workspace shall request the Director modal — this is the only seam
by which `director_propose`'s `setOpen(true)` and the Arcade panel's launch
button reach the UI, since neither calls `openArtDirectorUI` directly.

_(`useWorkspaceArtDirector.tsx:126-130` (`createEffect`); the tool side at
`arcadeDirector.ts:145-146` (`setState`))_

### REQ-AD-005 — An empty session seeds four mutants of the current flame

**When** the modal is opened while the director state is `null` or holds zero
candidates, the workspace shall seed generation 1 with four candidates mutated
from a deep clone of the current workspace flame at strengths 0.2, 0.3, 0.4 and
0.5, each mutating affines in `smart` mode, modifying (never adding) variations
and mutating colours, and each carrying its own `scoreFlame(...).composite` as
fitness.

_(`useWorkspaceArtDirector.tsx:63-96` (`directorState`). The four preset names — Subtle, Moderate,
Chaotic, Structural — are declared at `:66` (`presets`) and used only for their count and
index; they are never displayed.)_

### REQ-AD-006 — A Director tool without a workspace refuses by name

**If** no `CommandContext` is installed on the bridge, **then** `director_propose`
and `director_get_feedback` shall return
`{ error: 'Workspace not ready. The flame editor has not finished loading.' }`;
**if** a context exists but carries no `director` member — the shape a sandbox,
the replay renderer or a duel rival seat installs — **then** they shall return
`{ error: 'Director context not found in workspace.' }` instead of throwing.

_(`arcadeDirector.ts:10-12` (`NOT_READY`), `:109-112` (`getWebMcpContext`), `:183-186` (`getWebMcpContext`); the optional member is
declared at `commands/types.ts:104-110` (`director`). `director_get_taste_profile` needs no
context at all — see REQ-AD-030.)_

### REQ-AD-007 — `director_propose` replaces the whole generation

**When** `director_propose` executes with a director context, it shall replace
the entire director state — generation, candidate list, and `steeringPrompt`
only when the caller supplied one — open the modal, and return
`{ success: true, ok: true, generation, candidateCount, message }`. A missing or
falsy `generation` shall become 1, a missing `candidates` array shall become
empty, and each candidate's fitness shall be the caller's `fitness` when given
and `scoreFlame(flame).composite` otherwise.

_(`arcadeDirector.ts:114-155` (`input`), fitness at `:50-56` (`calculatedFitness`). Replacement is total: the
previous generation's in-session reactions and tags are discarded, though their
persisted taste records survive per REQ-AD-035.)_

### REQ-AD-008 — A malformed candidate flame is repaired from the workspace flame

**If** a proposed candidate has no `flame`, no `transforms`, an empty
`transforms` map, or no `renderSettings.camera`, **then** the tool shall replace
it with a mutation of the current workspace flame at strength `0.2 + index * 0.1`
in the workspace flame's own dimensionality, rather than passing the malformed
descriptor to the preview renderer.

_(`arcadeDirector.ts:20-48` (`rawCandidates`))_

### REQ-AD-009 — A candidate that cannot be repaired stays flame-less and renders a placeholder

**If** a candidate needs repair but no workspace flame is available, **then** the
candidate shall be kept with an undefined flame and fitness 0.85, the overlay
shall render a "Candidate N" placeholder in place of a preview, and
`director_get_feedback` shall report `features: undefined` for it — never a
crash and never a fabricated feature set.

_(`arcadeDirector.ts:50-54` (`calculatedFitness`) the 0.85 default and the `as FlameDescriptor` cast,
`:200-202` (`features`) the feature guard; `DirectorOverlay.tsx:316-328` (`camera`) the placeholder
fallback.)_

### REQ-AD-010 — `open_art_director` is the same tool under an older name

**Where** an agent still calls the pre-#75 name, `open_art_director` shall
execute `director_propose`'s implementation and input schema unchanged, differing
only in `name` and `description`, so a proposal made under either name lands in
the same state and opens the same modal.

_(`arcadeDirector.ts:161-166` (`openArtDirector`) spreads `directorPropose`.)_

### REQ-AD-011 — Reaction toggles are three-state

**When** the user clicks Like or Dislike on a candidate, the overlay shall set
that reaction; **when** the user clicks the reaction the candidate already
carries, it shall clear the reaction to `null`. Either way it shall rebuild
`lastFeedback.candidates` for **every** candidate from current reactions and
tags, preserving any existing `selectedIndex`.

_(`DirectorOverlay.tsx:52-78` (`toggleReaction`))_

### REQ-AD-012 — Every reaction change writes a taste record

**When** a reaction is set or cleared on a candidate that carries a flame, the
overlay shall write a taste record for it: `reaction` as `'like'` / `'dislike'`,
or `'neutral'` when the reaction was cleared; the candidate's current `tags`;
`note` set to the live Steering Prompt field; `wasSelected` set to whether
`lastFeedback.selectedIndex` currently equals this candidate's index; and
`features` from `extractFlameTasteFeatures(candidate.flame)`.

_(`DirectorOverlay.tsx:80-91` (`flame`). Because Load Candidate closes the modal
(REQ-AD-015), `wasSelected` is false on every record written before a load; it
can only be true for a candidate rated after reopening the same generation.)_

### REQ-AD-013 — Tags come from a fixed vocabulary and also write a record

**When** the user toggles one of the eight quick tags — `+Symmetry`, `-Symmetry`,
`Warmer`, `Cooler`, `Simpler`, `Chaotic`, `Loved palette`, `Darker` — the overlay
shall add or remove it from that candidate's tag list, rebuild `lastFeedback`,
and write a taste record carrying the new tag list and the candidate's existing
reaction (or `'neutral'` when it has none). Tags are per candidate, not per
generation, and free-text tags cannot be entered.

_(`DirectorOverlay.tsx:23-32` (`QUICK_TAGS`) the vocabulary, `:94-136` (`toggleTag`) the toggle.)_

### REQ-AD-014 — A flame-less candidate is rated in session only

**If** a candidate carries no flame, **then** its reaction and tags shall still
update in the live director state, but no taste record shall be written — a
record with no extractable features would poison the profile's category and
palette aggregation.

_(`DirectorOverlay.tsx:80` (`flame`), `:125` (`flame`) — both writes are behind `if (candidate.flame)`.)_

### REQ-AD-015 — Loading a candidate is an undoable workspace edit

**When** the user clicks Load Candidate, the workspace shall install a deep clone
of that candidate's flame through the history setter under the label
`Art Director: Candidate <N>`, record `selectedIndex` in `lastFeedback` together
with a snapshot of every candidate's reaction, tags and rationale, show the toast
`Art Director: Loaded candidate <N> into workspace.`, and close the modal.

_(`useWorkspaceArtDirector.tsx:33-56` (`selectCandidate`); the button at `DirectorOverlay.tsx:430-438` (`loadBtn`).
The clone matters: without it the workspace and the still-live candidate list
would share one descriptor.)_

### REQ-AD-016 — Taste records persist to one key, mirrored in memory

The taste store shall persist its records as a JSON array under the single
`localStorage` key `chaos-master:taste-ratings`, and shall mirror that array in a
module-level list so that a read after a successful write returns the same
records without touching storage again.

_(`arcade/tasteStore.ts:63` (`STORAGE_KEY`), `:66` (`memoryRatings`), `:155-181` (`getStoredRatings`). `clearTasteStore` (`:338-345`)
empties both.)_

### REQ-AD-017 — Unreadable storage degrades to the in-memory list

**If** reading `localStorage` throws, the key is absent, or the stored payload
does not parse to an array, **then** `getStoredRatings` shall return the
in-memory list instead of throwing, so a private window, a sandboxed iframe or a
corrupted key costs the session its history but not the Director.

_(`arcade/tasteStore.ts:155-169` (`getStoredRatings`). The array is adopted as-is: no record is
validated, so a hand-edited key whose entries lack `features` will make
`deriveTasteProfile` throw at `:257` (`variationCategories`).)_

### REQ-AD-018 — Unwritable storage never breaks rating

**If** writing to `localStorage` throws — quota exceeded, or a sandboxed iframe —
**then** `recordCandidateFeedback` shall still return the record and still keep
it in the in-memory list, so ratings continue to accumulate for the life of the
page.

_(`arcade/tasteStore.ts:174-181` (`saveRatings`))_

### REQ-AD-019 — The store keeps the newest hundred records

The taste store shall retain at most `MAX_RATINGS_HISTORY` (100) records,
discarding the oldest on each save, so a long-running profile cannot grow the
storage key without bound.

_(`arcade/tasteStore.ts:64`, `:175` — `ratings.slice(-MAX_RATINGS_HISTORY)`.
Trimming happens on save only, so a payload longer than 100 read back from
storage is aggregated in full until the next write.)_

### REQ-AD-020 — A taste record is identified per session

A taste record's identity shall distinguish the Director session it came from,
so that ratings made in a later session are appended to the profile rather than
overwriting same-numbered candidates from an earlier one.

<!-- cite-check: pinned a5c2f26f -->

> **Fixed deviation** (#90, `404db62a`; this note describes the code at `a5c2f26f`): `packages/app/src/arcade/tasteStore.ts:164` — the id is
> `cand-${generation}-${candidateIndex}` and nothing else. `generation` comes
> straight from the agent (`webmcp/tools/arcadeDirector.ts:114-132`, stored as
> `generation || 1`) and every prompt card starts an agent at generation 1, so
> yesterday's `cand-1-0`…`cand-1-N` are silently replaced by today's. The record
> carries a `timestamp` (`tasteStore.ts:170`) but it is never read — `deriveTasteProfile`
> (`:186-296`) does not touch it — and there is no session id, seed or flame
> hash. `director_get_taste_profile`'s own description promises a profile
> "derived across sessions" (`arcadeDirector.ts:230-231`). Tracked in
> [docs/agent/BUGS.md](../agent/BUGS.md).

<!-- cite-check: live -->

### REQ-AD-021 — Re-rating a candidate updates its record in place

**When** feedback is recorded for a candidate that already has a record, the
store shall replace that record in place — refreshing reaction, tags, note,
`wasSelected`, features and timestamp — rather than appending a second one, so a
user who flips Like to Dislike is counted once.

_(`arcade/tasteStore.ts:203-214` (`existingIndex`); guarded by `tasteStore.test.ts:69-82` (`entry2`).)_

### REQ-AD-022 — Taste features are extracted from the candidate flame alone

The extracted feature set shall carry the flame's full `FitnessScores`, its
`powerLevel` and classified `type`, the four grounded metrics (complexity,
chaosLevel, symmetryScore, energyIntensity), the total transform count, the
sorted deduplicated set of variation **categories** resolved as the flame draws each
variation (in a 3D flame, a 2D type counts as what the 3D renderer draws it as: a mapped
name as its 3D variation, any other 2D type as its 2D function), and a palette
temperature — and nothing about the user, the generation or the session.

_(`arcade/tasteStore.ts:114-150` (`extractFlameTasteFeatures`), `:101` (`drawnCategory`);
`categoryOf` at `flame/variationRegistry.ts:37-47`. `transformCount` (`tasteStore.ts:146`) counts every
transform, while the category walk (`:124-134` (`visible`)) skips some — see REQ-AD-024.)_

### REQ-AD-023 — Palette temperature needs a margin of two

Palette temperature shall be `warm` only when warm-hued transforms outnumber
cool ones by more than one, `cool` only when cool outnumber warm by more than
one, and `balanced` otherwise — including for a flame with no transforms. A
transform is warm when its `color.x`, wrapped into [0,1) and read as a hue in
degrees, is ≥330 or ≤80, and cool when it is between 160 and 280; hues in the
remaining bands count toward neither.

_(`arcade/tasteStore.ts:71-94` (`derivePaletteTemperature`))_

### REQ-AD-024 — A transform with no explicit `visible` still counts

Feature extraction shall treat a transform whose `visible` field is absent as
visible, since the schema's default is `true` and an agent-authored candidate
descriptor is never parsed through the schema before it reaches the taste store.

> **Known deviation:** `packages/app/src/arcade/tasteStore.ts:125` (`visible`) (and
> `:81` (`visible`) in `derivePaletteTemperature`) — both loops read `if (!t.visible)
continue`, so a candidate composed as plain JSON with no `visible` key yields
> `variationCategories: []` and `paletteTemperature: 'balanced'` for every
> transform. `director_propose` passes agent input through untouched
> (`webmcp/tools/arcadeDirector.ts:114-120`) and `normalizeCandidates` only
> replaces a flame that is missing transforms entirely (`:20-48` (`rawCandidates`)), so this is
> the normal shape of the tool's main input path. The sibling helper
> `calculateStructuralSymmetry` in `webmcp/tools/scoreFlame.ts` uses
> `(t.visible ?? true)`, so the two disagree about the same flame. Tracked in
> [docs/agent/BUGS.md](../agent/BUGS.md).

### REQ-AD-025 — A profile with no likes is empty, and says which kind of empty

**If** no stored record carries the reaction `like`, **then** the derived profile
shall report the real `totalRatings` / `likeCount` / `dislikeCount`, zeroed
averages, empty category lists and a `balanced` palette, with a summary that
distinguishes "No user taste data recorded yet." from
"`<n>` candidate(s) rated. No likes registered yet." — dislikes alone never
produce preferences.

_(`arcade/tasteStore.ts:234-250` (`likes`); the first branch guarded by
`tasteStore.test.ts:90-93` (`emptyProfile`).)_

### REQ-AD-026 — Preferred and avoided categories are frequency-ordered

The profile shall list as `preferredCategories` every variation category
appearing on any liked record, ordered by like frequency descending, and as
`avoidedCategories` only those categories whose dislike count strictly exceeds
their like count, ordered by dislike frequency descending. A category liked and
disliked equally often appears in neither list beyond its like-driven entry.

_(`arcade/tasteStore.ts:253-274` (`catLikeCount`))_

### REQ-AD-027 — Averages are taken over liked records only, to one decimal

The profile's `avgLikedSymmetry`, `avgLikedComplexity` and `avgLikedChaos` shall
be the means of those metrics across liked records only — never disliked or
neutral ones — each rounded to one decimal place.

_(`arcade/tasteStore.ts:276-295` (`avgLikedSymmetry`))_

### REQ-AD-028 — Preferred palette is a strict majority of the liked records

The profile's `preferredPalette` shall be `warm` when liked records with a warm
palette outnumber cool ones, `cool` in the mirror case, and `balanced` on a tie —
liked records whose own temperature is `balanced` count toward neither side.

_(`arcade/tasteStore.ts:297-304` (`warmCount`); guarded by `arcadeDirector.test.ts:160-170` (`updated`)
for the warm case.)_

### REQ-AD-029 — The summary is one sentence naming at most five signals

The profile summary shall name at most the three most-liked categories, at most
the two most-avoided ones, and shall always close with the liked symmetry and
complexity averages out of 10 and the preferred palette — so an agent that reads
nothing but `summary` still receives the direction.

_(`arcade/tasteStore.ts:306-331` (`summaryParts`). `avgLikedChaos` is computed and returned as a
field but is deliberately absent from the sentence.)_

### REQ-AD-030 — `director_get_taste_profile` reads the store, never the session

`director_get_taste_profile` shall derive its answer from the full persisted
rating history and shall return `{ ok: true, profile }` unconditionally — with no
workspace context, no open modal and no active generation required.

_(`arcadeDirector.ts:236-254` (`directorGetTasteProfile`); guarded by `arcadeDirector.test.ts:122-171` "retrieves aggregated taste profile",
which asserts the empty profile before any rating and the aggregated one after.)_

### REQ-AD-031 — `director_get_feedback` reads the session, never the store

`director_get_feedback` shall report the **live** generation only: per candidate
its index, rationale, reaction (`null` when unrated), tags, `wasSelected`,
fitness and freshly extracted features, plus a summary counting likes and
dislikes and naming the selected candidate. **If** no generation is active it
shall return `{ ok: true, generation: 0, candidates: [] }` with an explanatory
message rather than an error.

_(`arcadeDirector.ts:188-229` (`state`); guarded by `arcadeDirector.test.ts:70-120` "retrieves user feedback and extracted features".
Features are recomputed from the candidate flames on every call — the tool never
consults the persisted taste records, so a candidate rated in this session
appears here with its live reaction and in REQ-AD-030's profile independently.)_

### REQ-AD-032 — Breeding advances the generation from the first two selected

**When** the user clicks Breed Selected with at least two candidates checked, the
overlay shall breed the first two **in selection order** — not index order —
producing four children by uniform crossover at mutation strength 0.15, and shall
replace the state with `generation + 1`, `steeringPrompt` set to the current
prompt field, the four children scored by composite fitness, an empty selection,
and a bumped preview version so every thumbnail re-renders.

_(`DirectorOverlay.tsx:139-171` (`breedSelectedCandidates`); the button is disabled below two selections at
`:452-458` (`actionBtn`). Selection order comes from `:46-50` (`toggleSelect`), which appends.)_

### REQ-AD-033 — An impossible pairing yields an empty generation

**If** the two selected parents have mismatched `renderSettings.dimensions` or
neither carries any transform, **then** `breedFlames` shall return no children
rather than throwing inside the modal — and the overlay shall advance to the
next generation with an empty candidate grid.

_(`flame/breedFlame.ts:487-507` (`cfg`) and its comment about validation throwing inside
a modal; `DirectorOverlay.tsx:154-168` (`offspring`) applies the result unguarded, so the user
sees `Candidates (0)` and must reopen or re-propose. Guarded on the helper side
by `breedFlame.test.ts:257` "returns no children instead of throwing when parents differ"; the overlay's handling of the empty result is not.)_

### REQ-AD-034 — Mutate Best prefers a liked candidate over a fitter one

**When** the user clicks Mutate Best, the overlay shall pick the base flame by
`reactionBonus + fitness * 100`, where a Like adds 200 and a Dislike subtracts
200 — so any liked candidate outranks any unrated one and every unrated one
outranks a disliked one, regardless of fitness — resolving ties in favour of the
lowest index, and shall replace the state with `generation + 1` and four
mutations of that flame at strengths 0.2, 0.3, 0.4 and 0.5.

_(`DirectorOverlay.tsx:173-235` (`mutateTopCandidates`))_

### REQ-AD-035 — Evolving a generation does not itself rate anything

Breeding and mutating shall write no taste records: the outgoing generation's
reactions and tags leave the live state with it, and the profile keeps exactly
the records that the Like/Dislike and tag interactions already wrote.

_(`DirectorOverlay.tsx:160-168` (`setState`), `:227-232` (`setState`) — neither path calls
`recordCandidateFeedback`. Records for the outgoing generation survive in the
store under their own `cand-<generation>-<index>` keys, so within one session
generations do not collide; across sessions they do — REQ-AD-020.)_

### REQ-AD-036 — The session lives in memory; only the ratings outlive it

**While** the page is loaded, the director state — generation, candidates,
steering prompt and `lastFeedback` — shall live only in the workspace signals and
shall not be autosaved, so a reload starts the next open at a freshly seeded
generation 1; the taste records written during that session shall survive the
reload and continue to feed `director_get_taste_profile`.

_(`useWorkspaceArtDirector.tsx:27-30` (`createSignal`) — plain signals, no persistence; contrast
`arcade/tasteStore.ts:174-181` (`saveRatings`). The workspace flame itself is autosaved
separately, so a candidate loaded via REQ-AD-015 does survive a reload.)_

---

## Coverage gaps

Requirements with **no test that goes red when they are violated**:

| ID                             | What is unguarded                                                                     | Why                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| REQ-AD-003, 004, 005           | Modal lifecycle, the open-signal effect, generation-1 seeding                         | `useWorkspaceArtDirector.tsx` has no test file                                                                               |
| REQ-AD-011, 012, 013, 014, 015 | Rating capture, tag vocabulary, the flame-less guard, Load Candidate                  | `DirectorOverlay.tsx` has no test file                                                                                       |
| REQ-AD-032, 033, 034, 035      | Breed Selected, the empty-generation case, Mutate Best's scoring, no-rating-on-evolve | same                                                                                                                         |
| REQ-AD-036                     | Session state is not persisted                                                        | same                                                                                                                         |
| REQ-AD-008, 009                | Candidate repair and the flame-less fallback                                          | `arcadeDirector.test.ts` only ever passes well-formed flames from `createTestFlame`                                          |
| REQ-AD-017, 018, 019           | Storage read failure, write failure, the 100-record cap                               | `tasteStore.test.ts` never throws from storage and never stores more than two records                                        |
| REQ-AD-023, 024                | Palette hue bands and the margin of two; the implicit-`visible` deviation             | `tasteStore.test.ts:20` (`paletteTemperature`) only asserts the value is one of the three literals                           |
| REQ-AD-026, 027, 029           | Category ordering, liked-only averages, summary composition                           | `tasteStore.test.ts:114-118` (`profile`) asserts totals and a `'likes symmetry'` substring; no ordering or numeric assertion |
| REQ-AD-002 (partial)           | The Launch Art Director Overlay button                                                | `topics.test.ts` covers the presets and prompt card, not the panel                                                           |
| REQ-AD-001 (partial)           | `readOnlyHint` on the two read tools                                                  | `toolCount.test.ts` checks names against the docs table, not annotations                                                     |

Partially guarded, and worth knowing how thinly:

- **REQ-AD-006** — `arcadeDirector.test.ts:18-23` "refuses without workspace context" asserts only `toHaveProperty('error')`, so the two distinct refusal messages are interchangeable as far as the suite is concerned.
- **REQ-AD-020** — guarded since #90 by `tasteStore.test.ts:130` "keeps ratings from separate Director sessions that reuse generation numbers" and `:150` "still updates a rating in place within one session". `tasteStore.test.ts:64` (`entry1`) still expects `cand-1-0`, the id of a record written without a session id.
- **REQ-AD-021** — genuinely guarded by `tasteStore.test.ts:69-82` (`entry2`).
- **REQ-AD-007, 010, 030, 031** — genuinely guarded by `arcadeDirector.test.ts`.
