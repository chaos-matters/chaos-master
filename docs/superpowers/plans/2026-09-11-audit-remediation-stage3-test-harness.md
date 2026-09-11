# Stage 3: make test quality measurable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "is this tested?" from an opinion into a number, starting by killing the six mutants that proved the current suite cannot fail.

**Architecture:** Task 1 is the payload — six specific assertions, each verified against a specific one-line mutation. Tasks 2-6 are harness changes that stop the gap reopening. Task 1 is worth doing even if nothing else here ships.

**Tech Stack:** vitest + @vitest/coverage-v8, Playwright, GitHub Actions.

**Spec:** [docs/agent/TESTING.md](../../agent/TESTING.md) §1 and §4, [docs/agent/REFACTOR-PLAN.md](../../agent/REFACTOR-PLAN.md) Stage 3.

## Global Constraints

- **Never push to `upstream`.** **No Claude attribution.** **No emojis.**
- **Run `pnpm check`** from the repo root before declaring work finished.
- **Never verify WebGPU with `playwright test`** — the config forces swiftshader, which fakes device-loss crashes. Use `pnpm verify:webgpu`.
- Every assertion added here must be seen red under its mutation before it counts.

---

## Task 1: Kill the six surviving mutants

On 2026-09-10 six deliberate behaviour changes were applied across six subsystems and **every suite stayed green**. Each row below is the exact mutation, the file that should have caught it, and the command to run just that file.

| #   | Mutation                                                                                           | Suite that stayed green                                       |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | `utils/timeline.ts` — `const interp = next.interp ?? 'linear'` becomes `prev.interp ?? 'linear'`   | `utils/timeline.test.ts` (86 passed)                          |
| 2   | `webmcp/tools/scoreClashRound.ts` — `ownershipA > ownershipB + 0.01` becomes `- 0.01`              | `webmcp/tools/flameToolsModular.test.ts` (12 passed)          |
| 3   | `utils/audioAnalysis.ts` — drop `* mapping.sensitivity` from `mappingToVal`                        | `utils/audioAnalysisMappings.test.ts` (9 passed)              |
| 4   | `recorder/schema.ts` — delete `if (action.t < previousTime) return false`                          | `recorder/recorder.test.ts` (75 passed)                       |
| 5   | `hooks/useWorkspaceTimelineBinding.ts` — `camera3D.phi` fallback `Math.PI / 2` becomes `0`         | `hooks/useWorkspaceTimelineBinding.test.ts` (5 passed)        |
| 6   | `pages/Benchmarks/benchmarkResultBuilder.ts` — `lit >= 2 && max > 4` becomes `lit >= 1 && max > 4` | `pages/Benchmarks/benchmarkResultBuilder.test.ts` (15 passed) |

**Files:** the six test files above. No production changes.

For each of the six, in its own commit:

- [ ] **Step 1: Apply the mutation by hand** to the production file.
- [ ] **Step 2: Run the named test file.** Confirm it passes — this reproduces the audit finding and proves you have the right mutation.

```bash
pnpm --filter chaos-master exec vitest run <path from the table>
```

- [ ] **Step 3: Write the assertion that catches it.** Pin a value, do not check a bound. For #1, assert that a segment with `next.interp = 'constant'` and `prev.interp = 'linear'` holds the previous value at t=0.5 — a test that passes under both readings has not caught anything. For #4, assert that a session whose actions are out of order is **rejected**, which is the guard's entire purpose.
- [ ] **Step 4: Run the test with the mutation still applied. It must FAIL.** If it passes, the assertion is not specific enough — go back to step 3. This is the only step that matters.
- [ ] **Step 5: Revert the mutation** (`git checkout -- <production file>`) and confirm the test passes.
- [ ] **Step 6: Commit** the test alone, e.g.:

```bash
git add packages/app/src/utils/timeline.test.ts
git commit -m "test(timeline): catch a flipped interpolation owner

An audit mutation flipped which keyframe owns a segment's interp mode and all
86 tests in this file stayed green. This asserts the boundary value that
distinguishes the two readings."
```

**Acceptance for the whole task:** re-run all six mutations in one pass and confirm six failures. A script for that lives in the audit artefacts; re-deriving it is a few lines of Python.

---

## Task 2: Extend coverage to `packages/core`

`packages/core` holds the highest-risk untested code in the repo (2 test files against 1,996 source lines) and is excluded from the coverage run entirely, so its gap is invisible to the ratchet.

**Files:**

- Modify: `packages/core/vitest.config.ts`, root `package.json`, `scripts/code-metrics.mjs`

- [ ] **Step 1: Add a coverage block to `packages/core/vitest.config.ts`** mirroring the app's: `provider: 'v8'`, `all: true`, `include: ['src/**/*.ts']`, `exclude: ['src/**/*.test.ts']`, `reportsDirectory: 'coverage-audit'`, reporters `text-summary` and `json-summary`.
- [ ] **Step 2: Extend `test:coverage`** to run both packages.
- [ ] **Step 3: Teach `code-metrics.mjs` to read both summaries** and report core separately — `coverage_core_lines_pct` etc. Merging them into one number would let the app's mass hide core's gap, which is the opposite of the point.
- [ ] **Step 4: `pnpm metrics:update`**, and say in the commit message that new metrics appeared.
- [ ] **Step 5: Commit** — `test(core): measure core's coverage instead of hiding it`.

