# Fork audit and agent documentation system — design

Date: 2026-09-10
Scope: audit `v0.9.11..main` on `Komediruzecki/chaos-master-fp`, then port the
mercurypitch agent-documentation system to this repo and produce a remediation
plan from the audit findings.

---

## 1. What is being audited

`v0.9.11` (`5dbde563`) to `main` (`a5c2f26f`): 39 commits, 253 files,
+33,990 / −14,541. Delivered as 11 squash-merged fork PRs.

| PR  | Branch                                   | Files | Diff         | Theme                                           |
| --- | ---------------------------------------- | ----: | ------------ | ----------------------------------------------- |
| #73 | `feat/architecture-refactor`             |   132 | +12471/−9050 | `@chaos-master/core` extraction, modularization |
| #74 | `feat/arcade-beats`                      |    16 | +1034/−13    | Beats mode, bundled audio, webmcp tools         |
| #75 | `feat/arcade-director`                   |    19 | +1375/−247   | Evolutionary art director mode                  |
| #76 | `feat/arcade-arena`                      |    29 | +4985/−683   | Arena mode, combat stats, champion export       |
| #77 | `feat/mobile-responsive-ui`              |    61 | +7529/−1317  | Mobile bottom surface, tablet split layout      |
| #78 | `refactor/decompose-main-workspace`      |    22 | +3070/−2211  | Phases 4–7: workspace, commands, recorder       |
| #79 | `feat/llms-txt-and-review-noindex`       |    11 | +300/−8      | `llms.txt`, review-deploy noindex               |
| #80 | `refactor/timeline-animation-engine`     |     3 | +1038/−599   | Phase 8: clash choreography, timeline           |
| #81 | `refactor/webmcp-tools-modularization`   |    13 | +1699/−955   | Phase 9: WebMCP tool decomposition              |
| #82 | `refactor/audio-analysis-modularization` |     3 | +605/−161    | Phase 10: modulation router                     |
| #83 | `refactor/benchmark-lab-decomposition`   |     5 | +1393/−806   | Phase 11: benchmark lab and runner              |

All 11 merged with **zero recorded reviews and zero review comments**. The PR
mechanism was used; the review was not. This is the reason the audit exists.

## 2. Grading spine

The agent wrote its own contract before starting:
`docs/REFACTOR_AND_IMPROVEMENT_STRATEGY.md` — a baseline metrics table measured
at `v0.9.11`, Phases 0–6 with numbered falsifiable targets, a risk matrix, and a
verification plan. Grading is against that document, not against taste.

Four evidence classes, in order of weight:

1. **Contract compliance** — every numbered target, scored target / actual /
   verdict. Already known to fail: Phase 1 promised `MainWorkspace.tsx` "under
   500 lines"; it is 4,133 (down from 7,928).
2. **Behavioural equivalence** — extracted code must preserve semantics.
   SolidJS reactivity is the sharp edge: props destructuring, inline ternary
   props read inside rAF loops, effects created outside an owner, missing
   `onCleanup`.
3. **Regression evidence** — the full local gate plus a headed WebGPU pass.
4. **Test honesty** — not line counts. Deliberate mutation of refactored
   functions, proving the suite goes red. A test that cannot fail is not
   coverage.

## 3. Execution

Three bounded workflows, two levels only (this session → workflow agents).
Agents are forbidden from spawning subagents and are read-only except where
noted.

- **W1 `fork-change-audit`** (12 agents): six subsystem lenses — workspace
  decomposition, arcade+webmcp, recorder/export/driver, timeline/audio,
  benchmarks/core/worker, mobile/docs/SEO. Each pipelines into one refutation
  pass over its high and medium findings. Refute-by-default; a finding survives
  only if a second agent read the code and confirmed it.
- **W2 `fork-test-audit`** (5 agents): coverage mapping of 139 added source
  files against 27 added test files, assertion-quality grading, e2e gap
  analysis; synthesised into a ranked test plan plus harness recommendations
  and six mutation-probe targets.
