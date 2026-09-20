# Code metrics — what to measure, and what each number is worth

Companion to [CODE-HEALTH.md](CODE-HEALTH.md), which reports the numbers. This
document explains **why these metrics and not others**, and how much each one
deserves to be believed.

It exists because metrics go wrong in two opposite directions and both are
expensive. Take them too seriously and you get metric theatre: a dashboard
nobody acts on, a gate that gets disabled the week it turns red, and a
30-complexity function split into three mutually-dependent 10-complexity
helpers that improves every number while making the code harder to read.
Dismiss them entirely and you lose the only early warning available on a
175k-line codebase that no one person reads end to end.

The position taken here: **measure a lot, gate almost nothing, ratchet the
rest.**

```bash
pnpm metrics          # the table
pnpm metrics:json     # same, machine-readable
pnpm metrics:check    # ratchet: fail if a tracked number regressed
pnpm metrics:update   # re-freeze the baseline
```

---

## 1. The ratchet, and why it is not a threshold

`pnpm metrics:check` compares today against
`docs/agent/code-metrics.baseline.json` and fails **only when a tracked number
moved the wrong way**. It never asserts an absolute target.

An absolute threshold on a codebase this size has two failure modes and no
success mode. Set it where the code is today and it fires on the next honest
commit. Set it where you wish the code were and it is red from the day it lands,
so everyone learns to ignore a red check — which is strictly worse than having
no check, because it also devalues the checks that mean something.

A ratchet has neither problem. It is silent while things improve or hold, and it
speaks exactly once: when a change makes a tracked number worse. At that point
you either fix it or run `pnpm metrics:update` and **say why in the commit
message**. Re-freezing is a normal, allowed move — it just has to be a decision
someone made on purpose, in writing, rather than a number quietly drifting.

Metrics not listed as lower-is-better or higher-is-better in
`scripts/code-metrics.mjs` are **informational only** and never fail the check.

---

## 2. What each metric is worth