---

## Task 3: Move coverage config out of CLI flags

`test:coverage` is currently a ~300-character flag string, so an IDE run, a `vitest --ui` run and CI all measure different things.

**Files:**

- Modify: `packages/app/vitest.config.ts`, root `package.json`

- [ ] **Step 1: Move every `--coverage.*` flag into `test.coverage`** in the vitest config.
- [ ] **Step 2: Reduce the script to `vitest run --coverage`.**
- [ ] **Step 3: Confirm the numbers are unchanged** — run before and after, diff `coverage-summary.json`. A change here means the flags and the config disagreed, which is itself the bug.
- [ ] **Step 4: Exclude what cannot be meaningfully instrumented** — shader and generated-content modules — so the ratchet tracks testable code rather than shader volume. State the exclusion list in a comment with the reason.
- [ ] **Step 5: Commit** — `test: configure coverage in vitest config, not in a flag string`.

---

## Task 4: Split Playwright into a CI-safe project

Only `tests/smoke.spec.ts` runs in CI, so **12 of 13 specs are unenforced**. Three are actively misleading: one green-skips on a selector that stopped matching _during the audited range_, one fails unwatched, one asserts a deep link that no longer resolves.

**Files:**

- Modify: `playwright.config.ts`, root `package.json`, `.github/workflows/node.js.yml`
- Create: `tests/ci.fixture.ts`

- [ ] **Step 1: Add a `chromium-degraded` project** to the `projects` array with `testMatch: /\.ci\.spec\.ts$/`, alongside the existing `chromium`. It runs specs that do not depend on real GPU output.
- [ ] **Step 2: Point `test:e2e:ci` at that project** instead of the single smoke file.
- [ ] **Step 3: Fix the three lying specs first.** In particular `tests/documentation.spec.ts:20` calls `test.skip(!docsVisible, ...)` gated on a `Docs` button that existed at `v0.9.11` and no longer matches. **A spec that skips green is worse than no spec** — it reports success while testing nothing.
- [ ] **Step 4: Make an unexpected skip a failure.** A skip should be a deliberate, annotated decision, not a selector miss.
- [ ] **Step 5: Migrate GPU-independent specs** to `*.ci.spec.ts`, as many as possible. Verify each actually passes in the degraded project before moving it.
- [ ] **Step 6: Commit** — `test(e2e): a CI-safe Playwright project, and stop three specs from lying`.

---

## Task 5: Gate `packages/landing` in CI

Zero tests is a defensible choice for a marketing site. Zero typecheck and zero build is not: root `typecheck` covers core and app only, and the CI build step builds only `chaos-master`.

**Files:**

- Modify: root `package.json`, `.github/workflows/node.js.yml`

- [ ] **Step 1: Add landing to the root typecheck** and to the CI build.
- [ ] **Step 2: Run both; expect failures** — a package nothing has typechecked in months usually has some.
- [ ] **Step 3: Fix what they find, or record it.** Do not add `// @ts-expect-error` to get green.
- [ ] **Step 4: Commit** — `ci: typecheck and build the landing package`.

---

## Task 6: Derive the `uiCoverageRatchet` allowlist

`recorder/uiCoverageRatchet.test.ts` is the only guard over `MainWorkspace.tsx` (mounting it boots the WebGPU renderer, so it walks TypeScript ASTs over `?raw` imports). Its file list is hand-maintained and was widened twice — each time inside the very commit that made widening necessary.

**Files:**

- Modify: `packages/app/src/recorder/uiCoverageRatchet.test.ts`

- [ ] **Step 1: Derive the list** from the filesystem rather than a literal, so a new extraction is covered automatically.
- [ ] **Step 2: Assert the count does not grow** without an explicit baseline bump, matching the ratchet convention used by `code-metrics.mjs`.
- [ ] **Step 3: Confirm it still catches what it caught before** — remove a handler from a JSX prop by hand and check it goes red.
- [ ] **Step 4: Commit** — `test(recorder): derive the UI coverage allowlist instead of hand-maintaining it`.

---

## Task 7: Consider narrow mutation testing

Only after Tasks 1-6. Coverage says a line ran; it does not say an assertion would notice it changing — which is this repo's exact failure mode.

- [ ] **Step 1: Scope it narrowly.** Whole-tree mutation testing on 175k lines is a multi-hour job nobody will run. Target the pure logic in `packages/core` and `packages/app/src/utils` only.
- [ ] **Step 2: Decide honestly whether to keep it.** If the run takes longer than the team will tolerate, the manual six-mutant check from Task 1 repeated at each release is worth more than an automated job that gets disabled. Record the decision in `docs/agent/METRICS.md` either way — including "we chose not to", with the reason.

---

## Self-review notes

- **Task 1 is the deliverable.** Tasks 2-6 are worth doing, but if only one thing ships from this plan it should be the six assertions, because they convert a proven blind spot into a caught one.
- **Ordering:** Task 1 is independent. Tasks 2-3 pair naturally. Task 4 is the largest and can run in parallel with everything else.
- **Do not chase a coverage percentage.** The target is that a mutation gets caught, not that a number rises. See [METRICS.md](../../agent/METRICS.md) §3.
