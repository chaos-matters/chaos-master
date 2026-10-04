# Testing

How the Lumen Apeiron monorepo is tested: what runs where, what each kind of
test is for, and how to run the browser tests without taking someone else's
port. The strategy behind it, and the audit that shaped it, is in
[docs/agent/TESTING.md](../../docs/agent/TESTING.md); the guards and the rules
for writing a test are in
[docs/agent/CONVENTIONS.md](../../docs/agent/CONVENTIONS.md) §6.

Counts are from 2026-09-23 at `9fc08078`.

## Which checks run where

Every pull request runs what main runs, since 2026-09-24. The jobs of
`.github/workflows/node.js.yml` run in parallel, so a pull request waits for
the slowest one rather than for the sum:

| Job         | What it runs                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`      | `pnpm lint`, then `pnpm metrics:check --lint-report=eslint-report.json`: the ratchet with the per-file caps and the `eslint_*` keys, read from the lint step's report                       |
| `typecheck` | `pnpm typecheck`                                                                                                                                                                            |
| `test`      | the full `pnpm test`, in four legs: the app suite in three vitest shards (`pnpm test:app --shard=N/3`), and `pnpm test:packages` (core, mobile-runtime and the `node --test` script suites) |
| `build`     | the app build, the landing build, then `pnpm test:e2e:ci`                                                                                                                                   |
| `citations` | `pnpm docs:cite`                                                                                                                                                                            |
| `health`    | `pnpm docs:index:check`, `pnpm metrics:check`, `pnpm arch`; on main and on a manual run, `pnpm test:coverage` first, for the `coverage_*` keys                                              |

`pnpm test` is exactly `pnpm test:packages && pnpm test:app`, so the four
legs together run what it runs. A new suite goes into one of those two
scripts, and CI picks it up.

**Locally, run the tests for what you touched, not the whole suite.** PR CI
runs the full suite, `health` and the CI-safe e2e on every push, so the full
run is its job, not your machine's. `pnpm test:changed` below picks the tests a
change can reach; a single file is
`pnpm --filter chaos-master exec vitest run <path>`.

### The scoped run, for local use

`pnpm test:pr` runs core and mobile-runtime in full — about 230 tests in five
seconds, nothing to gain by scoping them — plus the script suites, and
`pnpm test:changed` (`scripts/test-changed.mjs`), which selects the app's test
files as the union of:

1. **What the branch touched**, via `vitest --changed <base>`: every test file
   whose module graph reaches a changed file. The base is `origin/main` unless
   an argument or `TEST_CHANGED_BASE` names another.
2. **The always-on list** in `scripts/always-on-tests.mjs`: test files that
   reach their subject through `readFileSync`, `readdirSync` or
   `import.meta.glob` rather than an import. The module graph has no edge to
   what they check, so `--changed` can never select them —
   `ShellBar.module.test.ts` would sit out while `ShellBar.module.css` changed
   underneath it. Each entry carries the reason it is there.

Scoping switches off and the whole app suite runs when the branch touched the
harness itself: a `vite`/`vitest` config, a `package.json`, `pnpm-lock.yaml`, a
`tsconfig*.json`, `vitest.setup.*`, or the scoper itself —
`scripts/test-changed.mjs` and `scripts/always-on-tests.mjs`. A change to the
selection logic must not be validated by the very selection it changes.

### Writing a test that reads the source tree

Put it on the list. `scripts/always-on-tests.mjs` is data only, and
`src/alwaysOnTestList.test.ts` enforces it: it walks every app test file, flags
the ones using `readFileSync`, `readdirSync`, `globSync`, `readFile(`,
`fs.promises` or `import.meta.glob`, and fails unless each one is on `ALWAYS_ON`
or on `EXEMPT` with a written reason. A read made in a helper the test imports
counts as the test's: the detector follows imports of a `testUtils` module and
of any module under `src/test/`, by a relative path or the `@/` alias. So a
test that reads its stylesheet through `src/test/cssModule.ts`, the shared CSS
reader, is flagged like one that calls `readFileSync` itself. The failure names the file and says which
list to add it to, so you do not have to know any of this in advance — the test
tells you.

It guards the reverse too. Every entry carries a `genre`: `'filesystem'` means
the detector must still flag it, so narrowing the detector turns the guard red
instead of quiet; `'breadth'` marks an entry that is on the list for coverage
rather than for reading the tree. Reach for `EXEMPT` only when the module graph
genuinely does reach the test's subject.

### Cross-package changes

A change under `packages/core/src` or `packages/mobile-runtime/src` **does**
select the app tests that depend on it. Both packages resolve to TypeScript
source — core through the `@chaos-master/core` alias in `vitest.config.ts`,
mobile-runtime through the `exports` map in its `package.json` — so they are
ordinary nodes in the app's module graph rather than opaque `node_modules`
builds. Measured: a one-line change to `packages/core/src/diff/fdiff.ts`
selected **162** of 282 app test files, and one to
`packages/mobile-runtime/src/files.ts` selected **18**.

This is worth re-measuring if either package ever starts publishing `dist`
instead of source, or if the core alias is dropped: vitest's dependency walk
skips anything whose resolved path contains `node_modules`, and the cover would
disappear silently.

Run it:

```bash
pnpm test:changed                    # against origin/main
pnpm test:changed <commit-ish>       # against something else
node scripts/test-changed.mjs --dry-run   # print the selection, run nothing
```

### What a scoped run can miss

A scoped run is a bet that the module graph plus the always-on list covers
what a change can reach, and the bet is wrong sometimes: a test the graph does
not connect to the change, and that the always-on list does not name, is not
selected. Until 2026-09-24 CI made that bet on every pull request and main
found out after the merge. Now it is only a local shortcut: the pull
request's own CI runs the whole suite before anything merges.

---

## Unit tests: vitest

Every package tests with vitest, and every test file sits next to the code it
tests as `*.test.ts` or `*.test.tsx`: 334 files in `packages/app/src`, 16 in
`packages/core/src`, 3 in `packages/mobile-runtime`. The app's config
(`packages/app/vitest.config.ts`) runs them in happy-dom with the Solid plugin, so
components render in a test, and resolves `@chaos-master/core` to its source.

```bash
pnpm test                                        # everything, as CI runs it (leave it to CI)
pnpm test:pr                                     # scoped to what the branch touched, for local use
pnpm --filter chaos-master exec vitest run src/utils/timeline.test.ts   # one file
pnpm test:watch                                  # the app suite, watching
pnpm test:coverage                               # app and core, v8 coverage
```

The Node scripts have their own `node --test` suites:
`pnpm --filter chaos-master test:scripts` for `packages/app/scripts`, and
`pnpm test:scripts` for the root `scripts/` (the doc citation checker). Both
run inside `pnpm test` (in `pnpm test:packages`) and `pnpm test:pr`.

Coverage writes `coverage-audit/coverage-summary.json` in each package, which
`pnpm metrics` then reports; at `9fc08078` the app is at 53.22% of lines and
core at 84.89%. It is never run in CI ([docs/agent/METRICS.md](../../docs/agent/METRICS.md) §3).

## The ratchets and the test floors

`pnpm metrics:check` (the `health` job, on every pull request) compares
today's numbers with `docs/agent/code-metrics.baseline.json` and fails when one
got worse. Two of them are floors on the test suite: `test_files` (355) and
`test_cases` (3,153), both counted statically, so deleting tests fails the check even when
everything left is green. Others hold the size of the tree
(`largest_logic_file_loc`, `files_over_*`), header comments and coverage. A baseline only ever tightens, and by hand.
Run `pnpm test:coverage` before `pnpm metrics:update`: the update refuses to write a baseline that lacks a key
the old one tracked, and the coverage keys exist only after a coverage run.
`mainWorkspaceSize.test.ts` is a ratchet of the same kind that runs on every
pull request: `MainWorkspace.tsx` must have exactly the line count its entry in
`docs/agent/code-metrics.file-caps.json` names.

## Browser tests: Playwright

`tests/` holds Playwright only: the specs, their helpers (`helpers.ts`,
`pilotLock.ts`) and a reporter. Nothing in it is a unit test, and all of it is
type-checked by `pnpm typecheck` through `tests/tsconfig.json`. The headed-GPU
specs in `packages/app/e2e/` are type-checked the same way, through
`packages/app/e2e/tsconfig.json`. The config is the root `playwright.config.ts`.
It builds the app and serves the production
preview (`pnpm --filter chaos-master e2e:serve`, `vite preview --strictPort`
with a self-signed certificate, on `https://localhost:4273` unless `E2E_PORT`
says otherwise), then runs one of two projects, both on headless Chromium with
swiftshader standing in for a GPU:

| Project       | Specs                         | Runs                               | Today              |
| ------------- | ----------------------------- | ---------------------------------- | ------------------ |
| `chromium-ci` | `tests/*.ci.spec.ts`          | CI, every push; `pnpm test:e2e:ci` | 12 specs, 43 tests |
| `chromium`    | every other `tests/*.spec.ts` | only when someone runs it locally  | 9 specs, 32 tests  |

**Only `*.ci.spec.ts` runs in CI.** A spec in the `chromium` project is
effectively unenforced: nothing runs it for you, and several of its tests need
a real GPU to pass. A new spec should hold on the software adapter and be named
`*.ci.spec.ts`; if it cannot, say so in its header. In the CI project a skip
fails the run (`tests/reporters/failOnUnexpectedSkip.ts`) unless the test
carries an `intentional-skip` annotation with a reason.

Swiftshader is good enough to mount the app and drive its DOM, and bad at
everything a GPU does: it produces device-loss events that look like crashes.
**Never judge WebGPU behaviour from `playwright test`.** Use
`pnpm verify:webgpu` (`scripts/verify-webgpu-headed.mjs`), a headed Chrome
pass on real hardware against an already running server.

### Running e2e on a port of your own

Every run starts its own preview server, on port 4273 by default, and never
uses one it did not start. If the port is taken, Playwright stops with
`https://localhost:4273 is already used` instead of testing whatever answers
there. Until 2026-09-23 the config pinned 4173, vite preview's default, and
reused a server already listening on it, so a local run could quietly test a
person's own preview, built from another checkout.

Pick another port with `E2E_PORT`, for example when two runs share a machine or
4273 belongs to someone else:

```bash
# Builds the app, serves it on 4401, runs the CI project, stops the server.
E2E_PORT=4401 pnpm exec playwright test --project=chromium-ci

# One spec.
E2E_PORT=4401 pnpm exec playwright test --project=chromium-ci tests/smoke.ci.spec.ts
```

To iterate against a server you started yourself, build once, serve it on your
own port, and opt in to reusing it with `E2E_REUSE_SERVER=1`. It is ignored on
CI, which always starts a fresh server.

```bash
VITE_GA_ID= pnpm --filter chaos-master exec vite build
pnpm --filter chaos-master exec vite preview --port 4401 --strictPort &
E2E_PORT=4401 E2E_REUSE_SERVER=1 pnpm exec playwright test --project=chromium-ci
```

Stop the preview server by its PID or its port (`fuser -k 4401/tcp`) when you
are done, never by process name. An agent that opens a headed browser passes
`--class=agent-browser` so the window stays off the user's workspace.