| Metric                             | Believe it?                   | What it is actually telling you                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_loc`, `source_files`       | Context, not quality          | Size of the thing. Useful only as a denominator. A refactor that grows LOC is not automatically bad — extracting a function costs a signature and an import.                                                                                                                                                |
| `mean_file_loc`                    | Weakly                        | Moves too slowly to guide a single change. Useful across a release.                                                                                                                                                                                                                                         |
| `files_over_500` / `800` / `1200`  | **Yes**                       | The god-file count. This is the metric the 2026-07 refactor strategy was written to move. Buckets rather than a mean because the tail is what hurts: one 4,000-line file costs more than fifty 300-line files.                                                                                              |
| `largest_file_loc`                 | **Yes**                       | A single number for "how bad is the worst case". Hard to game without genuinely splitting something.                                                                                                                                                                                                        |
| `test_files`, `test_cases`         | Directionally                 | `test_cases` is counted **statically** by matching `it(` / `test(` at line start. It undercounts parameterized suites — the real vitest total is meaningfully higher. That is fine for a ratchet, where consistency matters more than absolute accuracy, but do not quote it as "the number of tests".      |
| `test_file_ratio`                  | Weakly                        | Test files per source file. Catches a burst of new source with no new tests, which is the failure this repo actually had.                                                                                                                                                                                   |
| `coverage_*_pct`                   | **With care**                 | Only present when a coverage run has written `coverage-audit/coverage-summary.json`. Coverage proves a line _executed_, never that anything _asserted_ on it. Treat a drop as a real signal and a rise as a weak one. See §3.                                                                               |
| `coverage_core_*_pct`              | **With care**                 | `packages/core` on its own, from `packages/core/coverage-audit/`. Kept separate on purpose: merged into the app's number, core's gap disappears in the app's mass, which is how it went unmeasured until 2026-09.                                                                                           |
| `missing_header_comment`           | **Yes, and it is actionable** | Files whose first non-blank line is not a comment. This is the ceiling on how useful the generated index can be: a file with no header comment shows as `(no header comment)` in [INDEX.md](INDEX.md), so the map cannot describe it. Unlike most metrics, the fix is mechanical and always an improvement. |
| `todo_markers`                     | Weakly                        | `TODO`, `FIXME`, `XXX`, `HACK`. A rising count is worth a glance; the absolute number means little.                                                                                                                                                                                                         |
| `eslint_*` (opt-in, `--with-lint`) | **Yes**                       | Errors must stay zero. Warnings are almost all `complexity`, which is the honest measure of "would a reviewer be able to hold this function in their head". Off by default because a full type-aware lint takes over a minute.                                                                              |

---

## 3. Coverage, specifically

Coverage is the metric most likely to be misused here, so it gets its own
section.

**What it measures:** which lines the test process executed. That is all.

**What it does not measure:** whether any assertion depended on the result. A
test that renders a component and asserts nothing will mark the whole render
path as covered. The refactor work audited in 2026-09 shipped 139 new source
files with 27 new test files, and the honest question about those tests was
never "what percentage of lines ran" but "would any of them go red if the
behaviour changed".

**The honest check is mutation.** Change one line of a function on purpose —
flip a comparison, drop a guard, swap two arguments — and run the test that
claims to cover it. If it stays green, that coverage is decorative. This is
worth doing occasionally by hand on the functions that matter; it is not worth
automating across the whole tree.

**Decision (2026-09-11): automated for `packages/core` only, opt-in, not in
CI.** `pnpm mutation:core` runs Stryker over core's pure logic. Measured: 1,302
mutants in 34-41 s. Against core's two original test files the score is 17%
(222 killed, 441 survived, 639 never reached by any test); with the stage 2
characterization net (#92) it is 47% (611 killed, 305 survived, 386 unreached).
A run that short is one people will actually repeat, so it stays, and its
survivors are the to-do list: `flameSchema.ts` (113) and `fdiff.ts` (82) lead.

- **Not in CI.** The score is a direction, not a gate; the coverage ratchet
  already blocks a drop, and a gate on a 47% score would only invite tests
  written to kill mutants rather than to pin behaviour.
- **Not `packages/app/src/utils` yet.** Those tests run under happy-dom inside a
  2,500-test suite, and per-test coverage there is a different cost class.
  Measure it before adding it; do not assume core's 40 seconds carries over.
- **The hand check stays** for app code: the audit's six-mutant probe list,
  repeated at each release, is still the only mutation evidence for the app.

**Therefore:** a coverage _drop_ is a real signal and blocks via the ratchet. A
coverage _rise_ is weak evidence and should never be the argument that a change
is well tested.

Baseline at the time of writing: 45.72% lines, 37.61% functions, 43.73%
branches. Functions sitting ~8 points below lines is the interesting part — it
says a lot of code is reached incidentally through a few entry points rather
than exercised directly.

**What is excluded, and why.** The variation bodies under
`flame/variations/{simple,simple3D,parametric,parametric3D}` are `'use gpu'`
functions compiled to WGSL. The registry imports all of them, so ~2,700 of their
lines "ran" on import without any assertion reaching a shader. Counting them
measured shader volume, not tested code: with them in, the baseline read 46.92 /
35.8 / 46.4. The list lives in `packages/app/vitest.config.ts`, next to the
reason; extend it only with the same kind of argument.

---

## 4. What is deliberately not measured

- **A single "quality score".** Any composite hides the one number that moved.
- **Per-developer or per-agent attribution.** The point is to find code that
  needs work, not to rank who wrote it.
- **Duplication percentage.** Worth running by hand when you suspect it; too
  noisy to track continuously on a codebase with 148 variation modules that are
  legitimately similar to one another.
- **Cyclomatic complexity as a hard gate.** It is tracked as a warning count
  because the fix for a high-complexity function is frequently worse than the
  function. Read it, do not gate on it.

---

## 5. Adding a metric

Before adding one, answer: _what decision would this number change?_ If the
answer is "none, but it would be interesting", it belongs in a one-off report,
not in the ratchet. Every tracked metric is a thing that can fail CI, and a
check that fails for reasons nobody acts on is how the whole harness gets
switched off.

If it survives that question, add it to `scripts/code-metrics.mjs`, put it in
the right direction set (`LOWER_IS_BETTER` / `HIGHER_IS_BETTER`, or neither to
keep it informational), run `pnpm metrics:update`, and document it in the table
above.