- **W3 `docs-system-port`**: adapts mercurypitch's generator to this monorepo
  and drafts EARS specs for the changed surfaces, informed by W1 and W2.

The **mutation probes are deliberately deferred** until the gate finishes.
They edit source files; running them concurrently with the gate would corrupt
its results.

Verification is run by the session, not delegated: the full CI gate
(`install, lint, typecheck, fmt, validate-wgsl, test, build, e2e:ci`), then a
one-off coverage measurement, then a standalone headed-Chrome WebGPU pass over
the arcade modes, the mobile and tablet layouts, and the export dialog.
Headed verification uses a standalone script, never `playwright test` — this
repo's Playwright config forces swiftshader, which produces fake device-loss
crashes.

## 4. Documentation system

A port of the mercurypitch pattern, chosen over PR #67's approach. #67
(`docs/coherence-map.json` + a staleness CLI) _detects_ documentation rot;
generation _prevents_ it. #67 is also conflicting and 39 commits stale. It is
superseded and closed.

```
AGENTS.md                       canonical agent instructions
CLAUDE.md                       pointer to AGENTS.md, so the two cannot drift
docs/agent/INDEX.md             generated module map, --check gated in CI
docs/agent/CONVENTIONS.md       measured conventions, each with its evidence count
docs/agent/MISTAKES.md          living log of what cost real time
docs/agent/TESTING.md           test strategy and what runs where
docs/agent/METRICS.md           why these metrics, and what each is worth
docs/agent/CODE-HEALTH.md       measured state, hotspots, ranked problems
docs/agent/BUGS.md              audit findings, with CONFIRMED/REFUTED status
docs/agent/REFACTOR-PLAN.md     the remediation backlog
docs/agent/code-metrics.baseline.json
docs/specs/*.ears.md            EARS requirements, each citing Source and Tests
scripts/gen-agent-index.mjs     --check fails CI when the index is stale
scripts/code-metrics.mjs        --check is a RATCHET against the baseline
```

Two design commitments carried over from mercurypitch:

- **The index cannot rot.** Its tables are generated from the filesystem, with
  blurbs harvested from each file's leading comment block. Hand-written prose
  lives outside `BEGIN:GENERATED` markers and survives regeneration. A module
  whose blurb reads `(no header comment)` is telling you to fix the file, not
  the index.
- **Metrics ratchet, they do not threshold.** `metrics:check` compares against
  a frozen baseline and complains only about regressions. Absolute gates on a
  codebase this size either never fire or are red forever, and both teach
  people to ignore them.

EARS specs cover the surfaces this range changed, plus a template and a ranked
backlog for the rest. Each spec carries `**Source:**` and `**Tests:**` blocks —
which is what replaces #67's hand-maintained coherence map.

## 5. Landing

Three PRs cut off `feat/fork-audit-docs-index-41856d`, as a train:

| PR  | Branch                     | Contents                                                                                                                                      |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `feat/agent-docs-harness`  | `AGENTS.md`, `CLAUDE.md`, `docs/agent/{INDEX,CONVENTIONS,TESTING,METRICS,MISTAKES}.md`, both scripts, coverage tooling, `pnpm arch`, CI gates |
| B   | `feat/agent-audit-report`  | `docs/agent/{CODE-HEALTH,BUGS,DOCS-AUDIT,REFACTOR-PLAN}.md`, `docs/specs/*.ears.md` + template                                                |
| C   | `feat/remediation-backlog` | The ranked fix plan the implementing agent executes                                                                                           |

PRs #30, #66, #69 and #72 are explicitly out of scope.

## 6. Accepted risks

Static review of a 34k-line diff will miss defects. The mitigation is the
mutation probes and the headed run, not more reading. The headed WebGPU pass is
manual and non-repeatable; what was checked gets written into
`docs/agent/TESTING.md` so it is at least reproducible by hand. Coverage
tooling adds a dependency; if it is not wanted permanently, the baseline is
measured once and the dependency dropped before PR A.
