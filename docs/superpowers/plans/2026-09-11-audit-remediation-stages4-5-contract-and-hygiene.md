# Stages 4 and 5: finish the contract, then tidy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the nine commitments the 2026-07 refactor strategy missed, and clear the cheap debt the audit measured.

**Architecture:** Stage 4 is unfinished refactor work, so each task must be behaviour-preserving and is only safe **after Stage 2's characterization net exists**. Stage 5 is mechanical and can start any time.

**Tech Stack:** SolidJS, vite, TypeGPU, vitest, dependency-cruiser.

**Spec:** [docs/agent/REFACTOR-PLAN.md](../../agent/REFACTOR-PLAN.md) Stages 4 and 5, [docs/agent/CODE-HEALTH.md](../../agent/CODE-HEALTH.md) for the measured numbers.

**Prerequisite:** Stage 2 (`2026-09-11-audit-remediation-stage2-characterization-net.md`). Every task in Stage 4 moves code that nothing currently pins. Doing it without the net repeats the mistake this whole audit documents.

## Global Constraints

- **Never push to `upstream`.** **No Claude attribution.** **No emojis** — use an SVG icon from `packages/app/src/icons/`, exported through `icons/index.ts`.
- **Run `pnpm check`** from the repo root before declaring work finished.
- **`pnpm metrics:check` must stay green.** If a change makes a tracked number worse, either fix it or run `pnpm metrics:update` and justify it in the commit message.
- CI is the authority on typecheck; a green local run is not conclusive.

---

# Stage 4 — the unfinished contract

## Task 1: Decide what `MainWorkspace.tsx` is actually for

Phase 1 promised "a clean shell under 500 lines". It is **4,133** — down 48% from 7,928, which is real, but 8.3x the target. It still holds the entire touch-layout JSX block.

**This task starts with a decision, not code.** Leaving a written commitment 8x missed is how a plan stops being believed; so is quietly deleting it. Pick one:

- **(a) Finish the decomposition.** Extract the touch-layout block, then whatever is next largest, until the shell is a composition root.
- **(b) Amend the target** in `docs/REFACTOR_AND_IMPROVEMENT_STRATEGY.md` to a number you will actually hold, with one sentence on why 500 was wrong.

- [ ] **Step 1: Get the decision from the user.**
- [ ] **Step 2 (if a): Extract the touch-layout JSX** into `components/TouchSurface/`, which already owns the touch chrome. Behaviour-preserving: no prop interface changes.
- [ ] **Step 3: Verify with the characterization net** plus `pnpm verify:webgpu` at 1920x1080, 768x1024 and 390x844, comparing against a pre-change run.
- [ ] **Step 4: `pnpm metrics:check`** — `largest_file_loc` and `files_over_1200` should improve.
- [ ] **Step 5: Commit.**

## Task 2: `WorkspaceModalsHost` renders none of its 15 modals

Workstream 1.1 named 15 modals to move out of `MainWorkspace`. `WorkspaceModalsHost.tsx` is 103 lines and renders `SpotlightTour`, `SoftwareVersion`, `PilotOverlay`, `DuelStage` and `ArenaOverlay` — none of the 15. The workstream is structurally unstarted.

- [ ] **Step 1: List where the 15 actually render now** — `grep -n` each name across `packages/app/src`.
- [ ] **Step 2: Move them into `WorkspaceModalsHost`**, one commit per two or three, wrapping non-critical ones in `lazy()`.
- [ ] **Step 3: After each batch, check the build output** for `dynamic import will not move module into another chunk`. That warning is how Task 3's defect was found.
- [ ] **Step 4: Verify each modal still opens** via `pnpm verify:webgpu` or by hand. A modal that silently stops mounting is the likely failure here, and no test would catch it — there is no test file for `lazyModals`.

## Task 3: Repair the two defeated lazy boundaries

`MainWorkspace.tsx:38` lazy-loads `DiffViewModal`, but `WorkspaceSidebar.tsx:5` imports `DiffViewContent` from the same module statically, so vite keeps it in the main chunk and says so at build time. `AudioWiringModal` (1,644 lines) has the identical problem via `AudioReactivePanel.tsx:5`.

- [ ] **Step 1: Capture the red state** — `pnpm --filter chaos-master run build 2>&1 | grep "will not move module"`. Expect two hits.
- [ ] **Step 2: Extract the shared piece** (`DiffViewContent`, and the equivalent for the audio modal) into its own module, so the heavy modal stays splittable. Re-point both importers.
- [ ] **Step 3: Rebuild; expect zero hits** and a `MainWorkspace` chunk below 844 KB.
- [ ] **Step 4: Commit** — `perf(bundle): stop a sibling's static import defeating two lazy modals`.

## Task 4: De-duplicate the five modules copied into `packages/core`

`easing.ts` and four others were **copied**, not moved. The core copies are byte-identical and imported by nothing, so a fix applied to one twin never reaches the other. Two of the copies are dead.

- [ ] **Step 1: Confirm each pair is still byte-identical** — `diff` them. If they have already diverged, that divergence is a defect: report which copy is live.
- [ ] **Step 2: Delete the app-side copy and re-export from core**, one module per commit.
- [ ] **Step 3: `pnpm arch` after each** — this is exactly the kind of change that introduces a cycle.
- [ ] **Step 4: Commit** — `refactor(core): re-export the shared maths instead of keeping twins`.

## Task 5: Measure whether Phase 2 actually improved startup

Phase 2 was "Code Splitting and Startup Optimization". The evidence is ambiguous: chunk composition changed a lot (`App` 1,459 KB → 331 KB, new 1,625 KB `ancestry` and 844 KB `MainWorkspace` chunks) but **the eager payload is 34 KB on both `v0.9.11` and `main`**, and total JS grew from 6.62 MB to 6.79 MB.

Chunk sizes cannot answer this. A runtime measurement can.

- [ ] **Step 1: Extend `scripts/verify-webgpu-headed.mjs`** to report bytes transferred until the first rendered frame, per route. It already collects `content-length` per response; the gap is that a dev server does not send it, so **run against a production preview build** (`pnpm --filter chaos-master e2e:serve`), not `pnpm start`.
- [ ] **Step 2: Measure `v0.9.11` and `main`** using the same script and the same route.
- [ ] **Step 3: Write the answer into `docs/agent/CODE-HEALTH.md` §6**, replacing the "cannot be answered from chunk sizes" note with the number.
- [ ] **Step 4: If startup got worse, say so plainly** and open it as a finding. A phase that missed its goal is worth knowing about.

## Task 6: Correct the strategy document's baseline table

It claims **39 WebMCP tools** where `v0.9.11` had **34** (`git show v0.9.11:packages/app/src/webmcp/tools/index.ts`, counting `allTools`), and **219 test files** where it had **201**.

- [ ] **Step 1: Fix both numbers**, with the command that derives each in a footnote.
- [ ] **Step 2: Add a line saying the table was corrected on 2026-09-11 and why.** A plan whose starting numbers are wrong cannot be used to judge whether it succeeded, and silently editing history is worse than the error.
- [ ] **Step 3: Commit** — `docs: correct the refactor strategy's baseline table`.

---

# Stage 5 — hygiene

Independent of everything above. Good work for a short session.

## Task 7: Add header comments

**989 of 1,060 source files have none (93%)**, so `pnpm docs:index` cannot describe most of the tree — a module with no header shows as `(no header comment)` in `INDEX.md`.

- [ ] **Step 1: Start with the ~94 entry points** that appear in `INDEX.md` as `(no header comment)`. Those have the highest leverage: each one is a module's front door.
- [ ] **Step 2: Write what the module is FOR, not what it is called.** `// Timeline utilities` above `timeline.ts` is noise. What it owns, what the invariant is, and what surprises a first-time reader is the valuable part.
- [ ] **Step 3: Regenerate and check** — `pnpm docs:index && pnpm docs:index:check`, and watch `missing_header_comment` fall in `pnpm metrics`.
- [ ] **Step 4: Commit in batches by area**, not one giant commit.

## Task 8: Fix the non-discriminating assertions

**117 of the 735 assertions added in the audited range (16%)** are satisfied by a null or an unchanged value. Three specific ones are named in `docs/agent/BUGS.md`: `ViewControls.test.tsx:42`, `ArenaOverlay.test.tsx:154-155`.

- [ ] **Step 1: Fix the three named ones first**, and for each confirm it now fails when the behaviour is broken.
- [ ] **Step 2: Sweep `ViewControls.test.tsx`** — 18 callback props are passed as `vi.fn()` and not one is asserted.
- [ ] **Step 3: Replace bounds with values** in `flame/stats.test.ts` and `webmcp/tools/arenaCombat.test.ts`, which compare the system to its own output.

## Task 9: Delete or wire `TabletSplitLayout`

It is dead code with a **passing test claiming coverage** of a layout no user can reach — the worst combination, because the test actively misleads.

- [ ] **Step 1: Confirm it is unreachable** — `pnpm arch` lists orphans; check the render path.
- [ ] **Step 2: Delete it and its test, or wire it up.** If deleting, say in the commit message what it was for, in case it was a half-finished feature.

## Task 10: Clear the remaining orphans

`pnpm arch` reports 8. All **predate the audited range**, so this is pre-existing debt, not something the refactor introduced. `App.integration.mock.tsx` is a test mock and a false positive — fix the config's exclude pattern rather than the file.

- [ ] **Step 1: For each, decide delete or wire.** `contexts/MobileContext.tsx` is the interesting one: the mobile work built a parallel mechanism in `workspaceLayoutStore` rather than using or removing it.
- [ ] **Step 2: Commit** — `chore: remove modules nothing imports`.

## Task 11: Reduce the worst complexity offenders

`commandPut` 39, `validateBenchmarkResult` 34, `commandSequence` 31, `asMutationOptions` 30, `flameComplexityError` 27.

- [ ] **Step 1: Only where it genuinely helps a reader.** Splitting a 30-complexity function into three mutually-dependent 10-complexity helpers improves every number and makes the code harder to follow. [METRICS.md](../../agent/METRICS.md) explains why complexity is tracked and not gated.
- [ ] **Step 2: The two `validateBenchmark*` functions are the best candidates** — validation code usually decomposes cleanly into per-field checks, and they sit on a path where being wrong means silently measuring the wrong thing.
- [ ] **Step 3: `pnpm metrics:check`** to confirm `eslint_complexity_warnings` fell (run with `--with-lint`).

---

## Self-review notes

- **Stage 4 needs Stage 2 first.** Every task moves code that nothing currently pins.
- **Task 1 and Task 5 both start with a question**, not an edit — the target line count and the startup measurement are decisions the user owns.
- **Stage 5 is genuinely parallel** and each task is independently shippable. Task 7 has the best ratio of effort to future benefit: it makes every later agent session cheaper.
